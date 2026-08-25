"""Katalog hit veya router kararı — Opus'u atla.

Sıra: tam eşleşme → deterministik tuzak/clarify → Haiku classify.
Haiku SQL yazmaz. Opus yolu effort=high kalır (değiştirilmez).
"""

from __future__ import annotations

import logging

from langchain.agents.middleware import ModelResponse, wrap_model_call
from langchain_core.messages import AIMessage

from router.classify import apply_route, classify, normalize_decision, prefilter_route
from templates.catalog import match_template
from templates.match import TemplateSpec
from tools.sql_query import execute_guarded_sql

logger = logging.getLogger("locus.agent.fast_path")


def _is_human(msg: object) -> bool:
    kind = getattr(msg, "type", None)
    if kind in ("human", "user"):
        return True
    return type(msg).__name__ == "HumanMessage"


def _message_text(msg: object) -> str:
    content = getattr(msg, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and isinstance(block.get("text"), str):
                parts.append(str(block["text"]))
            else:
                text = getattr(block, "text", None)
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return str(content or "")


def _last_human_if_turn_start(request: object) -> str | None:
    messages = getattr(request, "messages", None) or []
    if not messages:
        return None
    last = messages[-1]
    if not _is_human(last):
        return None
    text = _message_text(last).strip()
    return text or None


def _model_response(text: str, model_name: str | None = None) -> ModelResponse:
    name = model_name or "claude-haiku-4-5"
    meta = {"model_name": name, "model_provider": "anthropic"}
    return ModelResponse(result=[AIMessage(content=text, response_metadata=meta)])


async def _resolve_spec(text: str) -> tuple[TemplateSpec | str | None, str | None]:
    """Spec veya hazır metin, ve varsa model adı. None spec = Opus."""
    spec = match_template(text)
    if spec is not None:
        logger.info("fast-path exact %s", spec.template_id)
        return spec, "claude-haiku-4-5"

    used: str | None = None
    decision = prefilter_route(text)
    if decision is None:
        decision = await classify(text)
        if decision.route != "opus":
            used = "claude-haiku-4-5"
    else:
        decision = normalize_decision(text, decision)
        logger.info("fast-path prefilter route=%s", decision.route)

    action = apply_route(decision)
    if action.kind == "text" and action.text:
        logger.info("fast-path canned %s", decision.route)
        return action.text, used or "claude-haiku-4-5"
    if action.kind == "spec" and isinstance(action.spec, TemplateSpec):
        logger.info("fast-path route template_id=%s", action.spec.template_id)
        return action.spec, used or "claude-haiku-4-5"
    return None, None


@wrap_model_call
async def fast_path(request, handler):
    text = _last_human_if_turn_start(request)
    if not text:
        return await handler(request)

    resolved, model_name = await _resolve_spec(text)
    if resolved is None:
        return await handler(request)
    if isinstance(resolved, str):
        return _model_response(resolved, model_name)

    spec = resolved
    outcome = execute_guarded_sql(spec.sql)
    try:
        answer = spec.render(outcome)
    except Exception:
        logger.exception("fast-path render %s", spec.template_id)
        return await handler(request)
    if not (answer or "").strip():
        return await handler(request)
    return _model_response(answer, model_name)
