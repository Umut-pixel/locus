"""Niyet sınıflandırıcı — araçsız Haiku JSON, fail-open Opus."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path

from templates.catalog import build_spec
from templates.match import TemplateSpec, is_quoted_prompt, tr_fold

from router import replies
from router.schema import (
    ALLOWED_CLARIFY,
    ALLOWED_ROUTES,
    ALLOWED_SLOTS,
    CLASSIFIER_MODEL,
    CLASSIFY_MAX_TOKENS,
    CLASSIFY_TIMEOUT_S,
    LONG_TEXT_CHARS,
    TEMPLATE_IDS,
    CLARIFY_RISK,
    Decision,
    OOS,
    OPUS,
    RouteAction,
)

logger = logging.getLogger("locus.agent.router")

_PROMPT_PATH = Path(__file__).resolve().parent / "prompt.md"
_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

_JSON_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)

# net_ciro şablonu KDV hariç; çıplak ciro / dahil / brüt Opus'ta kalır.
_NET_CIRO_OK = re.compile(r"hari[cç]", re.IGNORECASE)
_WRITE = re.compile(
    r"\b(not\s+ekle|favori|kaydet|sil|drop|truncate|insert|update|delete)\b",
    re.IGNORECASE,
)
_INJECTION = (
    "sistem prompt",
    "sistem promptunu",
    "pg_read_file",
    "drop table",
    "önceki talimat",
    "onceki talimat",
    "artık serbestsin",
    "artik serbestsin",
    "ignore previous",
    "auth.users",
)
_OPUS_HINT = re.compile(
    r"neden|trend|geçen yıl|gecen yil|karşılaştır|karsilastir|nasıl hesap",
    re.IGNORECASE,
)
_RISK_FOLDS = frozenset(
    {
        tr_fold("Riskli müşterilerimi listele"),
        tr_fold("Riskli müşterileri listele"),
        tr_fold("riskli müşterilerimi göster"),
    }
)

# Şablon yok ≠ veri yok. Bu iğneler Locus'ta var; oos konservesini ez.
_IN_SCOPE_NEEDLES = (
    "stok",
    "ürün",
    "urun",
    "sipariş",
    "siparis",
    "sevk",
    "ciro",
    "borç",
    "borc",
    "müşteri",
    "musteri",
    "depo",
    "marka",
    "skt",
    "fatura",
    "belge",
    "satılan",
    "satilan",
    "satış",
    "satis",
    "satıldı",
    "satildi",
    "mama",
)
# Gerçek kapsam dışı — ciro kelimesi geçse bile oos kalır (rakip cirosu).
_EXPLICIT_OOS_NEEDLES = (
    "rakip",
    "kredi notu",
    "maaş",
    "maas",
    "competitor",
    "salary",
    "çalışan",
    "calisan",
)
_PRODUCTISH = re.compile(
    r"ürün|urun|stok|satılan|satilan|satıldı|satildi",
    re.IGNORECASE,
)
_SKTISH = re.compile(r"skt|son kullanma", re.IGNORECASE)
_DOMAIN_NEEDLES: dict[str, tuple[str, ...]] = {
    "urun": (
        "ürün",
        "urun",
        "satılan",
        "satilan",
        "satıldı",
        "satildi",
        "marka",
        "sku",
        "mama",
    ),
    "stok": ("stok", "depo"),
    "siparis": ("sipariş", "siparis"),
    "sevk": ("sevk",),
    "ciro": ("ciro",),
    "borc": ("borç", "borc", "yaşlandır", "yaslandir"),
    "musteri": ("müşteri", "musteri"),
    "skt": ("skt", "son kullanma"),
    "fatura": ("fatura",),
}


def _folded_has(folded: str, needles: tuple[str, ...]) -> bool:
    return any(tr_fold(n) in folded for n in needles)


def _in_scope(text: str) -> bool:
    return _folded_has(tr_fold(text), _IN_SCOPE_NEEDLES)


def _explicit_oos(text: str) -> bool:
    return _folded_has(tr_fold(text), _EXPLICIT_OOS_NEEDLES)


def _domain_hits(text: str) -> frozenset[str]:
    folded = tr_fold(text)
    return frozenset(
        name
        for name, needles in _DOMAIN_NEEDLES.items()
        if _folded_has(folded, needles)
    )


def _compound_query(text: str) -> bool:
    return len(_domain_hits(text)) >= 2


def prefilter_route(text: str) -> Decision | None:
    """Haiku öncesi kilit: eval + güvenlik. None = classify et."""
    raw = (text or "").strip()
    if not raw:
        return OPUS
    if is_quoted_prompt(raw):
        return OPUS
    if len(raw) > LONG_TEXT_CHARS:
        return OPUS
    folded = tr_fold(raw)
    if folded in _RISK_FOLDS:
        return CLARIFY_RISK
    if any(tr_fold(p) in folded for p in _INJECTION):
        return OPUS
    if _WRITE.search(raw):
        return OPUS
    if _OPUS_HINT.search(raw):
        return OPUS
    if _compound_query(raw):
        return OPUS
    return None


def parse_decision(raw: str) -> Decision:
    blob = (raw or "").strip()
    if not blob:
        return OPUS
    fence = _JSON_FENCE.search(blob)
    if fence:
        blob = fence.group(1).strip()
    try:
        data = json.loads(blob)
    except json.JSONDecodeError:
        start, end = blob.find("{"), blob.rfind("}")
        if start < 0 or end <= start:
            return OPUS
        try:
            data = json.loads(blob[start : end + 1])
        except json.JSONDecodeError:
            return OPUS
    if not isinstance(data, dict):
        return OPUS
    route = str(data.get("route") or "").strip().lower()
    if route not in ALLOWED_ROUTES:
        return OPUS
    tid = data.get("template_id")
    template_id = str(tid).strip() if tid else None
    slots_raw = data.get("slots") if isinstance(data.get("slots"), dict) else {}
    slots = {
        str(k): str(v).strip()
        for k, v in slots_raw.items()
        if str(k) in ALLOWED_SLOTS and str(v).strip()
    }
    ck = data.get("clarify_key")
    clarify_key = str(ck).strip().lower() if ck else None
    return Decision(
        route=route,  # type: ignore[arg-type]
        template_id=template_id or None,
        slots=slots,
        clarify_key=clarify_key or None,
    )


def normalize_decision(text: str, decision: Decision) -> Decision:
    """Tuzaklar: çıplak ciro / sahte oos / şablon kaçırma → opus."""
    if decision.route == "template":
        tid = decision.template_id or ""
        if tid not in TEMPLATE_IDS:
            return OPUS
        if tid == "net_ciro" and not _NET_CIRO_OK.search(text):
            return OPUS
        if tid == "top_ciro_5" and _PRODUCTISH.search(text):
            return OPUS
        if tid == "skt_yaklasan" and not _SKTISH.search(text):
            return OPUS
        if tid in {"ilce_teslimat_borc", "son_sevk", "sehir_ozet", "yas_bant"}:
            needed = {
                "ilce_teslimat_borc": ("ilce", "sehir"),
                "son_sevk": ("kim", "unvan", "musteri"),
                "sehir_ozet": ("sehir", "ilce"),
                "yas_bant": ("band",),
            }[tid]
            if not any(decision.slots.get(k) for k in needed):
                return OPUS
        return decision
    if decision.route == "clarify":
        if (decision.clarify_key or "risk") not in ALLOWED_CLARIFY:
            return OPUS
        return Decision(route="clarify", clarify_key="risk")
    if decision.route == "oos":
        if _explicit_oos(text):
            return OOS
        if _in_scope(text) or _compound_query(text):
            return OPUS
        return OOS
    return OPUS


def apply_route(decision: Decision) -> RouteAction:
    if decision.route == "clarify":
        return RouteAction(kind="text", text=replies.CLARIFY_RISK)
    if decision.route == "oos":
        return RouteAction(kind="text", text=replies.OOS)
    if decision.route == "template":
        spec = build_spec(decision.template_id or "", decision.slots)
        if spec is None or not isinstance(spec, TemplateSpec):
            return RouteAction(kind="opus")
        return RouteAction(kind="spec", spec=spec)
    return RouteAction(kind="opus")


def _anthropic_model_id() -> str:
    return CLASSIFIER_MODEL.split(":", 1)[-1]


async def _haiku_json(text: str) -> str:
    """LangChain'siz HTTP — wrap_model_call callback'ine yazılmaz."""
    import os

    import httpx

    key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY yok")
    async with httpx.AsyncClient(timeout=CLASSIFY_TIMEOUT_S) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": _anthropic_model_id(),
                "max_tokens": CLASSIFY_MAX_TOKENS,
                "temperature": 0,
                "system": _PROMPT,
                "messages": [{"role": "user", "content": text}],
            },
        )
        response.raise_for_status()
        body = response.json()
    parts: list[str] = []
    for block in body.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text") or ""))
    return "".join(parts)


async def classify(text: str) -> Decision:
    """Haiku JSON. Hata/timeout → opus. LangChain ainvoke yok."""
    try:
        raw = await asyncio.wait_for(_haiku_json(text), timeout=CLASSIFY_TIMEOUT_S)
        out = normalize_decision(text, parse_decision(raw))
        logger.info(
            "classify route=%s template_id=%s",
            out.route,
            out.template_id,
        )
        return out
    except Exception:
        logger.info("classify fail-open opus", exc_info=True)
        return OPUS
