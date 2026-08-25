"""Kullanıcı metnini kilitli şablona eşle — trim, TR fold, tam veya slot."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Protocol


class QueryOutcome(Protocol):
    ok: bool
    message: str
    rows: list[dict[str, Any]]


RenderFn = Callable[[QueryOutcome], str]


@dataclass(frozen=True)
class TemplateSpec:
    template_id: str
    sql: str
    render: RenderFn


QUOTE_MARK = "Alıntı:"
QUOTE_MARK_SP = "Alıntı :"

# Home yaş bant etiketleri en-dash (U+2013) kullanır.
_DASHES = str.maketrans({"\u2013": "-", "\u2014": "-", "\u2212": "-"})

ILCE_RE = re.compile(
    r"^(.+?)\s+teslimat ve borç durumu nedir\??\s*$",
    re.IGNORECASE,
)
SEVK_RE = re.compile(
    r"^(.+?)\s+son sevkiyatları nedir\??\s*$",
    re.IGNORECASE,
)
BAND_RE = re.compile(
    r"^(\d+\s*-\s*\d+|70\+)\s+gün gecikme bandındaki açık bakiye nedir\??\s*$",
    re.IGNORECASE,
)
# evals/tasks/il-filtresi.md tam cümlesi
SEHIR_OZET_RE = re.compile(
    r"^(.+?)(?:[''`´]deki|deki)\s+müşterilerin\s+toplam\s+açık\s+bakiyesi\s+ve\s+cirosu\s+ne\??\s*$",
    re.IGNORECASE,
)


def tr_fold(text: str) -> str:
    t = text.translate(_DASHES)
    t = t.replace("İ", "i").replace("I", "ı")
    t = " ".join(t.casefold().split())
    return t


def tr_upper(text: str) -> str:
    """Türkçe I/İ — Postgres C locale `upper('i')` = I, BALIKESİR bozulur."""
    return text.replace("i", "İ").replace("ı", "I").upper()


def is_quoted_prompt(text: str) -> bool:
    return QUOTE_MARK in text or QUOTE_MARK_SP in text


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"
