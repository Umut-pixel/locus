# -*- coding: utf-8 -*-
"""Konak Nearby Search smoke-test (1 hücre).

Ortam:
  GOOGLE_PLACES_API_KEY   zorunlu
  (opsiyonel) SUPABASE_URL + SUPABASE_SERVICE_KEY — lat/lon DB'den okunur;
  yoksa hardcode Konak merkezi kullanilir.

Kullanim:
  set GOOGLE_PLACES_API_KEY=AIza...
  python smoke_konak_nearby.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PROJE = Path(__file__).resolve().parent
FALLBACK_LAT, FALLBACK_LON = 38.4187168, 27.1282675


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


def fetch_konak(url: str, key: str) -> tuple[float, float]:
    endpoint = (
        f"{url.rstrip('/')}/rest/v1/ilce_merkezleri"
        f"?il=eq.İzmir&ilce=eq.Konak&select=lat,lon"
    )
    req = urllib.request.Request(
        endpoint,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read().decode("utf-8"))
    if not rows:
        raise RuntimeError("Konak satiri bulunamadi")
    return float(rows[0]["lat"]), float(rows[0]["lon"])


def nearby(api_key: str, lat: float, lon: float, radius: float = 3000) -> dict:
    body = {
        "includedTypes": ["pet_store", "veterinary_care"],
        "maxResultCount": 20,
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lon},
                "radius": radius,
            }
        },
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        "https://places.googleapis.com/v1/places:searchNearby",
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": (
                "places.id,places.displayName,places.formattedAddress,"
                "places.location,places.primaryType,places.types"
            ),
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    load_dotenv(PROJE / ".env")
    api_key = (os.environ.get("GOOGLE_PLACES_API_KEY") or "").strip()
    if not api_key:
        print(
            "GOOGLE_PLACES_API_KEY yok. Ornek:\n"
            "  $env:GOOGLE_PLACES_API_KEY='AIza...'\n"
            "  python smoke_konak_nearby.py",
            file=sys.stderr,
        )
        return 1

    lat, lon = FALLBACK_LAT, FALLBACK_LON
    sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if sb_url and sb_key:
        try:
            lat, lon = fetch_konak(sb_url, sb_key)
            print(f"Konak DB: lat={lat} lon={lon}")
        except Exception as ex:  # noqa: BLE001
            print(f"DB okunamadi ({ex}), fallback kullaniliyor")

    print(f"Nearby Search Konak r=3000 @ {lat},{lon}")
    try:
        result = nearby(api_key, lat, lon)
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code}: {err[:500]}", file=sys.stderr)
        return 1

    places = result.get("places") or []
    print(f"Sonuc: {len(places)} (20=kirpilma)")
    for i, p in enumerate(places[:20], 1):
        name = (p.get("displayName") or {}).get("text")
        print(f"  {i:2d}. {name} | {p.get('primaryType')} | {p.get('formattedAddress')}")

    names = " ".join(
        ((p.get("displayName") or {}).get("text") or "").lower() for p in places
    )
    if "pet" in names or "vet" in names or "mama" in names or "hayvan" in names:
        print("\nSmoke OK — pet/vet benzeri isimler goruldu.")
        return 0
    if places:
        print("\nSmoke OK — sonuc dondu (isim kontrolu zayif).")
        return 0
    print("\nSmoke UYARI — 0 sonuc.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())