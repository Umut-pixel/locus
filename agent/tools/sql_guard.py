"""SQL validator — agent'ın ürettiği SQL'i çalıştırmadan önce doğrular.

Bu, savunmanın İKİNCİ katmanı. Asıl sınır `locus_agent_ro` Postgres rolü
(bkz. sql/agent_readonly_role.sql): rol zaten read-only ve yalnız seçili
view'lara SELECT hakkı var. Buradaki kontroller o rolün önüne konan erken
uyarı — validator'daki bir açık tek başına veri kaybına yol açamaz.
"""

from __future__ import annotations

from dataclasses import dataclass

import sqlglot
from sqlglot import exp

# Agent'ın görebileceği view'lar. sql/agent_readonly_role.sql'deki GRANT
# listesiyle AYNI olmalı — biri değişirse diğeri de değişmeli.
ALLOWED_RELATIONS: frozenset[str] = frozenset(
    {
        "musteriler_rapor",
        "musteriler_harita",
        "v_panorama_belge_detay_raporu_guncel",
        "v_panorama_sevkiyat_raporu_kup_guncel",
        "v_panorama_acik_fatura_vade_kup_guncel",
        "v_panorama_detayli_stok_raporu_guncel",
        "v_panorama_siparis_durum_raporu_guncel",
        "urun_skt",
        "musteri_metrik_gecmis",
        "rapor_bolge_disi_ozet",
    }
)

DEFAULT_ROW_LIMIT = 1000

# Yazma / şema değişikliği / yetki ifadeleri — tespit edilirse reddedilir.
_FORBIDDEN_NODES: tuple[type[exp.Expression], ...] = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Drop,
    exp.Create,
    exp.Alter,
    exp.TruncateTable,
    exp.Grant,
    exp.Into,  # SELECT ... INTO yeni_tablo — Postgres'te tablo OLUŞTURUR
    exp.Command,  # CALL, VACUUM, SET, COPY, ... — sqlglot bunları Command'a düşürür
)

# Dosya sistemi / ağ / oturum erişimi olan Postgres fonksiyonları.
_FORBIDDEN_FUNCTION_PREFIXES: tuple[str, ...] = (
    "pg_read_file",
    "pg_read_binary_file",
    "pg_ls_dir",
    "pg_stat_file",
    "pg_sleep",
    "pg_terminate_backend",
    "pg_cancel_backend",
    "pg_reload_conf",
    "lo_import",
    "lo_export",
    "dblink",
    "copy",
    "set_config",
    "current_setting",
    "query_to_xml",
)

# Sistem şemaları — sızıntı yüzeyi.
_FORBIDDEN_SCHEMAS: frozenset[str] = frozenset(
    {"pg_catalog", "information_schema", "pg_toast", "auth", "storage", "vault"}
)


class SqlGuardError(ValueError):
    """SQL politikayı ihlal etti. Mesaj agent'a geri beslenir."""


@dataclass(frozen=True)
class GuardResult:
    sql: str
    """Çalıştırılmaya hazır, LIMIT'i garanti edilmiş SQL."""
    relations: tuple[str, ...]
    limit: int


def _bare_name(name: str) -> str:
    return name.split(".")[-1].strip('"').lower()


def validate_sql(raw_sql: str, *, max_rows: int = DEFAULT_ROW_LIMIT) -> GuardResult:
    """SQL'i doğrula ve normalize et.

    Args:
        raw_sql: Agent'ın ürettiği ham SQL.
        max_rows: Zorunlu üst satır sınırı.

    Returns:
        Çalıştırılabilir SQL + kullanılan tablolar.

    Raises:
        SqlGuardError: Politika ihlalinde. Mesaj agent'a düzeltme için verilir.
    """
    if not raw_sql or not raw_sql.strip():
        raise SqlGuardError("Boş SQL.")

    try:
        statements = sqlglot.parse(raw_sql, read="postgres")
    except Exception as err:  # sqlglot ParseError ve türevleri
        raise SqlGuardError(f"SQL ayrıştırılamadı: {err}") from err

    statements = [s for s in statements if s is not None]
    if len(statements) == 0:
        raise SqlGuardError("Çalıştırılabilir ifade bulunamadı.")
    if len(statements) > 1:
        raise SqlGuardError(
            f"Tek seferde yalnız 1 sorgu çalıştırılabilir ({len(statements)} bulundu). "
            "Noktalı virgülle birden fazla ifade gönderme."
        )

    stmt = statements[0]

    # 1) Yalnız SELECT (CTE'li SELECT dahil).
    if not isinstance(stmt, (exp.Select, exp.Union, exp.Subquery)):
        raise SqlGuardError(
            f"Yalnız SELECT sorgularına izin var ({type(stmt).__name__} gönderildi). "
            "Veri değiştirme işlemleri SQL üzerinden yapılamaz."
        )

    # 2) Yazma / DDL düğümü var mı (CTE içine gizlenmiş olabilir).
    for node_type in _FORBIDDEN_NODES:
        found = stmt.find(node_type)
        if found is not None:
            raise SqlGuardError(
                f"Yasak ifade: {node_type.__name__.upper()}. Yalnız okuma yapılabilir."
            )

    # 3) Tehlikeli fonksiyonlar.
    for func in stmt.find_all(exp.Anonymous, exp.Func):
        fname = (getattr(func, "name", "") or "").lower()
        if any(fname.startswith(p) for p in _FORBIDDEN_FUNCTION_PREFIXES):
            raise SqlGuardError(f"Yasak fonksiyon: {fname}()")

    # 4) Tablo allowlist'i + sistem şeması kontrolü.
    used: set[str] = set()
    cte_names = {
        _bare_name(cte.alias_or_name) for cte in stmt.find_all(exp.CTE)
    }
    for table in stmt.find_all(exp.Table):
        schema = (table.text("db") or "").lower()
        if schema in _FORBIDDEN_SCHEMAS:
            raise SqlGuardError(f"Sistem şemasına erişim yasak: {schema}")
        name = _bare_name(table.name)
        if not name or name in cte_names:
            continue  # CTE referansı, gerçek tablo değil
        if name not in ALLOWED_RELATIONS:
            allowed = ", ".join(sorted(ALLOWED_RELATIONS))
            raise SqlGuardError(
                f"'{name}' erişilebilir değil. İzin verilen kaynaklar: {allowed}"
            )
        used.add(name)

    if not used:
        raise SqlGuardError("Sorgu izin verilen kaynakların hiçbirini kullanmıyor.")

    # 5) LIMIT'i zorla — agent unutursa bağlamı taşıran sonuç dönmesin.
    effective_limit = max_rows
    existing = stmt.args.get("limit")
    if existing is not None:
        try:
            requested = int(existing.expression.name)
            effective_limit = min(requested, max_rows)
        except (AttributeError, ValueError):
            effective_limit = max_rows
    stmt.set("limit", exp.Limit(expression=exp.Literal.number(effective_limit)))

    # 6) Yorumları temizle — hem audit log'u okunur tutar hem de gizlenmiş
    #    payload'ların sürücüye ulaşmasını engeller.
    for node in stmt.walk():
        if node.comments:
            node.comments = None

    return GuardResult(
        sql=stmt.sql(dialect="postgres"),
        relations=tuple(sorted(used)),
        limit=effective_limit,
    )
