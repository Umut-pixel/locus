"""sql_query._jsonable — Postgres tiplerinin JSON'a çevrilebildiğini doğrular.

Çalıştır:  .venv/bin/python evals/test_jsonable.py
"""

from __future__ import annotations

import decimal
import json
import sys
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.sql_query import _jsonable  # noqa: E402

KID = uuid.UUID("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")


def main() -> int:
    failures: list[str] = []

    def check(etiket: str, value: object, expected: object) -> None:
        got = _jsonable(value)
        if got != expected:
            failures.append(f"{etiket}: beklenen {expected!r}, gelen {got!r}")
            print(f"  FAIL  {etiket}")
        else:
            print(f"  ok    {etiket}")

    check("uuid", KID, str(KID))
    check("decimal", decimal.Decimal("19.90"), "19.90")
    check("date", date(2026, 8, 1), "2026-08-01")
    check("time", time(14, 30), "14:30:00")
    check("timedelta", timedelta(hours=1), 3600.0)
    check("bytes", b"x", "<binary>")
    check("none", None, None)
    check("int", 951, 951)
    check("nested-uuid", {"id": KID, "adet": 3}, {"id": str(KID), "adet": 3})
    check("uuid-list", [KID], [str(KID)])

    payload = [{"id": _jsonable(KID), "tutar": _jsonable(decimal.Decimal("10.5"))}]
    try:
        body = json.dumps(payload, ensure_ascii=False, default=str)
    except TypeError as err:
        failures.append(f"json.dumps: {err}")
        print("  FAIL  json.dumps")
    else:
        if str(KID) not in body:
            failures.append("json.dumps UUID string içermiyor")
            print("  FAIL  json.dumps")
        else:
            print("  ok    json.dumps")

    print()
    if failures:
        print(f"{len(failures)} BAŞARISIZ:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("Tüm testler geçti.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
