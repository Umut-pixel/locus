# -*- coding: utf-8 -*-
"""
Panorama (Univera) ERP -> temiz musteri veri seti ETL'i.

Uc Excel dosyasini (MusteriListesi / RutTanimListesi / SevkiyatRaporuKup)
temizler, dedup eder, bolgeye gore filtreler, birlestirir ve eksik
koordinatlari Nominatim ile geocode eder.

Tek seferlik statik ETL. Her adimda satir sayisi raporlanir.

Kullanim:
    python etl_musteri.py                  # tam calistirma (geocode dahil)
    python etl_musteri.py --skip-geocode   # geocode'u atla (hizli test)
    python etl_musteri.py --geocode-limit 50   # sadece 50 kayit geocode et
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

# stdout'u UTF-8'e sabitle (Windows konsolu cp1254 olabiliyor)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ----------------------------------------------------------------------------
# YAPILANDIRMA
# ----------------------------------------------------------------------------
KAYNAK_DIZIN = Path(r"C:\Users\ıntel pc\Downloads")
DOSYA_MUSTERI = KAYNAK_DIZIN / "MusteriListesi (1).xlsx"
DOSYA_RUT = KAYNAK_DIZIN / "RutTanimListesi (1).xlsx"
DOSYA_SEVKIYAT = KAYNAK_DIZIN / "SevkiyatRaporuKup.xlsx"

PROJE_DIZIN = Path(__file__).resolve().parent
CIKTI_DIZIN = PROJE_DIZIN / "cikti"
GEOCODE_CACHE = PROJE_DIZIN / "geocode_cache.json"

CIKTI_ANA = CIKTI_DIZIN / "musteriler_temiz.csv"
CIKTI_GEOCODE_BASARISIZ = CIKTI_DIZIN / "geocode_basarisiz.csv"
CIKTI_BOLGE_DISI = CIKTI_DIZIN / "bolge_disi_musteriler.csv"
CIKTI_RAPOR = CIKTI_DIZIN / "etl_rapor.json"

# Kullanicinin onayladigi bolge kapsami (2026-07-25 karari):
#   cekirdek 5 il + Balikesir/Canakkale (aktif rut sahasi) + Usak (Ic Ege).
#   Antalya HARIC birakildi: 47 musterinin 45'i Pasif/Iptal, sadece 2'si rutta.
SEHIR_CEKIRDEK = {"İZMİR", "MANİSA", "AYDIN", "MUĞLA", "DENİZLİ"}
SEHIR_SINIR_DAHIL = {"BALIKESİR", "ÇANAKKALE", "UŞAK"}
SEHIR_HEDEF = SEHIR_CEKIRDEK | SEHIR_SINIR_DAHIL

# Sevkiyat 'Agirlik' kolonu GRAM cinsinden (medyan 185.500 -> 185,5 kg/teslimat).
# Cikti kg'a cevrilir.
AGIRLIK_BOLEN = 1000.0

# Nominatim kullanim politikasi: saniyede en fazla 1 istek + tanimlayici UA.
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_UA = "patigo-petshop-mvp-etl/1.0 (umuteroltr097@gmail.com)"
NOMINATIM_BEKLEME_SN = 1.1
NOMINATIM_TIMEOUT = 20

# Turkiye sinirlari - geocode sonucu dogrulamasi icin
TR_ENLEM = (35.8, 42.2)
TR_BOYLAM = (25.6, 45.0)

# Hedef illerin yaklasik merkezleri - geocode sonucu "dogru ilde mi" kontrolu
IL_MERKEZ = {
    "İZMİR": (38.4237, 27.1428),
    "MANİSA": (38.6191, 27.4289),
    "AYDIN": (37.8560, 27.8416),
    "MUĞLA": (37.2153, 28.3636),
    "DENİZLİ": (37.7765, 29.0864),
    "BALIKESİR": (39.6484, 27.8826),
    "ÇANAKKALE": (40.1553, 26.4142),
    "UŞAK": (38.6823, 29.4082),
}
# Bir ilin merkezinden bu mesafeden uzak sonuc supheli sayilir (derece ~ 111 km)
IL_MAX_SAPMA_DERECE = 1.6  # ~180 km; genis iller (Mugla, Balikesir) icin tolere


# ----------------------------------------------------------------------------
# YARDIMCILAR
# ----------------------------------------------------------------------------
_adim_sayaci = {"n": 0}


def adim(baslik: str) -> None:
    _adim_sayaci["n"] += 1
    print()
    print("=" * 76)
    print(f"ADIM {_adim_sayaci['n']}: {baslik}")
    print("=" * 76)


def bilgi(msg: str) -> None:
    print(f"   {msg}")


def metin_temizle(seri: pd.Series) -> pd.Series:
    """Bosluklari normalize et, bas/sondaki nokta-tire gibi coplukleri at."""
    s = seri.astype("string").fillna("")
    s = s.str.replace(r"\s+", " ", regex=True).str.strip()
    s = s.str.replace(r"^[.\-_,;:*]+$", "", regex=True)  # sadece noktalama ise bosalt
    s = s.str.strip(" .,-")
    return s


def sehir_normalize(seri: pd.Series) -> pd.Series:
    """Sehir adini buyuk harfe cevir; Turkce i/I sorununu elle cozer."""
    s = seri.astype("string").fillna("").str.strip()
    s = s.str.replace("i", "İ", regex=False).str.replace("ı", "I", regex=False)
    return s.str.upper().str.replace(r"\s+", " ", regex=True)


def sayiya_cevir(seri: pd.Series) -> pd.Series:
    """Metni sayiya cevir; virgullu ondalik ve bosluklu binlik ayraci tolere eder."""
    s = seri.astype("string").fillna("").str.strip()
    s = s.str.replace(" ", "", regex=False)
    # 1.234,56 -> 1234.56  |  1234.56 aynen kalir
    virgullu = s.str.contains(",", na=False) & s.str.contains(r"\.", na=False)
    s = s.mask(virgullu, s.str.replace(".", "", regex=False))
    s = s.str.replace(",", ".", regex=False)
    return pd.to_numeric(s, errors="coerce")


def mahalle_ayikla(adres: str) -> str:
    """Serbest metin adresten 'X MAH.' parcasini cikar (geocode 2. kademe icin)."""
    if not adres:
        return ""
    m = re.search(r"([A-ZÇĞİÖŞÜa-zçğıöşü0-9\.\s]{2,40}?)\s*MAH(?:\.|ALLESİ|ALLESI)?\b",
                  adres, flags=re.IGNORECASE)
    if m:
        return re.sub(r"\s+", " ", m.group(1)).strip(" .,-")
    return ""


def slug(*parcalar: str) -> str:
    ham = "|".join(p.strip().lower() for p in parcalar if p and p.strip())
    return unicodedata.normalize("NFKC", ham)


# ----------------------------------------------------------------------------
# 1) OKUMA + KOLON DOGRULAMA
# ----------------------------------------------------------------------------
BEKLENEN = {
    "MusteriListesi": ["MusteriKodu", "MusteriAd", "Adres", "Sehir", "Ilce",
                       "KoordinatX", "KoordinatY", "PostaKodu", "Telefon", "Durum", "Tip"],
    "RutTanimListesi": ["DistKod", "DistUnvan", "RutKod", "RutAciklama",
                        "ZiyaretSira", "MusteriKod", "MusteriUnvan", "Adres1", "Adres2"],
    "SevkiyatRaporuKup": ["MusteriKodu", "MusteriUnvani", "BelgeTarihi", "SevkAdres1",
                          "Plaka", "Arac", "Dagitici", "NetFiyat", "Agirlik", "OdemeTip"],
}


def dosyalari_oku() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    adim("Kaynak dosyalari oku ve kolon listelerini dogrula")
    for p in (DOSYA_MUSTERI, DOSYA_RUT, DOSYA_SEVKIYAT):
        if not p.exists():
            raise SystemExit(f"HATA: kaynak dosya bulunamadi -> {p}")

    mus = pd.read_excel(DOSYA_MUSTERI, sheet_name="Data", dtype=str)
    rut = pd.read_excel(DOSYA_RUT, sheet_name="RutTanimListesi", dtype=str)
    sev = pd.read_excel(DOSYA_SEVKIYAT, sheet_name="Data", dtype=str)

    for ad, df in (("MusteriListesi", mus), ("RutTanimListesi", rut),
                   ("SevkiyatRaporuKup", sev)):
        eksik = [c for c in BEKLENEN[ad] if c not in df.columns]
        fazla = len(df.columns) - len(BEKLENEN[ad])
        bilgi(f"{ad:20s} satir={len(df):5d}  kolon={len(df.columns):3d}  "
              f"(brief'te {len(BEKLENEN[ad])} kolon belirtilmisti, +{fazla} ekstra)")
        if eksik:
            raise SystemExit(f"HATA: {ad} icinde beklenen kolon(lar) yok: {eksik}")
    bilgi("Beklenen kolonlarin tamami mevcut. Ekstra kolonlar yok sayiliyor.")
    return mus, rut, sev


# ----------------------------------------------------------------------------
# 2) DEDUP
# ----------------------------------------------------------------------------
def musteri_dedup(mus: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    adim("MusteriListesi dedup (MusteriKodu bazinda)")
    mus = mus.copy()
    mus["musteri_kodu"] = mus["MusteriKodu"].astype("string").str.strip()
    onceki = len(mus)
    tekil = mus["musteri_kodu"].nunique()
    bilgi(f"girdi satir={onceki}  tekil MusteriKodu={tekil}  fazlalik={onceki - tekil}")

    # Tekrar gruplarinda gercekten hangi kolonlar farklilasiyor? (kural dogrulamasi)
    tekrarli = mus[mus.duplicated("musteri_kodu", keep=False)]
    farklilasan = set()
    for _, grup in tekrarli.groupby("musteri_kodu", sort=False):
        for kol in mus.columns:
            if kol != "musteri_kodu" and grup[kol].astype(str).nunique(dropna=False) > 1:
                farklilasan.add(kol)
    bilgi(f"tekrar gruplarinda farklilasan kolonlar: {sorted(farklilasan) or 'YOK'}")

    if farklilasan and not farklilasan <= {"STKodu", "STKod"}:
        bilgi("!! UYARI: STKodu/STKod disinda da farklilasan kolon var. "
              "Dedup 'en dolu satir' kuralina dusuyor.")
        # Guvenli mod: satirdaki dolu hucre sayisina gore en zengin satiri sec
        mus["_doluluk"] = mus.notna().sum(axis=1)
        mus = mus.sort_values(["musteri_kodu", "_doluluk"], ascending=[True, False])
        kural = "en_dolu_satir"
    else:
        bilgi("Tekrarlar SADECE satis temsilcisi kiriliminden kaynaklaniyor -> "
              "ilk satir guvenle tutulabilir, diger 75 kolon ozdes.")
        kural = "ilk_satir_st_birlestirildi"

    # Kaybolmamasi icin temsilcileri tek alanda topla
    temsilciler = (
        mus.assign(_st=metin_temizle(mus["STKod"]))
        .query("_st != ''")
        .groupby("musteri_kodu")["_st"]
        .agg(lambda s: " | ".join(sorted(set(s))))
    )
    temsilci_sayisi = (
        mus.assign(_st=metin_temizle(mus["STKod"]))
        .query("_st != ''")
        .groupby("musteri_kodu")["_st"].nunique()
    )

    ded = mus.drop_duplicates("musteri_kodu", keep="first").copy()
    ded["satis_temsilcileri"] = ded["musteri_kodu"].map(temsilciler).fillna("")
    ded["satis_temsilci_sayisi"] = (
        ded["musteri_kodu"].map(temsilci_sayisi).fillna(0).astype(int)
    )
    ded = ded.drop(columns=[c for c in ("_doluluk",) if c in ded.columns])

    bilgi(f"KURAL: {kural}")
    bilgi(f"cikti satir={len(ded)}  (silinen={onceki - len(ded)})")
    bilgi(f"birden fazla temsilcisi olan musteri={int((ded['satis_temsilci_sayisi'] > 1).sum())}")
    return ded, {"kural": kural, "girdi": onceki, "cikti": len(ded),
                 "farklilasan_kolonlar": sorted(farklilasan)}


# ----------------------------------------------------------------------------
# 3) BOLGE FILTRESI
# ----------------------------------------------------------------------------
def bolge_filtrele(ded: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    adim("Hedef bolge filtresi (Sehir bazinda)")
    ded = ded.copy()
    ded["sehir"] = sehir_normalize(ded["Sehir"])

    def grupla(s: str) -> str:
        if s in SEHIR_CEKIRDEK:
            return "cekirdek"
        if s in SEHIR_SINIR_DAHIL:
            return "sinir_dahil"
        return "bolge_disi"

    ded["bolge_grubu"] = ded["sehir"].map(grupla)
    dagilim = ded["sehir"].value_counts()
    bilgi(f"girdi tekil musteri={len(ded)}  tekil sehir={len(dagilim)}")
    for grp in ("cekirdek", "sinir_dahil", "bolge_disi"):
        alt = ded[ded["bolge_grubu"] == grp]
        iller = ", ".join(f"{k}:{v}" for k, v in alt["sehir"].value_counts().items())
        bilgi(f"  {grp:12s} musteri={len(alt):5d}  [{iller}]")

    iceride = ded[ded["bolge_grubu"] != "bolge_disi"].copy()
    disarida = ded[ded["bolge_grubu"] == "bolge_disi"].copy()
    bilgi(f"KARAR: Antalya haric (45/47 Pasif-Iptal). Usak + Balikesir + Canakkale dahil.")
    bilgi(f"cikti satir={len(iceride)}  (bolge disi ayrildi={len(disarida)})")
    return iceride, disarida, {
        "girdi": len(ded), "cikti": len(iceride), "bolge_disi": len(disarida),
        "dahil_iller": sorted(SEHIR_HEDEF),
    }


# ----------------------------------------------------------------------------
# 4) RUT JOIN
# ----------------------------------------------------------------------------
def rut_birlestir(df: pd.DataFrame, rut: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    adim("RutTanimListesi join (MusteriKod = MusteriKodu)")
    rut = rut.copy()
    rut["musteri_kodu"] = rut["MusteriKod"].astype("string").str.strip()
    bilgi(f"rut satir={len(rut)}  tekil MusteriKod={rut['musteri_kodu'].nunique()}")

    # Beklenmedik cogullama olursa ziyaret sirasi en dusuk kaydi tut
    if rut["musteri_kodu"].duplicated().any():
        bilgi("!! rut tarafinda tekrar eden musteri var -> en dusuk ZiyaretSira tutuluyor")
        rut["_zs"] = sayiya_cevir(rut["ZiyaretSira"]).fillna(9_999_999)
        rut = rut.sort_values("_zs").drop_duplicates("musteri_kodu", keep="first")
    else:
        bilgi("rut tarafi 1:1 (her musteri tek rutta) -> join'de cogullama riski yok")

    rut_sade = rut[["musteri_kodu", "RutKod", "RutAciklama", "ZiyaretSira"]].rename(
        columns={"RutKod": "rut_kod", "RutAciklama": "rut_aciklama",
                 "ZiyaretSira": "ziyaret_sira"}
    )
    rut_sade["rut_aciklama"] = metin_temizle(rut_sade["rut_aciklama"])
    rut_sade["rut_kod"] = metin_temizle(rut_sade["rut_kod"])
    rut_sade["ziyaret_sira"] = sayiya_cevir(rut_sade["ziyaret_sira"]).astype("Int64")

    onceki = len(df)
    df = df.merge(rut_sade, on="musteri_kodu", how="left")
    eslesen = int(df["rut_kod"].notna().sum())
    bilgi(f"satir {onceki} -> {len(df)} (left join, cogullama yok: "
          f"{'OK' if len(df) == onceki else 'HATA'})")
    bilgi(f"rut bilgisi eslesen musteri={eslesen}  eslesmeyen={len(df) - eslesen}")

    kapsam_disi = set(rut["musteri_kodu"]) - set(df["musteri_kodu"])
    bilgi(f"rutta olup bolge filtresine takilan musteri={len(kapsam_disi)}")
    return df, {"rut_satir": len(rut), "eslesen": eslesen,
                "eslesmeyen": len(df) - eslesen, "bolge_disi_rut": len(kapsam_disi)}


# ----------------------------------------------------------------------------
# 5) SEVKIYAT AGREGASYONU
# ----------------------------------------------------------------------------
def sevkiyat_birlestir(df: pd.DataFrame, sev: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    adim("SevkiyatRaporuKup agregasyonu ve join")
    sev = sev.copy()
    sev["musteri_kodu"] = sev["MusteriKodu"].astype("string").str.strip()

    tarih = pd.to_datetime(sev["BelgeTarihi"].astype("string").str.strip(),
                           format="%d.%m.%Y", errors="coerce")
    bozuk = int(tarih.isna().sum())
    sev["_tarih"] = tarih
    bilgi(f"sevkiyat satir={len(sev)}  tekil musteri={sev['musteri_kodu'].nunique()}")
    bilgi(f"BelgeTarihi parse edilemeyen={bozuk}")
    bilgi(f"tarih araligi: {tarih.min():%Y-%m-%d} .. {tarih.max():%Y-%m-%d} "
          f"({(tarih.max() - tarih.min()).days} gun)")

    sev["_tutar"] = sayiya_cevir(sev["NetFiyat"])
    sev["_agirlik_kg"] = sayiya_cevir(sev["Agirlik"]) / AGIRLIK_BOLEN
    bilgi(f"NetFiyat sayiya cevrilemeyen={int(sev['_tutar'].isna().sum())}  "
          f"Agirlik cevrilemeyen={int(sev['_agirlik_kg'].isna().sum())}")
    bilgi(f"Agirlik GRAM kabul edildi -> kg'a bolundu "
          f"(medyan {sev['_agirlik_kg'].median():.1f} kg/teslimat)")

    ozet = sev.groupby("musteri_kodu").agg(
        son_teslimat_tarihi=("_tarih", "max"),
        ilk_teslimat_tarihi=("_tarih", "min"),
        toplam_teslimat_sayisi=("_tarih", "size"),
        toplam_agirlik=("_agirlik_kg", "sum"),
        toplam_tutar=("_tutar", "sum"),
    ).reset_index()
    bilgi(f"agregasyon: {len(sev)} sevkiyat satiri -> {len(ozet)} musteri ozeti")

    onceki = len(df)
    df = df.merge(ozet, on="musteri_kodu", how="left")
    eslesen = int(df["toplam_teslimat_sayisi"].notna().sum())
    bilgi(f"satir {onceki} -> {len(df)} (cogullama yok: "
          f"{'OK' if len(df) == onceki else 'HATA'})")
    bilgi(f"sevkiyat gecmisi olan musteri={eslesen}  hic teslimat almamis={len(df) - eslesen}")

    kapsam_disi = set(ozet["musteri_kodu"]) - set(df["musteri_kodu"])
    bilgi(f"sevkiyati olup bolge filtresine takilan musteri={len(kapsam_disi)}")

    df["toplam_teslimat_sayisi"] = df["toplam_teslimat_sayisi"].fillna(0).astype(int)
    for k in ("toplam_agirlik", "toplam_tutar"):
        df[k] = df[k].fillna(0.0).round(2)

    # Risk gostergesi: son teslimattan bu yana gecen gun
    referans = tarih.max()
    df["son_teslimattan_gecen_gun"] = (referans - df["son_teslimat_tarihi"]).dt.days
    return df, {"sevkiyat_satir": len(sev), "musteri_ozeti": len(ozet),
                "eslesen": eslesen, "tarih_bozuk": bozuk,
                "tarih_min": f"{tarih.min():%Y-%m-%d}", "tarih_max": f"{tarih.max():%Y-%m-%d}",
                "bolge_disi_sevkiyat": len(kapsam_disi)}


# ----------------------------------------------------------------------------
# 6) GEOCODE
# ----------------------------------------------------------------------------
class GeocodeCache:
    def __init__(self, yol: Path):
        self.yol = yol
        self.veri: dict = {}
        if yol.exists():
            try:
                self.veri = json.loads(yol.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                print(f"   !! cache bozuk, sifirdan basliyor: {yol}")
        self._kirli = 0

    def get(self, anahtar: str):
        return self.veri.get(anahtar)

    def set(self, anahtar: str, deger) -> None:
        self.veri[anahtar] = deger
        self._kirli += 1
        if self._kirli >= 10:
            self.kaydet()

    def kaydet(self) -> None:
        self.yol.write_text(
            json.dumps(self.veri, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        self._kirli = 0


def nominatim_sorgu(q: str, cache: GeocodeCache) -> dict | None:
    """Tek bir Nominatim sorgusu. Cache'e yazar, 1 istek/sn limitine uyar."""
    anahtar = slug(q)
    onbellek = cache.get(anahtar)
    if onbellek is not None:
        return onbellek or None  # {} -> sonuc yok demek

    parametre = urllib.parse.urlencode({
        "q": q, "format": "jsonv2", "limit": 1,
        "countrycodes": "tr", "addressdetails": 1,
    })
    istek = urllib.request.Request(
        f"{NOMINATIM_URL}?{parametre}",
        headers={"User-Agent": NOMINATIM_UA, "Accept-Language": "tr,en"},
    )
    time.sleep(NOMINATIM_BEKLEME_SN)  # politika: saniyede 1 istek
    try:
        with urllib.request.urlopen(istek, timeout=NOMINATIM_TIMEOUT) as yanit:
            sonuc = json.loads(yanit.read().decode("utf-8"))
    except Exception as hata:  # ag hatasi ETL'i durdurmaz
        print(f"   !! nominatim hatasi ({type(hata).__name__}) sorgu={q[:60]!r}")
        return None

    if not sonuc:
        cache.set(anahtar, {})
        return None
    ilk = sonuc[0]
    kayit = {"lat": float(ilk["lat"]), "lon": float(ilk["lon"]),
             "tip": ilk.get("type", ""), "display": ilk.get("display_name", "")}
    cache.set(anahtar, kayit)
    return kayit


def koordinat_gecerli(lat: float, lon: float, sehir: str) -> bool:
    if not (TR_ENLEM[0] <= lat <= TR_ENLEM[1] and TR_BOYLAM[0] <= lon <= TR_BOYLAM[1]):
        return False
    merkez = IL_MERKEZ.get(sehir)
    if merkez:
        if abs(lat - merkez[0]) > IL_MAX_SAPMA_DERECE or \
           abs(lon - merkez[1]) > IL_MAX_SAPMA_DERECE:
            return False
    return True


def geocode_et(df: pd.DataFrame, atla: bool, limit: int | None) -> tuple[pd.DataFrame, dict]:
    adim("Koordinat cozumleme (mevcut + Nominatim geocode)")
    df = df.copy()

    # KoordinatX = ENLEM (lat), KoordinatY = BOYLAM (lon) -- deger araliklarindan dogrulandi
    lat = sayiya_cevir(df["KoordinatX"])
    lon = sayiya_cevir(df["KoordinatY"])
    gecersiz_sifir = int(((lat == 0) | (lon == 0)).sum())
    lat = lat.where((lat != 0) & lat.between(*TR_ENLEM))
    lon = lon.where((lon != 0) & lon.between(*TR_BOYLAM))
    hazir = lat.notna() & lon.notna()

    df["lat"] = lat
    df["lon"] = lon
    df["geocode_kaynak"] = pd.Series(pd.NA, index=df.index, dtype="string")
    df.loc[hazir, "geocode_kaynak"] = "erp"

    bilgi(f"ERP'den gelen gecerli koordinat={int(hazir.sum())}  "
          f"(0.0 oldugu icin elenen={gecersiz_sifir})")
    bilgi(f"geocode edilmesi gereken={int((~hazir).sum())}")

    if atla:
        bilgi("--skip-geocode verildi, Nominatim adimi atlaniyor.")
        df["geocode_kaynak"] = df["geocode_kaynak"].fillna("atlandi")
        return df, {"erp": int(hazir.sum()), "atlandi": True}

    df["ilce"] = metin_temizle(df["Ilce"])
    df["adres"] = metin_temizle(df["Adres"])

    hedefler = df.index[~hazir].tolist()
    if limit:
        hedefler = hedefler[:limit]
        bilgi(f"--geocode-limit={limit} -> sadece ilk {len(hedefler)} kayit denenecek")

    cache = GeocodeCache(GEOCODE_CACHE)
    bilgi(f"cache'te hazir {len(cache.veri)} sorgu var")
    sayac = {"mahalle": 0, "ilce": 0, "basarisiz": 0}
    baslangic = time.time()

    for sira, idx in enumerate(hedefler, 1):
        sehir = df.at[idx, "sehir"]
        ilce = df.at[idx, "ilce"]
        adres = df.at[idx, "adres"]
        mahalle = mahalle_ayikla(adres)

        # Kademeli strateji: mahalle -> ilce merkezi.
        # NOT: "tam sokak adresi" kademesi bilerek KALDIRILDI. 27 ornek uzerinde
        # olculdu, isabet 0/27 -> OSM'de Turkiye sokak/kapi no kapsami yok.
        # Denenseydi ~600 bosa istek (~11 dk) ekleyecekti.
        denemeler = []
        if mahalle:
            denemeler.append(("mahalle", ", ".join(
                p for p in (mahalle + " Mahallesi", ilce, sehir, "Türkiye") if p)))
        if ilce:
            denemeler.append(("ilce", f"{ilce}, {sehir}, Türkiye"))

        bulundu = False
        for kademe, sorgu in denemeler:
            sonuc = nominatim_sorgu(sorgu, cache)
            if sonuc and koordinat_gecerli(sonuc["lat"], sonuc["lon"], sehir):
                df.at[idx, "lat"] = sonuc["lat"]
                df.at[idx, "lon"] = sonuc["lon"]
                df.at[idx, "geocode_kaynak"] = f"nominatim_{kademe}"
                sayac[kademe] += 1
                bulundu = True
                break
        if not bulundu:
            sayac["basarisiz"] += 1

        if sira % 25 == 0 or sira == len(hedefler):
            gecen = time.time() - baslangic
            print(f"   ... {sira}/{len(hedefler)} islendi  "
                  f"(mahalle={sayac['mahalle']} ilce={sayac['ilce']} "
                  f"basarisiz={sayac['basarisiz']})  {gecen/60:.1f} dk", flush=True)

    cache.kaydet()
    df["geocode_kaynak"] = df["geocode_kaynak"].fillna("basarisiz")

    # Hassasiyet acikca isaretlensin: harita "kesin nokta" gibi gostermesin.
    HASSASIYET = {"erp": "saha_gps", "nominatim_mahalle": "mahalle_merkezi",
                  "nominatim_ilce": "ilce_merkezi", "basarisiz": "yok"}
    df["geocode_hassasiyet"] = df["geocode_kaynak"].map(HASSASIYET).fillna("yok")

    toplam_koord = int(df["lat"].notna().sum())
    bilgi("")
    bilgi(f"SONUC: koordinati olan musteri={toplam_koord} / {len(df)} "
          f"(%{100*toplam_koord/len(df):.1f})")
    for k, v in df["geocode_kaynak"].value_counts().items():
        bilgi(f"   {k:22s} {v:5d}   ({HASSASIYET.get(k, '?')})")

    # Ayni mahalle merkezine dusen musteriler ust uste biner -> haritada bilinmeli
    yigin = (df[df["geocode_kaynak"] == "nominatim_mahalle"]
             .groupby(["lat", "lon"]).size())
    if len(yigin):
        bilgi(f"UYARI: mahalle merkezine dusen {int(yigin.sum())} musteri "
              f"{len(yigin)} noktada yigiliyor (en kalabalik nokta={int(yigin.max())} musteri)")
    return df, {"erp": int(hazir.sum()), **sayac, "toplam_koordinatli": toplam_koord}


# ----------------------------------------------------------------------------
# 7) CIKTI
# ----------------------------------------------------------------------------
CIKTI_KOLONLARI = [
    "musteri_kodu", "unvan", "adres", "sehir", "ilce", "lat", "lon",
    "rut_kod", "rut_aciklama", "ziyaret_sira",
    "son_teslimat_tarihi", "toplam_teslimat_sayisi", "toplam_agirlik", "toplam_tutar",
    # ek baglamsal alanlar (harita/risk ekrani icin)
    "durum", "musteri_grubu", "bolge_grubu", "geocode_kaynak", "geocode_hassasiyet",
    "satis_temsilcileri", "telefon", "posta_kodu",
    "ilk_teslimat_tarihi", "son_teslimattan_gecen_gun",
]


def cikti_hazirla(df: pd.DataFrame) -> pd.DataFrame:
    adim("Cikti tablosunu olustur")
    out = pd.DataFrame(index=df.index)
    out["musteri_kodu"] = df["musteri_kodu"]
    out["unvan"] = metin_temizle(df["MusteriAd"])
    out["adres"] = metin_temizle(df["Adres"])
    out["sehir"] = df["sehir"]
    out["ilce"] = metin_temizle(df["Ilce"])
    out["lat"] = df["lat"].round(7)
    out["lon"] = df["lon"].round(7)
    out["rut_kod"] = df["rut_kod"]
    out["rut_aciklama"] = df["rut_aciklama"]
    out["ziyaret_sira"] = df["ziyaret_sira"]
    out["son_teslimat_tarihi"] = df["son_teslimat_tarihi"].dt.strftime("%Y-%m-%d")
    out["ilk_teslimat_tarihi"] = df["ilk_teslimat_tarihi"].dt.strftime("%Y-%m-%d")
    out["toplam_teslimat_sayisi"] = df["toplam_teslimat_sayisi"]
    out["toplam_agirlik"] = df["toplam_agirlik"]
    out["toplam_tutar"] = df["toplam_tutar"]
    out["son_teslimattan_gecen_gun"] = df["son_teslimattan_gecen_gun"].astype("Int64")
    out["durum"] = metin_temizle(df["Durum"])
    out["musteri_grubu"] = metin_temizle(df["Musterigrup"])
    out["bolge_grubu"] = df["bolge_grubu"]
    out["geocode_kaynak"] = df["geocode_kaynak"]
    out["geocode_hassasiyet"] = df.get("geocode_hassasiyet", pd.Series("yok", index=df.index))
    out["satis_temsilcileri"] = df["satis_temsilcileri"]
    # Telefon %4.8 dolu, CepTelNo %99.6 -> CepTelNo oncelikli
    cep = metin_temizle(df["CepTelNo"])
    sabit = metin_temizle(df["Telefon"])
    out["telefon"] = cep.where(cep != "", sabit)
    out["posta_kodu"] = metin_temizle(df["PostaKodu"])

    out = out[CIKTI_KOLONLARI].sort_values(
        ["sehir", "rut_kod", "ziyaret_sira", "musteri_kodu"], na_position="last"
    ).reset_index(drop=True)
    bilgi(f"cikti tablosu: {len(out)} satir x {len(out.columns)} kolon")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-geocode", action="store_true", help="Nominatim adimini atla")
    ap.add_argument("--geocode-limit", type=int, default=None, help="Sadece N kayit geocode et")
    args = ap.parse_args()

    baslangic = time.time()
    CIKTI_DIZIN.mkdir(parents=True, exist_ok=True)
    rapor: dict = {"calisma_zamani": datetime.now(timezone.utc).isoformat()}

    mus, rut, sev = dosyalari_oku()
    ded, rapor["dedup"] = musteri_dedup(mus)
    iceride, disarida, rapor["bolge"] = bolge_filtrele(ded)
    iceride, rapor["rut"] = rut_birlestir(iceride, rut)
    iceride, rapor["sevkiyat"] = sevkiyat_birlestir(iceride, sev)
    iceride, rapor["geocode"] = geocode_et(iceride, args.skip_geocode, args.geocode_limit)
    out = cikti_hazirla(iceride)

    adim("Dosyalari yaz")
    out.to_csv(CIKTI_ANA, index=False, encoding="utf-8-sig")
    bilgi(f"ANA CIKTI            {CIKTI_ANA.name:32s} {len(out):5d} satir")

    basarisiz = out[out["lat"].isna()]
    basarisiz.to_csv(CIKTI_GEOCODE_BASARISIZ, index=False, encoding="utf-8-sig")
    bilgi(f"geocode basarisiz    {CIKTI_GEOCODE_BASARISIZ.name:32s} {len(basarisiz):5d} satir")

    disarida_out = disarida[["musteri_kodu", "MusteriAd", "sehir", "Ilce", "Durum"]].rename(
        columns={"MusteriAd": "unvan", "Ilce": "ilce", "Durum": "durum"})
    disarida_out.to_csv(CIKTI_BOLGE_DISI, index=False, encoding="utf-8-sig")
    bilgi(f"bolge disi (referans){CIKTI_BOLGE_DISI.name:32s} {len(disarida_out):5d} satir")

    rapor["cikti"] = {
        "satir": len(out), "kolon": len(out.columns),
        "koordinatli": int(out["lat"].notna().sum()),
        "geocode_basarisiz": len(basarisiz),
        "rutlu": int(out["rut_kod"].notna().sum()),
        "sevkiyatli": int((out["toplam_teslimat_sayisi"] > 0).sum()),
        "toplam_ciro": float(out["toplam_tutar"].sum()),
        "toplam_agirlik_kg": float(out["toplam_agirlik"].sum()),
        "sure_sn": round(time.time() - baslangic, 1),
    }
    CIKTI_RAPOR.write_text(json.dumps(rapor, ensure_ascii=False, indent=2), encoding="utf-8")
    bilgi(f"calisma raporu       {CIKTI_RAPOR.name:32s}")

    adim("OZET")
    c = rapor["cikti"]
    bilgi(f"musteri              {c['satir']}")
    bilgi(f"koordinatli          {c['koordinatli']}  (%{100*c['koordinatli']/c['satir']:.1f})")
    bilgi(f"koordinatsiz         {c['geocode_basarisiz']}")
    bilgi(f"rut bilgisi olan     {c['rutlu']}")
    bilgi(f"sevkiyat gecmisi olan{c['sevkiyatli']}")
    bilgi(f"toplam ciro          {c['toplam_ciro']:,.2f} TL")
    bilgi(f"toplam agirlik       {c['toplam_agirlik_kg']:,.1f} kg")
    bilgi(f"sure                 {c['sure_sn']} sn")


if __name__ == "__main__":
    main()
