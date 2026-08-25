"""Anthropic prompt-cache kullanımını logla (cache_read / cache_creation)."""

from __future__ import annotations

import logging

from langchain.agents.middleware import wrap_model_call

logger = logging.getLogger("locus.agent.cache")


def _usage_from(result: object) -> dict:
    msg = getattr(result, "result", result)
    if isinstance(msg, list) and msg:
        msg = msg[-1]
    usage = getattr(msg, "usage_metadata", None)
    if isinstance(usage, dict):
        return usage
    return {}


@wrap_model_call
async def log_prompt_cache(request, handler):
    result = await handler(request)
    try:
        usage = _usage_from(result)
        details = usage.get("input_token_details")
        if not isinstance(details, dict):
            details = {}
        logger.info(
            "LLM tokens in=%s out=%s cache_read=%s cache_create=%s",
            usage.get("input_tokens"),
            usage.get("output_tokens"),
            details.get("cache_read") or details.get("cache_read_tokens") or 0,
            details.get("cache_creation")
            or details.get("cache_creation_tokens")
            or 0,
        )
    except Exception:
        logger.debug("cache usage okunamadı", exc_info=True)
    return result
