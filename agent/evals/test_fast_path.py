"""fast_path — rota haritası bağlam notunun eşleşmeden önce ayıklanması.

DB gerekmez. Çalıştır:  .venv/bin/python evals/test_fast_path.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from middleware.fast_path import _strip_baglam_notu  # noqa: E402
from templates.catalog import match_template  # noqa: E402

SORU = "Toplam kaç müşteri var?"
NOT_OZET = "[Rota haritası ekranı — Taslak: otomatik kaydediliyor (~1,5sn gecikmeyle), son yazım 3sn önce. Seçili: yok (tüm plan görünüyor). Plan özeti: 2 araç, 14 durak yerleşti, 3 durak havuzda, ort. doluluk %62, toplam 118 km.]"
NOT_DEGISMEDI = "[Rota haritası ekranı — durum önceki mesajla aynı]"


def main() -> int:
    failures: list[str] = []

    def fail(msg: str) -> None:
        failures.append(msg)
        print(f"  FAIL  {msg}")

    def ok(msg: str) -> None:
        print(f"  ok    {msg}")

    # Not YOKKEN davranış değişmemeli.
    if _strip_baglam_notu(SORU) != SORU:
        fail(f"notsuz metin değişti: {_strip_baglam_notu(SORU)!r}")
    else:
        ok("bağlam notu yokken metin aynen kalıyor")

    # Tam özet notu ayıklanınca geriye yalnız soru kalmalı.
    stripped = _strip_baglam_notu(f"{NOT_OZET}\n\n{SORU}")
    if stripped != SORU:
        fail(f"özet notu tam ayıklanmadı: {stripped!r}")
    else:
        ok("özet bağlam notu ayıklandı")

    # "durum önceki mesajla aynı" işaretçisi de aynı şekilde ayıklanmalı.
    stripped2 = _strip_baglam_notu(f"{NOT_DEGISMEDI}\n\n{SORU}")
    if stripped2 != SORU:
        fail(f"'değişmedi' notu ayıklanmadı: {stripped2!r}")
    else:
        ok("'durum önceki mesajla aynı' notu ayıklandı")

    # Asıl motivasyon: bağlam notuyla gelen tam eşleşen bir soru artık
    # match_template'e düşebiliyor — düzeltmeden önce hiçbir zaman düşemiyordu
    # çünkü not tam string eşleşmesini bozuyordu.
    dogrudan = match_template(SORU)
    notlu_ham = match_template(f"{NOT_OZET}\n\n{SORU}")
    notlu_ayiklanmis = match_template(_strip_baglam_notu(f"{NOT_OZET}\n\n{SORU}"))
    if dogrudan is None:
        fail("kontrol: notsuz soru zaten eşleşmiyor, test katalogla senkron değil")
    elif notlu_ham is not None:
        fail("beklenmedik: ham (ayıklanmamış) metin zaten eşleşiyor")
    elif notlu_ayiklanmis is None or notlu_ayiklanmis.template_id != dogrudan.template_id:
        fail("ayıklama sonrası hâlâ eşleşmiyor — fast_path düzeltmesi çalışmıyor")
    else:
        ok(f"bağlam notlu mesaj ayıklama sonrası '{dogrudan.template_id}' ile eşleşiyor")

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
