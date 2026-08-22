"""Yazma işlemleri — Locus'un mevcut Next.js API route'ları üzerinden.

Agent veritabanına DOĞRUDAN yazmaz. Bunun yerine uygulamanın kendi
endpoint'lerini çağırır; böylece mevcut validasyon, iş kuralları ve audit
davranışı tek yerde kalır (frontend/app/api/**).

Kimlik doğrulama: /api/sync/panorama'daki CRON_SECRET deseninin aynısı —
Authorization: Bearer <AGENT_API_SECRET>.
"""

from __future__ import annotations

import os

import httpx
from langchain.tools import tool

_BASE_ENV = "LOCUS_API_BASE"
_SECRET_ENV = "AGENT_API_SECRET"
_TIMEOUT = 15.0


def _config() -> tuple[str, str] | None:
    base = os.environ.get(_BASE_ENV, "").rstrip("/")
    secret = os.environ.get(_SECRET_ENV, "")
    return (base, secret) if base and secret else None


def _post(path: str, payload: dict) -> str:
    cfg = _config()
    if cfg is None:
        return (
            f"YAPILANDIRMA HATASI: {_BASE_ENV} ve {_SECRET_ENV} tanımlı olmalı "
            "(agent/.env)."
        )
    base, secret = cfg
    try:
        response = httpx.post(
            f"{base}{path}",
            json=payload,
            headers={"Authorization": f"Bearer {secret}"},
            timeout=_TIMEOUT,
        )
    except httpx.RequestError as err:
        return f"BAĞLANTI HATASI: {err}"

    if response.status_code == 401:
        return "YETKİSİZ (401): AGENT_API_SECRET geçersiz."
    if response.status_code >= 400:
        return f"HATA {response.status_code}: {response.text[:300]}"
    return f"Başarılı: {response.text[:300]}"


@tool(parse_docstring=True)
def musteri_notu_ekle(musteri_kodu: str, not_metni: str) -> str:
    """Bir müşteriye serbest metin not ekler (entity_notlar).

    Kullanıcı açıkça not eklemeni istediğinde kullan. Kendi analizini
    kendiliğinden not olarak kaydetme — bu kalıcı ve başkalarına görünür
    bir yazma işlemidir.

    Args:
        musteri_kodu: Müşteri kodu (ör. "100000246").
        not_metni: Kaydedilecek not.
    """
    if not musteri_kodu.strip() or not not_metni.strip():
        return "HATA: musteri_kodu ve not_metni boş olamaz."
    # Sözleşme: frontend/app/api/notlar/route.ts POST (action=create)
    return _post(
        "/api/notlar",
        {
            "action": "create",
            "entity_kind": "musteri",
            "musteri_kodu": musteri_kodu.strip(),
            "metin": not_metni.strip(),
        },
    )


@tool(parse_docstring=True)
def musteri_favori_toggle(musteri_kodu: str) -> str:
    """Müşteriyi "Sonra bak" favori listesine ekler veya listeden çıkarır.

    Bu bir AÇ/KAPA işlemidir: müşteri listede değilse ekler, listedeyse
    çıkarır. Mevcut durumu bilmiyorsan önce kullanıcıya sor.

    Args:
        musteri_kodu: Müşteri kodu (ör. "100000246").
    """
    if not musteri_kodu.strip():
        return "HATA: musteri_kodu boş olamaz."
    # Sözleşme: frontend/app/api/musteri/favori/route.ts POST (action=toggle)
    return _post(
        "/api/musteri/favori",
        {"action": "toggle", "musteri_kodu": musteri_kodu.strip()},
    )
