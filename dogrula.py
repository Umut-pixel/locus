# -*- coding: utf-8 -*-
"""
Bagimsiz dogrulama: cikti CSV'yi HAM Excel dosyalarina karsi yeniden hesaplar.

etl_musteri.py'nin kendi loguna guvenmez - her sayiyi kaynaktan bagimsiz
turetip karsilastirir. Herhangi bir kontrol duserse cikis kodu 1 olur.

    python dogrula.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KAYNAK = Path(r"C:\Users\ıntel pc\Downloads")
PROJE = Path(__file__).resolve().parent
CSV = PROJE / "cikti" / "musteriler_temiz.csv"

SEHIR_HEDEF = {"İZMİR", "MANİSA", "AYDIN", "MUĞLA", "DENİZLİ",
               "BALIKESİR", "ÇANAKKALE", "UŞAK"}

sonuclar: list[tuple[bool, str, str]] = []


def kontrol(ad: str, gecti: bool, detay: str = "") -> None:
    sonuclar.append((gecti, ad, detay))
    print(f"  [{'GECTI' if gecti else 'DUSTU'}] {ad}" + (f"  -> {detay}" if detay else ""))


def main() -> int:
    if not CSV.exists():
        print(f"HATA: {CSV} yok. Once etl_musteri.py calistirin.")
        return 1

    out = pd.read_csv(CSV, dtype=str)
    mus = pd.read_excel(KAYNAK / "MusteriListesi (1).xlsx", sheet_name="Data", dtype=str)
    rut = pd.read_excel(KAYNAK / "RutTanimListesi (1).xlsx",
                        sheet_name="RutTanimListesi", dtype=str)
    sev = pd.read_excel(KAYNAK / "SevkiyatRaporuKup.xlsx", sheet_name="Data", dtype=str)

    mus["_k"] = mus["MusteriKodu"].str.strip()
    rut["_k"] = rut["MusteriKod"].str.strip()
    sev["_k"] = sev["MusteriKodu"].str.strip()

    def sehir_norm(s):
        return s.astype(str).str.strip().str.replace("i", "İ").str.replace("ı", "I").str.upper()

    print("\n--- BUTUNLUK ---")
    kontrol("musteri_kodu tekil", out["musteri_kodu"].is_unique,
            f"{out['musteri_kodu'].nunique()}/{len(out)}")
    kontrol("musteri_kodu bos yok", out["musteri_kodu"].notna().all())
    kontrol("unvan bos yok", out["unvan"].notna().all())

    print("\n--- DEDUP + BOLGE ---")
    ded = mus.drop_duplicates("_k", keep="first")
    beklenen = set(ded.loc[sehir_norm(ded["Sehir"]).isin(SEHIR_HEDEF), "_k"])
    gercek = set(out["musteri_kodu"])
    kontrol("bolge filtresi kaynaktan yeniden turetildi",
            beklenen == gercek,
            f"beklenen={len(beklenen)} gercek={len(gercek)} "
            f"fark={len(beklenen ^ gercek)}")
    kontrol("cikti sadece hedef 8 ili iceriyor",
            set(out["sehir"].unique()) <= SEHIR_HEDEF,
            f"iller={sorted(out['sehir'].unique())}")

    print("\n--- RUT JOIN ---")
    rut_bekl = set(rut["_k"]) & gercek
    rut_ger = set(out.loc[out["rut_kod"].notna(), "musteri_kodu"])
    kontrol("rut eslesmesi tam", rut_bekl == rut_ger,
            f"beklenen={len(rut_bekl)} gercek={len(rut_ger)}")
    # Rastgele 3 kayitta rut_kod degeri dogru mu
    rmap = dict(zip(rut["_k"], rut["RutKod"].astype(str).str.strip()))
    ornek = out[out["rut_kod"].notna()].sample(min(3, len(rut_ger)), random_state=7)
    hatali = [r.musteri_kodu for r in ornek.itertuples()
              if rmap.get(r.musteri_kodu) != str(r.rut_kod).strip()]
    kontrol("ornek rut_kod degerleri kaynakla ayni", not hatali, f"hatali={hatali}")

    print("\n--- SEVKIYAT AGREGASYONU ---")
    sev["_t"] = pd.to_datetime(sev["BelgeTarihi"].str.strip(), format="%d.%m.%Y", errors="coerce")
    sev["_tut"] = pd.to_numeric(sev["NetFiyat"], errors="coerce")
    sev["_ag"] = pd.to_numeric(sev["Agirlik"], errors="coerce") / 1000.0
    ozet = sev.groupby("_k").agg(n=("_t", "size"), son=("_t", "max"),
                                 tut=("_tut", "sum"), ag=("_ag", "sum"))
    ozet = ozet[ozet.index.isin(gercek)]

    o = out.set_index("musteri_kodu")
    kontrol("sevkiyatli musteri sayisi",
            (out["toplam_teslimat_sayisi"].astype(int) > 0).sum() == len(ozet),
            f"csv={(out['toplam_teslimat_sayisi'].astype(int) > 0).sum()} kaynak={len(ozet)}")

    n_fark = sum(int(o.at[k, "toplam_teslimat_sayisi"]) != int(v)
                 for k, v in ozet["n"].items())
    kontrol("teslimat sayilari birebir", n_fark == 0, f"uyusmayan={n_fark}")

    tut_fark = sum(abs(float(o.at[k, "toplam_tutar"]) - float(v)) > 0.01
                   for k, v in ozet["tut"].items())
    kontrol("toplam_tutar birebir (±0.01)", tut_fark == 0, f"uyusmayan={tut_fark}")

    ag_fark = sum(abs(float(o.at[k, "toplam_agirlik"]) - float(v)) > 0.01
                  for k, v in ozet["ag"].items())
    kontrol("toplam_agirlik birebir, kg (±0.01)", ag_fark == 0, f"uyusmayan={ag_fark}")

    tar_fark = sum(str(o.at[k, "son_teslimat_tarihi"]) != v.strftime("%Y-%m-%d")
                   for k, v in ozet["son"].items())
    kontrol("son_teslimat_tarihi birebir", tar_fark == 0, f"uyusmayan={tar_fark}")

    sifirli = out[out["toplam_teslimat_sayisi"].astype(int) == 0]
    kontrol("teslimati olmayanlarda tutar/agirlik 0",
            (sifirli["toplam_tutar"].astype(float) == 0).all()
            and (sifirli["toplam_agirlik"].astype(float) == 0).all(),
            f"{len(sifirli)} musteri")

    print("\n--- KOORDINAT ---")
    kd = out[out["lat"].notna()]
    lat = kd["lat"].astype(float)
    lon = kd["lon"].astype(float)
    kontrol("tum koordinatlar Turkiye sinirlarinda",
            bool(lat.between(35.8, 42.2).all() and lon.between(25.6, 45.0).all()),
            f"lat=[{lat.min():.4f},{lat.max():.4f}] lon=[{lon.min():.4f},{lon.max():.4f}]")
    kontrol("lat/lon birlikte dolu veya birlikte bos",
            (out["lat"].notna() == out["lon"].notna()).all())
    kontrol("koordinat 0.0 kalmadi", not ((lat == 0) | (lon == 0)).any())

    erp = out[out["geocode_kaynak"] == "erp"]
    kontrol("ERP koordinatli sayisi kaynakla uyumlu", len(erp) == 421,
            f"csv={len(erp)} beklenen=421")
    kontrol("hassasiyet etiketi her koordinatli kayitta var",
            kd["geocode_hassasiyet"].isin(
                ["saha_gps", "mahalle_merkezi", "ilce_merkezi"]).all())

    yigin = kd.groupby(["lat", "lon"]).size()
    print(f"     bilgi: {len(kd)} koordinatli kayit {len(yigin)} tekil noktada; "
          f"en kalabalik nokta {int(yigin.max())} musteri")

    print("\n--- SIZINTI KONTROLU ---")
    # Anahtarin ADI gecebilir; gecmemesi gereken DEGERIN kendisi.
    import re as _re
    metin = (PROJE / "supabase_yukle.py").read_text(encoding="utf-8")
    jwt = _re.search(r"eyJ[A-Za-z0-9_\-]{20,}", metin)          # JWT govdesi
    proje_url = _re.search(r"https://[a-z0-9]{15,}\.supabase\.co", metin)  # gercek proje ref
    kontrol("supabase scriptinde gomulu JWT/anahtar yok", jwt is None,
            f"bulunan={jwt.group()[:18]}..." if jwt else "")
    kontrol("supabase scriptinde gomulu proje URL'i yok", proje_url is None,
            proje_url.group() if proje_url else "")

    gecen = sum(1 for g, _, _ in sonuclar if g)
    print(f"\n{'='*60}\nSONUC: {gecen}/{len(sonuclar)} kontrol gecti")
    dusenler = [ad for g, ad, _ in sonuclar if not g]
    if dusenler:
        print("DUSEN KONTROLLER:")
        for d in dusenler:
            print(f"  - {d}")
        return 1
    print("Tum kontroller gecti.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
