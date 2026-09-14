# -*- coding: utf-8 -*-
"""
CSV -> Nominatim geocode -> ilce_merkezleri upsert.

VARSAYILAN DAVRANIS: DB'de ZATEN VAR OLAN (il, ilce) satirlari ATLANIR.
Sebebi kritik — bu script her satira `yogun_bolge` yaziyor ve YOGUN seti
yalniz 21 Ege ilcesini taniyor. Mevcut satirlari tekrar yazmak, n8n
workflow'unun kirpilma geri beslemesiyle OGRENDIGI yogunluklari (canlida
Izmir'de 21 ilce yogun, sette 8 tane var) sessizce false'a cekerdi; o ilceler
4 hucre + 3 Text Search yerine tek hucreye duserdi. `--tumu` ile zorlanabilir.

Kullanim:
    python backend/geocode_ilce_merkezleri.py            # yalniz eksikler
    python backend/geocode_ilce_merkezleri.py --tumu     # hepsini yeniden yaz
    python backend/geocode_ilce_merkezleri.py --limit 20 # ilk N eksik (deneme)
    python backend/geocode_ilce_merkezleri.py --csv path/to/referans.csv

Ortam:
    SUPABASE_URL, SUPABASE_SERVICE_KEY  (.env veya shell)

Not: Nominatim iskalari lat/lon = NULL, dogrulandi = false ile yazilir.
Poligon merkezine (backend/ilce_poligon_merkezleri.json) OTOMATIK dusulmez —
ilce poligonunun geometrik merkezi kirsalda yerlesimden 15-20 km uzakta
olabiliyor ve 5 km yaricapli tarama sessizce bos doner, sonra da o ilceye
son_tarama yazilip 25 gun kilitlenirdi. O dosya ELLE backfill icin.
"""
from __future__ import annotations

import csv
import json
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BACKEND = Path(__file__).resolve().parent
REPO_KOK = BACKEND.parent
PROJE = BACKEND
CSV_DEFAULT = BACKEND / "ilce_merkezleri_referans.csv"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "locus-ilce-geocode/1.0 (umut@celixion.com)"
BEKLEME_S = 1.05
TABLO = "ilce_merkezleri"
YOGUN_KOLON = "yoğun_bolge"

# (il, ilce) — brief §6
YOGUN = {
    ("İzmir", "Konak"),
    ("İzmir", "Bornova"),
    ("İzmir", "Buca"),
    ("İzmir", "Karşıyaka"),
    ("İzmir", "Bayraklı"),
    ("İzmir", "Karabağlar"),
    ("İzmir", "Çiğli"),
    ("İzmir", "Gaziemir"),
    ("Manisa", "Şehzadeler"),
    ("Manisa", "Yunusemre"),
    ("Aydın", "Efeler"),
    ("Muğla", "Bodrum"),
    ("Muğla", "Fethiye"),
    ("Muğla", "Marmaris"),
    ("Denizli", "Merkezefendi"),
    ("Denizli", "Pamukkale"),
    ("Balıkesir", "Karesi"),
    ("Balıkesir", "Altıeylül"),
    ("Balıkesir", "Bandırma"),
    ("Çanakkale", "Merkez"),
    ("Uşak", "Merkez"),
}

# Islenen satirin en az bu oraninda dogrulandi=true bekleniyor; altinda
# sessizce devam etmek yerine duruyoruz (toplu bir Nominatim bozulmasini yakalar).
MIN_DOGRULANDI_ORAN = 0.85
CACHE_YOLU = BACKEND / "geocode_cache.json"


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def fold_tr(s: str) -> str:
    """Türkçe-aware casefold for containment checks."""
    if not s:
        return ""
    # Explicit İ/I handling before casefold
    s = s.replace("İ", "i").replace("I", "ı")
    return s.casefold()


def soy_diakritik(s: str) -> str:
    """Turkce harfleri ASCII karsiligina indirger: Sanliurfa == Şanlıurfa."""
    s = fold_tr(s)
    s = s.replace("ı", "i").replace("ğ", "g").replace("ü", "u")
    s = s.replace("ş", "s").replace("ö", "o").replace("ç", "c")
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c))


def il_in_display(il: str, display: str) -> bool:
    """Nominatim'in dondurdugu display_name gercekten bu ilde mi.

    Eski surum yalniz 8 Ege ili icin elle yazilmis bir ascii_map tasiyordu;
    diger 73 ilde Nominatim ASCII katlanmis ad donerse (Sanliurfa, Kirsehir,
    Agri) eslesme kaciyordu. Artik iki tarafi da diakritiksize indiriyoruz.
    """
    if not display:
        return False
    return soy_diakritik(il) in soy_diakritik(display)


def nominatim(ilce: str, il: str) -> dict | None:
    # "Merkez, Bilecik, Türkiye" Nominatim icin belirsiz (51 ilde Merkez adli
    # ilce var). Il merkezini sormak dogru sonucu veriyor. CSV artik merkez
    # ilcesini il adiyla yaziyor; geriye yalniz Canakkale/Merkez ve
    # Usak/Merkez eski satirlari kaliyor.
    if fold_tr(ilce) == "merkez":
        q = f"{il}, Türkiye"
    else:
        q = f"{ilce}, {il}, Türkiye"
    params = urllib.parse.urlencode(
        {"q": q, "format": "json", "limit": "1", "countrycodes": "tr"}
    )
    req = urllib.request.Request(
        f"{NOMINATIM}?{params}",
        headers={"User-Agent": UA, "Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if not data:
        return None
    return data[0]


def supabase_headers(key: str) -> dict:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def upsert_rows(url: str, key: str, rows: list[dict], deneme: int = 4) -> None:
    """Batch upsert — gecici ag/gateway hatalarinda yeniden dener.

    2026-09-14: 81 il seed'i 340/831'de tek bir `504 Gateway Timeout` yuzunden
    oldu (script SystemExit ediyordu). ~6 dakikalik Nominatim emegi ve
    calisan bir tur, saniyelik bir Supabase hicksirigina feda ediliyordu.
    Upsert idempotent (on_conflict=il,ilce), yani yeniden denemek guvenli.
    """
    endpoint = f"{url.rstrip('/')}/rest/v1/{TABLO}?on_conflict=il,ilce"
    body = json.dumps(rows, ensure_ascii=False).encode("utf-8")

    for tur in range(1, deneme + 1):
        req = urllib.request.Request(
            endpoint, data=body, headers=supabase_headers(key), method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                resp.read()
            return
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            # 4xx istemci hatasi: tekrar denemek ayni sonucu verir, hemen dur.
            if e.code < 500 and e.code != 429:
                raise SystemExit(f"Supabase upsert HTTP {e.code}: {err}") from e
            son = f"HTTP {e.code}: {err}"
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            son = f"{type(e).__name__}: {e}"

        if tur == deneme:
            raise SystemExit(f"Supabase upsert {deneme} denemede basarisiz — {son}")
        bekle = 2 ** tur
        print(f"  (upsert {tur}/{deneme} basarisiz: {son[:120]} — {bekle}s sonra tekrar)")
        time.sleep(bekle)


def mevcut_ilceler(url: str, key: str) -> set[tuple[str, str]]:
    """DB'de zaten olan (il, ilce) ciftleri — bunlar yeniden yazilmaz."""
    endpoint = f"{url.rstrip('/')}/rest/v1/{TABLO}?select=il,ilce&limit=2000"
    req = urllib.request.Request(
        endpoint,
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        rows = json.loads(resp.read().decode("utf-8"))
    return {(r["il"], r["ilce"]) for r in rows}


def cache_oku() -> dict:
    if not CACHE_YOLU.is_file():
        return {}
    try:
        veri = json.loads(CACHE_YOLU.read_text(encoding="utf-8"))
        return veri if isinstance(veri, dict) else {}
    except Exception:  # noqa: BLE001 — bozuk cache calismayi durdurmasin
        return {}


def cache_yaz(cache: dict) -> None:
    try:
        CACHE_YOLU.write_text(
            json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8"
        )
    except Exception as ex:  # noqa: BLE001
        print(f"  (cache yazilamadi: {ex})")


def main() -> int:
    load_dotenv(REPO_KOK / ".env")
    argv = sys.argv[1:]
    csv_path = CSV_DEFAULT
    tumu = "--tumu" in argv
    limit = 0
    if "--csv" in argv:
        csv_path = Path(argv[argv.index("--csv") + 1])
    if "--limit" in argv:
        limit = int(argv[argv.index("--limit") + 1])

    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("SUPABASE_URL / SUPABASE_SERVICE_KEY eksik", file=sys.stderr)
        return 1
    if not csv_path.is_file():
        print(f"CSV yok: {csv_path}", file=sys.stderr)
        return 1

    rows_in: list[tuple[str, str]] = []
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            il, ilce = (r.get("il") or "").strip(), (r.get("ilce") or "").strip()
            if il and ilce:
                rows_in.append((il, ilce))

    toplam_csv = len(rows_in)
    if tumu:
        print(f"CSV: {toplam_csv} satır — --tumu: mevcutlar da yeniden yazılacak")
        print("  ⚠ yoğun_bolge sıfırlanır (bkz. dosya başı notu)")
    else:
        var = mevcut_ilceler(url, key)
        rows_in = [r for r in rows_in if r not in var]
        print(f"CSV: {toplam_csv} satır | DB'de var: {len(var)} | işlenecek: {len(rows_in)}")
    if limit:
        rows_in = rows_in[:limit]
        print(f"  --limit {limit} → {len(rows_in)} satır")
    if not rows_in:
        print("İşlenecek satır yok — DB güncel.")
        return 0

    cache = cache_oku()
    cache_isabet = 0
    print(f"Nominatim başlıyor (≈{len(rows_in) * BEKLEME_S / 60:.1f} dk, cache: {len(cache)} kayıt)")

    out: list[dict] = []
    eksik: list[str] = []
    dogru = 0

    for i, (il, ilce) in enumerate(rows_in, 1):
        display = None
        lat = lon = None
        ok = False
        cache_anahtar = f"{il}|{ilce}"
        try:
            hit = cache.get(cache_anahtar)
            if hit is not None:
                cache_isabet += 1
            else:
                time.sleep(BEKLEME_S)
                hit = nominatim(ilce, il)
                cache[cache_anahtar] = hit
                if i % 20 == 0:
                    cache_yaz(cache)
            if hit:
                display = hit.get("display_name")
                lat_s, lon_s = hit.get("lat"), hit.get("lon")
                if lat_s and lon_s:
                    lat, lon = float(lat_s), float(lon_s)
                    ok = il_in_display(il, display or "")
                    # Nominatim Mugla: display_name frequently omits province name.
                    if (not ok) and il == "Muğla" and display and fold_tr(ilce) in fold_tr(display):
                        if 36.2 <= lat <= 37.8 and 27.0 <= lon <= 29.8:
                            ok = True
        except Exception as ex:  # noqa: BLE001 — satır bazında devam
            print(f"  [{i}/{len(rows_in)}] HATA {il}/{ilce}: {ex}")
            hit = None

        if not ok:
            eksik.append(f"{il}/{ilce} | display={display!r}")
        else:
            dogru += 1

        yogun = (il, ilce) in YOGUN
        rec = {
            "il": il,
            "ilce": ilce,
            "lat": lat,
            "lon": lon,
            "nominatim_display_name": display,
            YOGUN_KOLON: yogun,
            "dogrulandi": ok,
        }
        out.append(rec)
        flag = "OK" if ok else "!"
        print(
            f"  [{i}/{len(rows_in)}] {flag} {il}/{ilce} "
            f"yogun={yogun} lat={lat} | {(display or '')[:80]}"
        )

        # küçük batch upsert (her 20 satırda) — yarım kalırsa kısmi kayıt kalsın
        if len(out) >= 20:
            upsert_rows(url, key, out)
            out = []

    if out:
        upsert_rows(url, key, out)

    cache_yaz(cache)

    # yoğun sayısı doğrula
    yogun_n = sum(1 for il, ilce in rows_in if (il, ilce) in YOGUN)
    print()
    print(
        f"Toplam: {len(rows_in)} | dogrulandi=true: {dogru} "
        f"| cache isabet: {cache_isabet} | yoğun işaretlenen (CSV eşleşen): {yogun_n}"
    )
    if eksik:
        print(f"\nEksik / dogrulandi=false ({len(eksik)}):")
        for line in eksik:
            print(f"  - {line}")

    esik = int(len(rows_in) * MIN_DOGRULANDI_ORAN)
    if dogru < esik:
        print(
            f"\nDUR: dogrulandi={dogru} < {esik} "
            f"(işlenen {len(rows_in)} satırın %{MIN_DOGRULANDI_ORAN * 100:.0f}'i). "
            "Elle gözden geçir; sessizce devam etme.",
            file=sys.stderr,
        )
        return 2

    print(f"\nGeçti: dogrulandi={dogru} >= {esik}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())