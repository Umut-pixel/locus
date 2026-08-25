"""Sınıflandırıcı sözleşme — Haiku SQL yazmaz, yalnız rota seçer."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from templates.catalog import ALLOWED_TEMPLATE_IDS

Route = Literal["template", "clarify", "oos", "opus"]
ActionKind = Literal["spec", "text", "opus"]

# agent.py FAST_MODEL ile aynı — agent import döngüsünü kırma.
CLASSIFIER_MODEL = "anthropic:claude-haiku-4-5"
CLASSIFY_TIMEOUT_S = 2.0
CLASSIFY_MAX_TOKENS = 200
LONG_TEXT_CHARS = 500

ALLOWED_ROUTES: frozenset[str] = frozenset({"template", "clarify", "oos", "opus"})
ALLOWED_SLOTS: frozenset[str] = frozenset({"ilce", "sehir", "kim", "band", "unvan", "musteri"})
ALLOWED_CLARIFY = frozenset({"risk"})


@dataclass(frozen=True)
class Decision:
    route: Route
    template_id: str | None = None
    slots: dict[str, str] = field(default_factory=dict)
    clarify_key: str | None = None


@dataclass(frozen=True)
class RouteAction:
    kind: ActionKind
    spec: object | None = None
    text: str | None = None


OPUS = Decision(route="opus")
CLARIFY_RISK = Decision(route="clarify", clarify_key="risk")
OOS = Decision(route="oos")

# Şablon id'leri catalog.ALLOWED_TEMPLATE_IDS — tek kaynak.
TEMPLATE_IDS = ALLOWED_TEMPLATE_IDS
