"""Yazma işlemleri — Locus'un mevcut Next.js API route'ları üzerinden.

Agent veritabanına DOĞRUDAN yazmaz. Bunun yerine uygulamanın kendi
endpoint'lerini çağırır; böylece mevcut validasyon, iş kuralları ve audit
davranışı tek yerde kalır (frontend/app/api/**).

Kimlik doğrulama: /api/sync/panorama'daki CRON_SECRET deseninin aynısı —
Authorization: Bearer <AGENT_API_SECRET>.

Tüm istekler ASYNC (httpx.AsyncClient). rapor_cek ve rota_taslagi_olustur
15-90 sn sürebiliyor (Next route'un kendi n8n/Google zaman aşımı); senkron
httpx.post kullansaydı bu süre boyunca paylaşılan executor thread havuzunu
işgal eder, aynı havuzu kullanan diğer tüm sohbetlerin sql_query gibi
senkron tool'ları da beklemek zorunda kalırdı — "bir sohbette rapor
çekilirken diğer sohbetler açılmıyor" belirtisinin sebebi buydu.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
from langchain.tools import tool

_BASE_ENV = "LOCUS_API_BASE"
_SECRET_ENV = "AGENT_API_SECRET"
_TIMEOUT = 15.0
# Plan kurma araç başına bir Google Routes çağrısı yapıyor; 15 sn yetmiyor.
_PLAN_TIMEOUT = 90.0


def _config() -> tuple[str, str] | None:
    base = os.environ.get(_BASE_ENV, "").rstrip("/")
    secret = os.environ.get(_SECRET_ENV, "")
    return (base, secret) if base and secret else None


async def _istek(path: str, payload: dict, timeout: float) -> tuple[Any, str | None]:
    """(gövde, hata) döndürür. Hata varsa gövde None."""
    cfg = _config()
    if cfg is None:
        return None, (
            f"YAPILANDIRMA HATASI: {_BASE_ENV} ve {_SECRET_ENV} tanımlı olmalı "
            "(agent/.env)."
        )
    base, secret = cfg
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base}{path}",
                json=payload,
                headers={"Authorization": f"Bearer {secret}"},
            )
    except httpx.RequestError as err:
        return None, f"BAĞLANTI HATASI: {err}"

    if response.status_code == 401:
        return None, "YETKİSİZ (401): AGENT_API_SECRET geçersiz."
    if response.status_code >= 400:
        # Route'lar hatayı {"error": "..."} olarak veriyor; kullanıcıya
        # gösterilebilir bir cümle çıkar.
        try:
            mesaj = response.json().get("error")
        except ValueError:
            mesaj = None
        return None, f"HATA {response.status_code}: {mesaj or response.text[:300]}"

    try:
        return response.json(), None
    except ValueError:
        return response.text[:300], None


async def _post(path: str, payload: dict) -> str:
    govde, hata = await _istek(path, payload, _TIMEOUT)
    if hata is not None:
        return hata
    metin = govde if isinstance(govde, str) else json.dumps(govde, ensure_ascii=False)
    return f"Başarılı: {metin[:300]}"


@tool(parse_docstring=True)
async def musteri_notu_ekle(musteri_kodu: str, not_metni: str) -> str:
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
    return await _post(
        "/api/notlar",
        {
            "action": "create",
            "entity_kind": "musteri",
            "musteri_kodu": musteri_kodu.strip(),
            "metin": not_metni.strip(),
        },
    )


@tool(parse_docstring=True)
async def musteri_favori_toggle(musteri_kodu: str) -> str:
    """Müşteriyi "Sonra bak" favori listesine ekler veya listeden çıkarır.

    Bu bir AÇ/KAPA işlemidir: müşteri listede değilse ekler, listedeyse
    çıkarır. Mevcut durumu bilmiyorsan önce kullanıcıya sor.

    Args:
        musteri_kodu: Müşteri kodu (ör. "100000246").
    """
    if not musteri_kodu.strip():
        return "HATA: musteri_kodu boş olamaz."
    # Sözleşme: frontend/app/api/musteri/favori/route.ts POST (action=toggle)
    return await _post(
        "/api/musteri/favori",
        {"action": "toggle", "musteri_kodu": musteri_kodu.strip()},
    )


# ---------------------------------------------------------------------------
# Rota planlama
# ---------------------------------------------------------------------------


def _durak_satiri(sira: int, d: dict) -> dict:
    """Haritaya ve tabloya yetecek en küçük alan kümesi."""
    return {
        "sira": sira,
        "kod": d.get("musteriKodu"),
        "unvan": d.get("unvan"),
        "kg": d.get("kg"),
        "lat": d.get("lat"),
        "lon": d.get("lon"),
        "ilce": d.get("ilce"),
    }


@tool(parse_docstring=True)
async def rota_taslagi_olustur(gun_penceresi: int | None = None) -> str:
    """Bekleyen siparişlerden araç rota planı TASLAĞI kurar. Hiçbir şey kaydetmez.

    Yükü çıkabilecek araçlara dağıtır, her aracın duraklarını trafiğe göre
    sıraya dizer ve sonucu döndürür. Plan HENÜZ KAYDEDİLMEZ — sonucu
    kullanıcıya harita ve durak tablosu olarak göster, sonra kaydedip
    kaydetmeyeceğini sor. Onay gelirse `rota_taslagi_kaydet` çağır.

    Dönen `taslak_id` kaydetme adımında gerekli; yanıtında kullanıcıya
    gösterme ama kaybetme.

    Args:
        gun_penceresi: Havuza kaç günlük sipariş girsin (ör. 30). Boş
            bırakılırsa bekleyen tüm siparişler.
    """
    payload: dict[str, Any] = {}
    if gun_penceresi is not None:
        payload["gunPenceresi"] = int(gun_penceresi)

    govde, hata = await _istek("/api/rota/otomatik", payload, _PLAN_TIMEOUT)
    if hata is not None:
        return hata
    if not isinstance(govde, dict):
        return f"BEKLENMEYEN YANIT: {str(govde)[:300]}"

    planlar = []
    for p in govde.get("planlar", []):
        duraklar = p.get("duraklar", [])
        planlar.append(
            {
                "arac": p.get("aracAd"),
                "aracKod": p.get("aracKod"),
                "sofor": p.get("soforAd"),
                "durakSayisi": len(duraklar),
                "kgDoluluk": p.get("kgDoluluk"),
                "sureSn": p.get("googleSureSn"),
                "mesafeM": p.get("googleMesafeM"),
                "duraklar": [
                    _durak_satiri(i + 1, d) for i, d in enumerate(duraklar)
                ],
            }
        )

    ozet = {
        "taslak_id": govde.get("taslakId"),
        "ozet": govde.get("ozet"),
        "planlar": planlar,
    }
    hatalar = govde.get("optimizeHatalari") or {}
    if hatalar:
        ozet["siralanamayan"] = hatalar

    return json.dumps(ozet, ensure_ascii=False)


@tool(parse_docstring=True)
async def rota_taslagi_kaydet(taslak_id: str) -> str:
    """Onaylanan rota taslağını kalıcı olarak kaydeder.

    YIKICI: aynı gün + aynı araç için önceden kaydedilmiş plan SİLİNİP
    yeniden yazılır. Yalnızca kullanıcı taslağı gördükten sonra açıkça
    "kaydet" dediğinde çağır. Kendiliğinden çağırma.

    Args:
        taslak_id: `rota_taslagi_olustur` sonucundaki taslak_id.
    """
    if not taslak_id.strip():
        return "HATA: taslak_id boş olamaz."
    # Sözleşme: frontend/app/api/rota/plan/route.ts POST { taslakId }
    return await _post("/api/rota/plan", {"taslakId": taslak_id.strip()})


# ---------------------------------------------------------------------------
# Panorama rapor çekimi
# ---------------------------------------------------------------------------

_SYNC_PATH = "/api/sync/panorama/manual"


@tool(parse_docstring=True)
async def rapor_listesi() -> str:
    """Panorama'dan çekilebilecek raporların listesini döndürür.

    Hiçbir şey tetiklemez. Kullanıcıya seçim kartı basmadan önce bunu çağır —
    rapor adlarını ve anahtarlarını ezberden yazma, listedekileri kullan.
    """
    govde, hata = await _istek(_SYNC_PATH, {"listele": True}, _TIMEOUT)
    if hata is not None:
        return hata
    return json.dumps(govde, ensure_ascii=False)


@tool(parse_docstring=True)
async def rapor_cek(rapor_anahtarlari: list[str] | None = None) -> str:
    """Seçilen raporları Panorama'dan yeniden çeker.

    Kullanıcı hangi raporları istediğini SÖYLEMEDİYSE çağırma — önce
    `kind: "secim"` kartı bas, kullanıcı işaretlesin. Kart zaten çekimi
    kendisi başlatır; bu aracı yalnızca kullanıcı raporları açıkça
    saydığında kullan ("stok ve tahsilatı çek" gibi).

    Çekim dakikalar sürer ve arka planda ilerler; bu araç yalnız başlatır.

    Args:
        rapor_anahtarlari: `rapor_listesi` içindeki anahtarlar
            (ör. ["stok", "tahsilat"]). Boş bırakılırsa hepsi çekilir.
    """
    payload: dict[str, Any] = {}
    if rapor_anahtarlari:
        temiz = [a.strip() for a in rapor_anahtarlari if a and a.strip()]
        if not temiz:
            return "HATA: rapor_anahtarlari boş dizi olamaz."
        payload["reportIds"] = temiz

    govde, hata = await _istek(_SYNC_PATH, payload, _TIMEOUT)
    if hata is not None:
        return hata
    return f"Çekim başlatıldı: {json.dumps(govde, ensure_ascii=False)[:400]}"
