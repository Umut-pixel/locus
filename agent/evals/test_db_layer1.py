"""Katman 1 (veritabanı rolü) CANLI doğrulaması.

    agent/.venv/bin/python evals/test_db_layer1.py

Neden ayrı test: `sql/agent_role_fix_v2.sql` sonundaki doğrulama bloğu
katalogdan ölçüm yapıyor — grant ve politika var mı, ona bakıyor. Ama
`default_transaction_read_only` oturum AÇILIRKEN uygulanan bir rol ayarı,
yani yazma korumasının gerçekten tuttuğu ancak locus_agent olarak BAĞLANIP
yazma denemesiyle kanıtlanabilir. Bu script onu yapıyor.

AGENT_DB_URL kök .env'den okunur (agent/sync-env.sh ile agent/.env'e taşınmış
olmalı). Hiçbir şey yazmaz — yazma denemeleri hata almayı BEKLER.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import psycopg
except ImportError:
    sys.exit("psycopg yok:  .venv/bin/pip install 'psycopg[binary]>=3.2'")

# Beklenen satır sayıları (2026-08-22 ölçümü, postgres olarak).
# 0 dönerse RLS politikası agent'ı kapsamıyor demektir — sessiz hatanın imzası.
OKUNABILIR: dict[str, int] = {
    "musteriler_rapor": 1318,
    "musteriler_harita": 1209,
    "urun_skt": 685,
    "musteri_metrik_gecmis": 17421,
    "v_panorama_belge_detay_raporu_guncel": 8956,
    "v_panorama_sevkiyat_raporu_kup_guncel": 1861,
    "v_panorama_acik_fatura_vade_kup_guncel": 906,
    "v_panorama_detayli_stok_raporu_guncel": 102,
    "v_panorama_siparis_durum_raporu_guncel": 8586,
    "rapor_bolge_disi_ozet": 1,
}

ERISILEMEZ = [
    "entity_notlar",
    "musteri_favoriler",
    "yukleme_loglari",
    "musteri_snapshotlari",
    "potansiyel_musteriler",
]

YAZMA_DENEMELERI = [
    ("insert", "insert into urun_skt (urun_kodu) values ('__test__')"),
    ("update", "update musteriler set unvan = '__test__'"),
    ("delete", "delete from musteriler"),
    ("create", "create table __agent_test__ (x int)"),
]


def env_oku(anahtar: str) -> str | None:
    """Kök .env'i okur. python-dotenv bağımlılığı eklemeye değmez."""
    if os.environ.get(anahtar):
        return os.environ[anahtar]
    for aday in (Path(__file__).parent.parent / ".env",
                 Path(__file__).parent.parent.parent / ".env"):
        if not aday.exists():
            continue
        for satir in aday.read_text(encoding="utf-8").splitlines():
            satir = satir.strip()
            if satir.startswith(f"{anahtar}="):
                return satir.split("=", 1)[1].strip()
    return None


def main() -> int:
    dsn = env_oku("AGENT_DB_URL")
    if not dsn:
        return say_hata("AGENT_DB_URL bulunamadı (kök .env veya agent/.env).")
    if ":PAROLA@" in dsn:
        return say_hata("AGENT_DB_URL hâlâ 'PAROLA' placeholder'ında.")
    # Kullanıcı adı iki biçimde olabilir:
    #   doğrudan bağlantı -> locus_agent
    #   Supavisor pooler  -> locus_agent.<proje_ref>
    kullanici_bolumu = dsn.split("://", 1)[-1].split(":", 1)[0]
    if kullanici_bolumu.split(".", 1)[0] != "locus_agent":
        return say_hata(
            f"AGENT_DB_URL kullanıcısı '{kullanici_bolumu}' — locus_agent olmalı. "
            "service_role/postgres ise güvenlik modelinin 1. katmanı yok demektir."
        )

    gecti = kaldi = 0

    def sonuc(ok: bool, etiket: str, detay: str = "") -> None:
        nonlocal gecti, kaldi
        if ok:
            gecti += 1
            print(f"  ok    {etiket}" + (f"  {detay}" if detay else ""))
        else:
            kaldi += 1
            print(f"  KALDI {etiket}  {detay}")

    with psycopg.connect(dsn, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute("select current_user")
            kullanici = cur.fetchone()[0]
            sonuc(kullanici == "locus_agent", "current_user", f"-> {kullanici}")

            # Dördü de rol ayarı; Supavisor pooler üzerinden bağlanıldığında
            # da korunduklarını burada kanıtlıyoruz.
            for ayar, beklenen in (
                ("default_transaction_read_only", "on"),
                ("statement_timeout", "10s"),
                ("idle_in_transaction_session_timeout", "30s"),
                ("search_path", "public"),
            ):
                cur.execute(f"show {ayar}")
                deger = cur.fetchone()[0]
                sonuc(deger == beklenen, ayar, f"-> {deger}")

        print("\n-- okunabilmeli (0 satır = RLS politikası eksik) --")
        for nesne, beklenen in OKUNABILIR.items():
            try:
                with conn.cursor() as cur:
                    cur.execute(f"select count(*) from public.{nesne}")
                    n = cur.fetchone()[0]
                sonuc(n > 0, nesne, f"{n} satır (beklenen ~{beklenen})")
            except psycopg.Error as e:
                conn.rollback()
                sonuc(False, nesne, f"HATA: {str(e).splitlines()[0]}")

        print("\n-- erişilememeli --")
        for nesne in ERISILEMEZ:
            try:
                with conn.cursor() as cur:
                    cur.execute(f"select 1 from public.{nesne} limit 1")
                    cur.fetchone()
                sonuc(False, nesne, "ERİŞİLDİ — engellenmeliydi!")
            except psycopg.Error as e:
                conn.rollback()
                sonuc("permission denied" in str(e).lower(), nesne,
                      f"engellendi: {str(e).splitlines()[0][:60]}")

        print("\n-- yazma engellenmeli --")
        for etiket, sql in YAZMA_DENEMELERI:
            try:
                with conn.cursor() as cur:
                    cur.execute(sql)
                conn.rollback()
                sonuc(False, etiket, "YAZMA GEÇTİ — kritik güvenlik hatası!")
            except psycopg.Error as e:
                conn.rollback()
                ilk = str(e).splitlines()[0]
                sonuc(True, etiket, f"engellendi: {ilk[:60]}")

    print(f"\n{'=' * 60}")
    if kaldi == 0:
        print(f"KATMAN 1 SAĞLAM — {gecti} kontrolün hepsi geçti.")
        return 0
    print(f"{kaldi} kontrol KALDI, {gecti} geçti.")
    return 1


def say_hata(mesaj: str) -> int:
    print(f"KURULUM EKSİK: {mesaj}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
