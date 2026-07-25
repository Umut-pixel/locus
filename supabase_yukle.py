# -*- coding: utf-8 -*-
"""
musteriler_temiz.csv -> Supabase yukleyici.

ETL'den AYRI calisir. etl_musteri.py'nin urettigi CSV'yi okur ve Supabase
REST API (PostgREST) uzerinden toplu upsert eder. Ek bagimlilik yok, stdlib.

Kimlik bilgileri SADECE ortam degiskeninden okunur - kod icine gomulmez:
    SUPABASE_URL          https://<proje-ref>.supabase.co
    SUPABASE_SERVICE_KEY  service_role anahtari (RLS'i bypass eder, gizli tut)

Kullanim:
    python supabase_yukle.py --sema-yaz       # once tabloyu olustur (SQL basar)
    python supabase_yukle.py --dogrula        # baglanti + CSV kontrolu, yazma yok
    python supabase_yukle.py                  # gercek upsert
    python supabase_yukle.py --parca 200      # parca boyutunu degistir
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PROJE_DIZIN = Path(__file__).resolve().parent
GIRDI_CSV = PROJE_DIZIN / "cikti" / "musteriler_temiz.csv"
TABLO = "musteriler"
PARCA_VARSAYILAN = 500

# CSV kolonu -> (postgres tipi, python donusturucu)
SAYISAL_INT = {"ziyaret_sira", "toplam_teslimat_sayisi", "son_teslimattan_gecen_gun",
               "satis_temsilci_sayisi"}
SAYISAL_FLOAT = {"lat", "lon", "toplam_agirlik", "toplam_tutar"}
TARIH = {"son_teslimat_tarihi", "ilk_teslimat_tarihi"}

SEMA_SQL = f"""
-- petshop MVP: temizlenmis musteri veri seti
create table if not exists public.{TABLO} (
    musteri_kodu              text primary key,
    unvan                     text not null,
    adres                     text,
    sehir                     text,
    ilce                      text,
    lat                       double precision,
    lon                       double precision,
    rut_kod                   text,
    rut_aciklama              text,
    ziyaret_sira              integer,
    son_teslimat_tarihi       date,
    ilk_teslimat_tarihi       date,
    toplam_teslimat_sayisi    integer not null default 0,
    toplam_agirlik            numeric(14,2) not null default 0,   -- kg
    toplam_tutar              numeric(16,2) not null default 0,   -- TL
    son_teslimattan_gecen_gun integer,
    durum                     text,
    musteri_grubu             text,
    bolge_grubu               text,
    geocode_kaynak            text,
    geocode_hassasiyet        text,
    satis_temsilcileri        text,
    telefon                   text,
    posta_kodu                text,
    guncellendi               timestamptz not null default now()
);

create index if not exists {TABLO}_sehir_idx        on public.{TABLO} (sehir);
create index if not exists {TABLO}_rut_idx          on public.{TABLO} (rut_kod, ziyaret_sira);
create index if not exists {TABLO}_son_teslimat_idx on public.{TABLO} (son_teslimat_tarihi desc);
create index if not exists {TABLO}_konum_idx        on public.{TABLO} (lat, lon)
    where lat is not null;

-- Haritada sadece konumu olan aktif musteriler
create or replace view public.{TABLO}_harita
with (security_invoker = true) as
select musteri_kodu, unvan, sehir, ilce, lat, lon, rut_kod, rut_aciklama,
       ziyaret_sira, son_teslimat_tarihi, toplam_teslimat_sayisi,
       toplam_agirlik, toplam_tutar, son_teslimattan_gecen_gun,
       durum, geocode_hassasiyet,
       case
         when toplam_teslimat_sayisi = 0            then 'hic_teslimat_yok'
         when son_teslimattan_gecen_gun > 90        then 'riskli'
         when son_teslimattan_gecen_gun > 45        then 'izlenmeli'
         else 'saglikli'
       end as risk_durumu
from public.{TABLO}
where lat is not null and lon is not null;

alter table public.{TABLO} enable row level security;

do $$ begin
  create policy "{TABLO}_select_public"
    on public.{TABLO}
    for select
    to anon, authenticated
    using (true);
exception when duplicate_object then null;
end $$;
"""


def ortam_oku() -> tuple[str, str]:
    from dotenv import load_dotenv
    load_dotenv(PROJE_DIZIN / ".env")
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    eksik = [ad for ad, d in (("SUPABASE_URL", url), ("SUPABASE_SERVICE_KEY", key)) if not d]
    if eksik:
        print("HATA: su ortam degiskenleri tanimli degil: " + ", ".join(eksik))
        print()
        print("PowerShell:")
        print('  $env:SUPABASE_URL = "https://xxxx.supabase.co"')
        print('  $env:SUPABASE_SERVICE_KEY = "eyJhbGci..."')
        print("bash:")
        print('  export SUPABASE_URL="https://xxxx.supabase.co"')
        print('  export SUPABASE_SERVICE_KEY="eyJhbGci..."')
        raise SystemExit(2)
    if not url.startswith("https://"):
        raise SystemExit(f"HATA: SUPABASE_URL https:// ile baslamali -> {url!r}")
    return url, key


def istek(url: str, key: str, yol: str, yontem: str = "GET",
          govde: list | None = None, ek_baslik: dict | None = None) -> tuple[int, str]:
    veri = json.dumps(govde, ensure_ascii=False).encode("utf-8") if govde is not None else None
    baslik = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    baslik.update(ek_baslik or {})
    r = urllib.request.Request(f"{url}{yol}", data=veri, headers=baslik, method=yontem)
    try:
        with urllib.request.urlopen(r, timeout=60) as y:
            return y.status, y.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except urllib.error.URLError as e:
        raise SystemExit(f"HATA: Supabase'e ulasilamadi -> {e.reason}")


def satir_donustur(ham: dict) -> dict:
    """CSV string'lerini JSON/Postgres tiplerine cevir; bos -> None."""
    kayit: dict = {}
    for k, v in ham.items():
        v = (v or "").strip()
        if v == "":
            kayit[k] = None
        elif k in SAYISAL_INT:
            try:
                kayit[k] = int(float(v))
            except ValueError:
                kayit[k] = None
        elif k in SAYISAL_FLOAT:
            try:
                f = float(v)
                kayit[k] = None if math.isnan(f) else round(f, 7)
            except ValueError:
                kayit[k] = None
        else:
            kayit[k] = v  # TARIH zaten YYYY-MM-DD, Postgres dogrudan kabul eder
    return kayit


def csv_oku() -> list[dict]:
    if not GIRDI_CSV.exists():
        raise SystemExit(f"HATA: girdi bulunamadi -> {GIRDI_CSV}\n"
                         f"Once 'python etl_musteri.py' calistirin.")
    with GIRDI_CSV.open(encoding="utf-8-sig", newline="") as f:
        kayitlar = [satir_donustur(r) for r in csv.DictReader(f)]
    if not kayitlar:
        raise SystemExit("HATA: CSV bos.")

    kodlar = [k["musteri_kodu"] for k in kayitlar]
    bos_kod = sum(1 for k in kodlar if not k)
    tekrar = len(kodlar) - len(set(kodlar))
    if bos_kod or tekrar:
        raise SystemExit(f"HATA: musteri_kodu bos={bos_kod} tekrar={tekrar} -> "
                         f"birincil anahtar bozuk, yukleme iptal.")
    print(f"CSV okundu: {len(kayitlar)} satir, {len(kayitlar[0])} kolon")
    print(f"  koordinatli : {sum(1 for k in kayitlar if k['lat'] is not None)}")
    print(f"  rutlu       : {sum(1 for k in kayitlar if k['rut_kod'])}")
    print(f"  sevkiyatli  : {sum(1 for k in kayitlar if (k['toplam_teslimat_sayisi'] or 0) > 0)}")
    return kayitlar


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sema-yaz", action="store_true",
                    help="Tablo/index/view olusturma SQL'ini ekrana basar")
    ap.add_argument("--dogrula", action="store_true",
                    help="Baglanti ve CSV'yi kontrol eder, hicbir sey yazmaz")
    ap.add_argument("--parca", type=int, default=PARCA_VARSAYILAN,
                    help=f"Parca basina satir (varsayilan {PARCA_VARSAYILAN})")
    args = ap.parse_args()

    if args.sema_yaz:
        cikti = PROJE_DIZIN / "sema.sql"
        cikti.write_text(SEMA_SQL, encoding="utf-8")
        print(SEMA_SQL)
        print(f"-- Bu SQL '{cikti}' dosyasina da yazildi.")
        print("-- Supabase Studio > SQL Editor'de calistirin, sonra bu scripti tekrar cagirin.")
        return

    kayitlar = csv_oku()
    url, key = ortam_oku()
    print(f"Supabase: {url}  tablo={TABLO}")

    durum, govde = istek(url, key, f"/rest/v1/{TABLO}?select=musteri_kodu&limit=1")
    if durum == 404 or (durum >= 400 and "does not exist" in govde):
        raise SystemExit(f"HATA: '{TABLO}' tablosu yok (HTTP {durum}).\n"
                         f"Once: python supabase_yukle.py --sema-yaz")
    if durum >= 400:
        raise SystemExit(f"HATA: baglanti/yetki sorunu (HTTP {durum}): {govde[:300]}")
    print(f"Baglanti OK (HTTP {durum})")

    if args.dogrula:
        print("--dogrula verildi: hicbir sey yazilmadi.")
        return

    toplam = len(kayitlar)
    parca_sayisi = math.ceil(toplam / args.parca)
    print(f"\nUpsert basliyor: {toplam} satir / {parca_sayisi} parca "
          f"(on_conflict=musteri_kodu)")
    yazilan, basladi = 0, time.time()
    for i in range(parca_sayisi):
        dilim = kayitlar[i * args.parca:(i + 1) * args.parca]
        durum, govde = istek(
            url, key,
            f"/rest/v1/{TABLO}?on_conflict=musteri_kodu",
            yontem="POST", govde=dilim,
            ek_baslik={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
        if durum >= 400:
            print(f"\nHATA parca {i+1}/{parca_sayisi} (HTTP {durum}): {govde[:400]}")
            print(f"Yazilan: {yazilan}/{toplam}. Sorun giderilip tekrar calistirilabilir "
                  f"(upsert oldugu icin tekrar guvenli).")
            raise SystemExit(1)
        yazilan += len(dilim)
        print(f"  parca {i+1}/{parca_sayisi}  +{len(dilim):4d}  toplam {yazilan}/{toplam}")

    durum, govde = istek(url, key, f"/rest/v1/{TABLO}?select=musteri_kodu",
                         ek_baslik={"Prefer": "count=exact", "Range": "0-0"})
    print(f"\nTAMAM: {yazilan} satir upsert edildi ({time.time()-basladi:.1f} sn)")
    print(f"Tablodaki toplam kayit dogrulamasi icin Supabase Studio'ya bakin.")


if __name__ == "__main__":
    main()
