"""Türkçe sayı / para ve locus tablo çiti."""

from __future__ import annotations

import json
from decimal import ROUND_HALF_UP, Decimal
from typing import Any


def as_decimal(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        return Decimal(int(value))
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        return Decimal(str(value))
    return Decimal(str(value))


def as_int(value: Any) -> int:
    return int(as_decimal(value).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _grouped(int_digits: str) -> str:
    sign = ""
    if int_digits.startswith("-"):
        sign = "-"
        int_digits = int_digits[1:]
    if int_digits == "":
        int_digits = "0"
    parts: list[str] = []
    while int_digits:
        parts.append(int_digits[-3:])
        int_digits = int_digits[:-3]
    return sign + ".".join(reversed(parts))


def format_number(value: Any) -> str:
    return _grouped(str(as_int(value)))


def format_try(value: Any, *, kurus: bool = False) -> str:
    d = as_decimal(value)
    if not kurus:
        whole = as_int(d)
        sign = "-" if whole < 0 else ""
        return f"{sign}₺{_grouped(str(abs(whole)))}"
    d = d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "-" if d < 0 else ""
    d = abs(d)
    text = f"{d:.2f}"
    whole, frac = text.split(".")
    return f"{sign}₺{_grouped(whole)},{frac}"


def locus_table(columns: list[str], rows: list[list[str]]) -> str:
    payload = {"kind": "table", "columns": columns, "rows": rows}
    return "```locus\n" + json.dumps(payload, ensure_ascii=False, indent=2) + "\n```"


def maybe_table(
    columns: list[str], rows: list[list[str]], *, fallback: str
) -> str:
    if len(rows) >= 3:
        return fallback + "\n\n" + locus_table(columns, rows)
    return fallback
