# -*- coding: utf-8 -*-
"""
CSV -> Nominatim geocode -> ilce_merkezleri upsert (tek seferlik seed).

Kullanim:
    python backend/geocode_ilce_merkezleri.py
    python backend/geocode_ilce_merkezleri.py --csv path/to/ilce_merkezleri_referans.csv

Ortam:
    SUPABASE_URL, SUPABASE_SERVICE_KEY  (.env veya shell)
"""
from __future__ import annotations

import csv
import json
import os
import sys
import time
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

MIN_DOGRULANDI = 120


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


def il_in_display(il: str, display: str) -> bool:
    if not display:
        return False
    d = fold_tr(display)
    # Accept both dotted/dotless and ASCII forms Nominatim may return
    variants = {fold_tr(il)}
    ascii_map = {
        "İzmir": ["izmir", "ızmir"],
        "Muğla": ["mugla", "muğla"],
        "Aydın": ["aydin", "aydın"],
        "Balıkesir": ["balikesir", "balıkesir"],
        "Çanakkale": ["canakkale", "çanakkale"],
        "Uşak": ["usak", "uşak"],
        "Manisa": ["manisa"],
        "Denizli": ["denizli"],
    }
    for v in ascii_map.get(il, []):
        variants.add(v)
    return any(v in d for v in variants if v)


def nominatim(ilce: str, il: str) -> dict | None:
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


def upsert_rows(url: str, key: str, rows: list[dict]) -> None:
    endpoint = f"{url.rstrip('/')}/rest/v1/{TABLO}?on_conflict=il,ilce"
    body = json.dumps(rows, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        endpoint, data=body, headers=supabase_headers(key), method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Supabase upsert HTTP {e.code}: {err}") from e


def main() -> int:
    load_dotenv(REPO_KOK / ".env")
    csv_path = CSV_DEFAULT
    if len(sys.argv) >= 3 and sys.argv[1] == "--csv":
        csv_path = Path(sys.argv[2])

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

    print(f"CSV: {len(rows_in)} satır — Nominatim başlıyor (≈{len(rows_in) * BEKLEME_S:.0f}s)")

    out: list[dict] = []
    eksik: list[str] = []
    dogru = 0

    for i, (il, ilce) in enumerate(rows_in, 1):
        time.sleep(BEKLEME_S)
        display = None
        lat = lon = None
        ok = False
        try:
            hit = nominatim(ilce, il)
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

    # yoğun sayısı doğrula
    yogun_n = sum(1 for il, ilce in rows_in if (il, ilce) in YOGUN)
    print()
    print(f"Toplam: {len(rows_in)} | dogrulandi=true: {dogru} | yoğun işaretlenen (CSV eşleşen): {yogun_n}")
    if eksik:
        print(f"\nEksik / dogrulandi=false ({len(eksik)}):")
        for line in eksik:
            print(f"  - {line}")

    if dogru < MIN_DOGRULANDI:
        print(
            f"\nDUR: dogrulandi={dogru} < {MIN_DOGRULANDI}. "
            "Elle gözden geçir; sessizce devam etme.",
            file=sys.stderr,
        )
        return 2

    print(f"\nGeçti: dogrulandi={dogru} >= {MIN_DOGRULANDI}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())