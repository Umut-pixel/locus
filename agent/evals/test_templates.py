"""Şablon fast-path — eşleşme, eşleşmeme, SQL guard.

DB gerekmez. Çalıştır:  .venv/bin/python evals/test_templates.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.sql_guard import SqlGuardError, validate_sql  # noqa: E402
from templates.catalog import EXACT, match_template  # noqa: E402
from templates.format import format_number, format_try, maybe_table  # noqa: E402
from templates.match import TemplateSpec, is_quoted_prompt  # noqa: E402


QUOTE = (
    "Kullanıcı önceki yanıttan şu parçayı işaretledi. "
    "Yalnız bu alıntıya yanıt ver; alıntı dışını gerekmedikçe genişletme.\n"
    "Alıntı: «951 aktif müşteri»\n\n"
    "Aktif müşteri sayısı nedir?"
)

MUST_MISS = [
    "Riskli müşterilerimi listele",
    "Toplam ciromuz ne kadar?",
    QUOTE,
    "selam",
    "neden ciro düştü",
]

MUST_HIT = [
    ("Toplam kaç müşteri var?", "musteri_toplam"),
    ("Toplam müşteri sayısı nedir?", "musteri_toplam"),
    ("Aktif müşteri sayısı nedir?", "musteri_durum_aktif"),
    ("Pasif müşteri sayısı nedir?", "musteri_durum_pasif"),
    ("İptal müşteri sayısı nedir?", "musteri_durum_iptal"),
    ("Durumu belirsiz müşteri sayısı nedir?", "musteri_durum_diger"),
    ("Bu dönem net ciro (KDV hariç) nedir?", "net_ciro"),
    ("Risk durumuna göre müşteri sayısı nedir?", "sevkiyat_risk_kirilim"),
    ("Sağlıklı teslimat durumundaki müşteri sayısı nedir?", "sevkiyat_risk_saglikli"),
    ("İzlenmeli müşteri sayısı nedir?", "sevkiyat_risk_izlenmeli"),
    ("Riskli müşteri sayısı nedir?", "sevkiyat_risk_riskli"),
    ("Hiç teslimatı olmayan müşteri sayısı nedir?", "sevkiyat_risk_yok"),
    ("Borcu temiz müşteri sayısı nedir?", "borc_temiz"),
    ("Açık bakiyesi olan ama 56 gün altı müşteri sayısı nedir?", "borc_kisa"),
    ("56 gün ve üzeri riskli borcu olan müşteri sayısı nedir?", "borc_56"),
    ("Yaşlandırma verisi olmayan müşteri sayısı nedir?", "borc_verisiz"),
    ("30 günü aşan borçlu müşterileri listele", "borc_30_plus"),
    ("Son kullanma tarihi yaklaşan ürünler neler?", "skt_yaklasan"),
    ("1–6 gün gecikme bandındaki açık bakiye nedir?", "yas_bant_hf_01_06"),
    ("70+ gün gecikme bandındaki açık bakiye nedir?", "yas_bant_hf_70_ustu"),
    (
        "Balıkesir'deki müşterilerin toplam açık bakiyesi ve cirosu ne?",
        "sehir_ozet",
    ),
]


class _FakeOutcome:
    def __init__(self, *, ok: bool = True, rows: list | None = None, message: str = ""):
        self.ok = ok
        self.rows = rows or []
        self.message = message


def main() -> int:
    failures: list[str] = []

    def fail(msg: str) -> None:
        failures.append(msg)
        print(f"  FAIL  {msg}")

    def ok(msg: str) -> None:
        print(f"  ok    {msg}")

    for prompt, expected_id in MUST_HIT:
        spec = match_template(prompt)
        if spec is None:
            fail(f"HIT yok: {prompt!r}")
            continue
        if spec.template_id != expected_id:
            fail(f"HIT id {spec.template_id!r} != {expected_id!r} ({prompt!r})")
            continue
        try:
            guarded = validate_sql(spec.sql)
        except SqlGuardError as err:
            fail(f"SQL reddedildi {expected_id}: {err}")
            continue
        if "LIMIT" not in guarded.sql.upper():
            fail(f"LIMIT yok: {expected_id}")
            continue
        ok(f"HIT {expected_id}")

    for prompt in MUST_MISS:
        spec = match_template(prompt)
        if spec is not None:
            fail(f"MISS beklenirdi, {spec.template_id} geldi: {prompt[:48]!r}")
        else:
            ok(f"MISS {prompt[:40]!r}")

    if is_quoted_prompt(QUOTE) is False:
        fail("QUOTE işareti tanınmadı")
    else:
        ok("quoted prompt")

    ilce = match_template("Bornova teslimat ve borç durumu nedir?")
    if ilce is None or ilce.template_id != "ilce_teslimat_borc":
        fail("ilce slot")
    elif "Bornova" not in ilce.sql and "BORNOVA" not in ilce.sql:
        fail("ilce SQL slot değeri yok")
    else:
        try:
            validate_sql(ilce.sql)
            ok("ilce slot")
        except SqlGuardError as err:
            fail(f"ilce SQL: {err}")

    sevk = match_template("PATİGO PET SHOP son sevkiyatları nedir?")
    if sevk is None or sevk.template_id != "son_sevk":
        fail("son_sevk slot")
    else:
        try:
            validate_sql(sevk.sql)
            if "v_panorama_sevkiyat_raporu_kup_guncel" not in sevk.sql:
                fail("son_sevk yanlış view")
            elif "sevk_tarihi" in sevk.sql:
                fail("son_sevk 5140 sevk_tarihi kullanmamalı")
            else:
                ok("son_sevk slot")
        except SqlGuardError as err:
            fail(f"son_sevk SQL: {err}")

    if format_try(1_234_567) != "₺1.234.567":
        fail(f"format_try {format_try(1_234_567)!r}")
    else:
        ok("format_try")
    if format_number(951) != "951":
        fail(f"format_number {format_number(951)!r}")
    else:
        ok("format_number")

    ciro = EXACT.get("bu dönem net ciro (kdv hariç) nedir?")
    # folded key — lookup via match
    ciro = match_template("Bu dönem net ciro (KDV hariç) nedir?")
    assert ciro is not None
    rendered = ciro.render(_FakeOutcome(rows=[{"net_ciro": "47831052"}]))
    if "KDV hariç" not in rendered or "₺47.831.052" not in rendered:
        fail(f"ciro render: {rendered!r}")
    else:
        ok("ciro render KDV hariç")

    borc = match_template("30 günü aşan borçlu müşterileri listele")
    assert borc is not None
    borc_txt = borc.render(
        _FakeOutcome(
            rows=[
                {"unvan": "A", "sehir": "İZMİR", "ilce": "BORNOVA", "bakiye_28_plus": "100"},
                {"unvan": "B", "sehir": "İZMİR", "ilce": "KONAK", "bakiye_28_plus": "200"},
                {"unvan": "C", "sehir": "MANİSA", "ilce": "YUNUSEMRE", "bakiye_28_plus": "300"},
            ]
        )
    )
    if "28+" not in borc_txt or "```locus" not in borc_txt:
        fail(f"borc_30 render: {borc_txt[:200]!r}")
    else:
        fence = borc_txt.split("```locus", 1)[1].split("```", 1)[0]
        payload = json.loads(fence)
        if payload.get("kind") != "table" or len(payload.get("rows") or []) < 3:
            fail("locus table satır")
        else:
            ok("borc_30 locus table")

    two = maybe_table(["A"], [["1"], ["2"]], fallback="iki")
    if "```locus" in two:
        fail("2 satırda tablo açılmamalı")
    else:
        ok("maybe_table eşiği")

    for spec in EXACT.values():
        if not isinstance(spec, TemplateSpec):
            fail("EXACT spec tipi")
            break
    else:
        ok(f"EXACT {len(EXACT)} kilit")

    print()
    if failures:
        print(f"{len(failures)} BAŞARISIZ:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("Tüm template testleri geçti.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
