"""Guarded SQL tool — agent'ın veriye tek okuma kapısı.

Akış:  SQL üret → sql_guard.validate_sql() → locus_agent_ro ile çalıştır → sonuç
Yazma bu yoldan YAPILAMAZ; bkz. tools/locus_actions.py.
"""

from __future__ import annotations

import decimal
import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any

import psycopg
from langchain.tools import tool
from psycopg.rows import dict_row

from tools.sql_guard import SqlGuardError, validate_sql

# Bu connection string locus_agent_ro rolüne bağlı kullanıcıya ait olmalı.
# Service-role veya postgres kullanıcısı KOYMA — tüm güvenlik modeli buna dayanıyor.
_DSN_ENV = "AGENT_DB_URL"

# Tek yanıtta modele gönderilecek maksimum karakter — bağlamı taşırmamak için.
_MAX_RESULT_CHARS = 20_000


def _jsonable(value: Any) -> Any:
    """Postgres tiplerini JSON'a çevir (Decimal, UUID, tarih dahil)."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, decimal.Decimal):
        # Para tutarları: float'a çevirmek hassasiyet kaybettirir, string tut.
        return str(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time):
        return value.isoformat()
    if isinstance(value, timedelta):
        return value.total_seconds()
    if isinstance(value, (bytes, memoryview)):
        return "<binary>"
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    return str(value)


@dataclass
class GuardedQueryOutcome:
    """sql_guard + DB sonucunun hem araç hem fast-path için ortak biçimi."""

    ok: bool
    message: str
    rows: list[dict[str, Any]] = field(default_factory=list)
    sql: str = ""
    relations: tuple[str, ...] = ()
    limit: int | None = None


def execute_guarded_sql(sql: str) -> GuardedQueryOutcome:
    """SQL'i doğrula ve locus_agent_ro ile çalıştır. Guard atlanmaz."""
    try:
        guarded = validate_sql(sql)
    except SqlGuardError as err:
        return GuardedQueryOutcome(
            ok=False,
            message=f"SORGU REDDEDİLDİ: {err}\n\nSQL'i düzeltip tekrar dene.",
        )

    dsn = os.environ.get(_DSN_ENV)
    if not dsn:
        return GuardedQueryOutcome(
            ok=False,
            sql=guarded.sql,
            relations=guarded.relations,
            limit=guarded.limit,
            message=(
                f"YAPILANDIRMA HATASI: {_DSN_ENV} tanımlı değil. "
                "agent/.env dosyasına locus_agent_ro bağlantı dizesini ekle."
            ),
        )

    try:
        with psycopg.connect(dsn, row_factory=dict_row, connect_timeout=10) as conn:
            # Sürücü seviyesinde de read-only — rol ayarına ek güvence.
            conn.read_only = True
            with conn.cursor() as cur:
                cur.execute(guarded.sql)  # type: ignore[arg-type]
                rows = cur.fetchall()
    except psycopg.errors.InsufficientPrivilege as err:
        return GuardedQueryOutcome(
            ok=False,
            sql=guarded.sql,
            relations=guarded.relations,
            limit=guarded.limit,
            message=f"YETKİ HATASI: {err}\nBu kaynağa erişim yok. Başka bir view dene.",
        )
    except psycopg.errors.QueryCanceled:
        return GuardedQueryOutcome(
            ok=False,
            sql=guarded.sql,
            relations=guarded.relations,
            limit=guarded.limit,
            message=(
                "ZAMAN AŞIMI (10sn): Sorgu çok ağır. Filtre ekle, tarih aralığını "
                "daralt veya agregasyon kullan."
            ),
        )
    except psycopg.Error as err:
        return GuardedQueryOutcome(
            ok=False,
            sql=guarded.sql,
            relations=guarded.relations,
            limit=guarded.limit,
            message=f"SQL HATASI: {err}\n\nSorguyu düzeltip tekrar dene.",
        )

    payload = [{k: _jsonable(v) for k, v in row.items()} for row in rows]
    if not payload:
        return GuardedQueryOutcome(
            ok=True,
            rows=[],
            sql=guarded.sql,
            relations=guarded.relations,
            limit=guarded.limit,
            message=(
                f"Sonuç yok (0 satır).\nÇalıştırılan SQL: {guarded.sql}\n\n"
                "Filtreler fazla dar olabilir — kontrol et."
            ),
        )

    try:
        body = json.dumps(payload, ensure_ascii=False, indent=1, default=str)
    except (TypeError, ValueError) as err:
        return GuardedQueryOutcome(
            ok=False,
            sql=guarded.sql,
            relations=guarded.relations,
            limit=guarded.limit,
            message=(
                f"SQL HATASI: Sonuç JSON'a çevrilemedi ({err}). "
                "Daha az kolon seçip tekrar dene."
            ),
        )

    truncated = ""
    if len(body) > _MAX_RESULT_CHARS:
        body = body[:_MAX_RESULT_CHARS]
        truncated = (
            "\n\n[SONUÇ KISALTILDI — daha az kolon seç veya agregasyon kullan]"
        )

    return GuardedQueryOutcome(
        ok=True,
        rows=payload,
        sql=guarded.sql,
        relations=guarded.relations,
        limit=guarded.limit,
        message=(
            f"{len(rows)} satır (limit {guarded.limit}).\n"
            f"Kaynak: {', '.join(guarded.relations)}\n"
            f"SQL: {guarded.sql}\n\n{body}{truncated}"
        ),
    )


@tool(parse_docstring=True)
def sql_query(sql: str) -> str:
    """Locus veritabanında salt-okunur SQL sorgusu çalıştırır.

    Yalnız SELECT çalışır ve yalnız izin verilen view/tablolara erişilebilir
    (musteriler_rapor, v_panorama_*, urun_skt, musteri_metrik_gecmis,
    agent_konusmalar). Ham tablolara ve sistem şemalarına erişim yoktur.

    Kolon anlamları ve iş kuralları için önce schema_lookup kullan.
    Özellikle "ciro" sorulduğunda hangi kolonun doğru olduğunu kontrol et.

    Args:
        sql: Çalıştırılacak PostgreSQL SELECT sorgusu.
    """
    return execute_guarded_sql(sql).message
