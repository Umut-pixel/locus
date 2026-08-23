"""SQL guard güvenlik testleri.

Bu testler geçmeden agent çalıştırılmamalı.
Çalıştır:  .venv/bin/python -m pytest evals/test_sql_guard.py -q
    veya:  .venv/bin/python evals/test_sql_guard.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.sql_guard import SqlGuardError, validate_sql  # noqa: E402

# (etiket, sql) — hepsi REDDEDİLMELİ
MUST_REJECT = [
    ("DROP", "DROP TABLE musteriler"),
    ("DELETE", "DELETE FROM musteriler_rapor"),
    ("UPDATE", "UPDATE musteriler_rapor SET unvan = 'x'"),
    ("INSERT", "INSERT INTO urun_skt (urun_kodu) VALUES ('x')"),
    ("TRUNCATE", "TRUNCATE musteriler_rapor"),
    ("ALTER", "ALTER TABLE musteriler_rapor ADD COLUMN x int"),
    ("GRANT", "GRANT ALL ON musteriler_rapor TO anon"),
    ("stacked-delete", "SELECT 1 FROM musteriler_rapor; DELETE FROM musteriler_rapor"),
    ("stacked-drop", "SELECT unvan FROM musteriler_rapor; DROP TABLE musteriler"),
    ("pg_read_file", "SELECT pg_read_file('/etc/passwd') FROM musteriler_rapor"),
    ("pg_sleep-dos", "SELECT pg_sleep(9999) FROM musteriler_rapor"),
    ("pg_catalog", "SELECT * FROM pg_catalog.pg_user"),
    ("information_schema", "SELECT * FROM information_schema.tables"),
    ("auth-schema", "SELECT * FROM auth.users"),
    ("raw-table-musteriler", "SELECT * FROM musteriler"),
    ("raw-table-yaslandirma", "SELECT * FROM musteri_yaslandirma"),
    ("unknown-table", "SELECT * FROM gizli_tablo"),
    ("cte-hidden-delete", "WITH x AS (DELETE FROM musteriler_rapor RETURNING *) SELECT * FROM x"),
    ("join-to-raw", "SELECT r.unvan FROM musteriler_rapor r JOIN musteriler m ON m.musteri_kodu = r.musteri_kodu"),
    ("subquery-raw", "SELECT unvan FROM musteriler_rapor WHERE musteri_kodu IN (SELECT musteri_kodu FROM musteriler)"),
    ("empty", "   "),
    ("garbage", "bu bir sql degil !!!"),
    ("copy", "COPY musteriler_rapor TO '/tmp/leak.csv'"),
]

# (etiket, sql) — hepsi KABUL EDİLMELİ
MUST_ALLOW = [
    ("basit-select", "SELECT unvan FROM musteriler_rapor"),
    ("filtreli", "SELECT unvan, yas_toplam FROM musteriler_rapor WHERE sehir = 'BALIKESİR'"),
    ("agregasyon", "SELECT sehir, SUM(belge_net_ciro) FROM musteriler_rapor GROUP BY sehir"),
    ("cte", "WITH riskli AS (SELECT * FROM musteriler_rapor WHERE yas_riskli_tutar >= 1) SELECT COUNT(*) FROM riskli"),
    ("join-izinli", "SELECT r.unvan FROM musteriler_rapor r JOIN musteri_metrik_gecmis g ON g.musteri_kodu = r.musteri_kodu"),
    ("union", "SELECT unvan FROM musteriler_rapor UNION SELECT unvan FROM musteriler_harita"),
    ("kucuk-limit", "SELECT unvan FROM musteriler_rapor LIMIT 5"),
    ("stok", "SELECT urun, miktar FROM v_panorama_detayli_stok_raporu_guncel WHERE miktar <= 0"),
    ("konusma-liste", "SELECT id, baslik, ozet FROM agent_konusmalar"),
]


def main() -> int:
    failures: list[str] = []

    for label, sql in MUST_REJECT:
        try:
            result = validate_sql(sql)
        except SqlGuardError:
            print(f"  ok   REJECT  {label}")
        except Exception as err:
            failures.append(f"REJECT {label}: beklenmeyen hata tipi {type(err).__name__}: {err}")
            print(f"  FAIL REJECT  {label}  (yanlış hata tipi: {type(err).__name__})")
        else:
            failures.append(f"REJECT {label}: GEÇTİ ama reddedilmeliydi -> {result.sql}")
            print(f"  FAIL REJECT  {label}  <-- GÜVENLİK AÇIĞI")

    for label, sql in MUST_ALLOW:
        try:
            result = validate_sql(sql)
        except Exception as err:
            failures.append(f"ALLOW {label}: reddedildi ama geçmeliydi -> {err}")
            print(f"  FAIL ALLOW   {label}  ({err})")
        else:
            if "LIMIT" not in result.sql.upper():
                failures.append(f"ALLOW {label}: LIMIT enjekte edilmedi")
                print(f"  FAIL ALLOW   {label}  (LIMIT yok)")
            else:
                print(f"  ok   ALLOW   {label}  [limit={result.limit}]")

    # LIMIT tavanı: kullanıcı 99999 isterse de max_rows'a kırpılmalı
    capped = validate_sql("SELECT unvan FROM musteriler_rapor LIMIT 99999", max_rows=1000)
    if capped.limit != 1000:
        failures.append(f"LIMIT tavanı uygulanmadı: {capped.limit}")
        print("  FAIL LIMIT tavanı")
    else:
        print("  ok   LIMIT tavanı (99999 -> 1000)")

    print()
    if failures:
        print(f"{len(failures)} BAŞARISIZ:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"Tüm testler geçti ({len(MUST_REJECT)} reddet + {len(MUST_ALLOW)} kabul + 1 limit).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
