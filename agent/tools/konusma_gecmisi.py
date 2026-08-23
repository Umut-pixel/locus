"""Geçmiş asistan konuşmaları — kullanıcı amacı ve sohbet bağlamı.

Sohbet gövdesi `agent_konusmalar` / `agent_konusma_mesajlari` tablolarında.
Bu araç LLM'in yazdığı SQL değil; parametreli okuma. Limitler bağlamı
taşırmaz. Aktif thread LangGraph checkpointer'da zaten durur; burası
*diğer* konuşmalar ve uzun vadeli niyet için.
"""

from __future__ import annotations

import os
from typing import Any

import psycopg
from langchain.tools import tool
from psycopg.rows import dict_row

_DSN_ENV = "AGENT_DB_URL"
_LIST_LIMIT = 25
_MSG_LIMIT = 40
_MSG_CHARS = 4000


def _dsn() -> str | None:
    return os.environ.get(_DSN_ENV)


def _clip(text: str, n: int) -> str:
    t = text.strip()
    if len(t) <= n:
        return t
    return t[: n - 1] + "…"


@tool(parse_docstring=True)
def konusma_gecmisi(islem: str = "liste", konusma_id: str = "") -> str:
    """Kayıtlı asistan konuşmalarını listeler veya birinin tam metnini okur.

    Kullanıcının önceki soruları, yarım kalan analizler ve tekrar eden
    amaçlar burada. "Daha önce bakmıştık", "o raporu aç", "aynı müşteriye
    dön" gibi göndermelerde VE yeni bir analiz planlamadan önce çağır.

    Args:
        islem: "liste" (özetler) veya "oku" (bir konuşmanın mesajları).
        konusma_id: "oku" için konuşma UUID'si. "liste"de boş bırak.
    """
    dsn = _dsn()
    if not dsn:
        return (
            f"YAPILANDIRMA HATASI: {_DSN_ENV} tanımlı değil. "
            "Konuşma geçmişi okunamıyor."
        )

    op = (islem or "liste").strip().lower()
    if op not in {"liste", "oku"}:
        return 'islem "liste" veya "oku" olmalı.'

    try:
        with psycopg.connect(dsn, row_factory=dict_row, connect_timeout=10) as conn:
            conn.read_only = True
            with conn.cursor() as cur:
                if op == "liste":
                    cur.execute(
                        """
                        select id, baslik, ozet, mesaj_sayisi, guncelleme
                        from agent_konusmalar
                        order by guncelleme desc
                        limit %s
                        """,
                        (_LIST_LIMIT,),
                    )
                    rows = cur.fetchall()
                    return _format_liste(rows)

                kid = konusma_id.strip()
                if not kid:
                    return "oku için konusma_id gerekli. Önce islem=liste çağır."
                cur.execute(
                    """
                    select id, baslik, ozet, mesaj_sayisi, guncelleme
                    from agent_konusmalar
                    where id = %s
                    """,
                    (kid,),
                )
                head = cur.fetchone()
                if not head:
                    return f"Konuşma bulunamadı: {kid}"
                cur.execute(
                    """
                    select sira, rol, metin, alinti, olusturulma
                    from agent_konusma_mesajlari
                    where konusma_id = %s
                    order by sira asc
                    limit %s
                    """,
                    (kid, _MSG_LIMIT),
                )
                msgs = cur.fetchall()
                return _format_oku(head, msgs)
    except psycopg.errors.InsufficientPrivilege as err:
        return f"YETKİ HATASI: {err}"
    except psycopg.Error as err:
        return f"SQL HATASI: {err}"


def _format_liste(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "Kayıtlı konuşma yok."
    lines = [
        f"{len(rows)} konuşma (yeniden eskiye). "
        "Amaç/bağlam için ozet'e bak; tam metin için islem=oku + konusma_id."
    ]
    for row in rows:
        ozet = (row.get("ozet") or "").strip() or "—"
        lines.append(
            f"- id={row['id']} | {row['baslik']} | "
            f"{row['mesaj_sayisi']} mesaj | {row['guncelleme']}\n"
            f"  amaç: {_clip(str(ozet), 280)}"
        )
    return "\n".join(lines)


def _format_oku(head: dict[str, Any], msgs: list[dict[str, Any]]) -> str:
    parts = [
        f"Konuşma: {head['baslik']} ({head['id']})",
        f"Amaç özeti: {(head.get('ozet') or '—').strip()}",
        f"Mesaj: {len(msgs)}/{head['mesaj_sayisi']}",
        "",
    ]
    for m in msgs:
        rol = m["rol"]
        body = _clip(str(m["metin"] or ""), _MSG_CHARS)
        alinti = (m.get("alinti") or "").strip()
        block = f"[{m['sira']}] {rol}: {body}"
        if alinti:
            block += f"\n  (alıntı: {_clip(alinti, 240)})"
        parts.append(block)
    return "\n".join(parts)
