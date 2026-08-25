"""Home / slash kilitli sorular — SQL ve cevap formatı.

Tam eşleşme veya `build_spec(id, slots)`. Çıplak "ciro" / belirsiz risk
buraya düşmez — router Opus veya clarify.
"""

from __future__ import annotations

import re

from templates.format import (
    as_decimal,
    as_int,
    format_number,
    format_try,
    maybe_table,
)
from templates.match import (
    QueryOutcome,
    TemplateSpec,
    BAND_RE,
    ILCE_RE,
    SEVK_RE,
    SEHIR_OZET_RE,
    is_quoted_prompt,
    sql_literal,
    tr_fold,
    tr_upper,
)

# UI SKT_UYARI_GUN ile aynı.
SKT_UYARI_GUN = 90

SEVKIYAT_RISK_LABEL = {
    "saglikli": "Sağlıklı",
    "izlenmeli": "İzlenmeli (>45 gün)",
    "riskli": "Riskli (>90 gün)",
    "hic_teslimat_yok": "Hiç teslimat yok",
}

HF_BANDS: dict[str, str] = {
    "1-6": "hf_01_06",
    "7-13": "hf_07_13",
    "14-20": "hf_14_20",
    "21-27": "hf_21_27",
    "28-34": "hf_28_34",
    "35-41": "hf_35_41",
    "42-48": "hf_42_48",
    "49-55": "hf_49_55",
    "56-62": "hf_56_62",
    "63-69": "hf_63_69",
    "70+": "hf_70_ustu",
}

_HF_28_PLUS = (
    "COALESCE(hf_28_34,0) + COALESCE(hf_35_41,0) + COALESCE(hf_42_48,0) + "
    "COALESCE(hf_49_55,0) + COALESCE(hf_56_62,0) + COALESCE(hf_63_69,0) + "
    "COALESCE(hf_70_ustu,0)"
)


def _empty_or_error(outcome: QueryOutcome, empty: str) -> str | None:
    if not outcome.ok:
        return outcome.message
    if not outcome.rows:
        return empty
    return None


def _count_render(label: str, empty: str):
    def render(outcome: QueryOutcome) -> str:
        err = _empty_or_error(outcome, empty)
        if err is not None:
            return err
        sayi = as_int(outcome.rows[0].get("sayi"))
        return f"{label}: **{format_number(sayi)}**."

    return render


def _render_net_ciro(outcome: QueryOutcome) -> str:
    err = _empty_or_error(outcome, "KDV hariç net ciro: ₺0 (satır yok).")
    if err is not None:
        return err
    tutar = as_decimal(outcome.rows[0].get("net_ciro"))
    return f"{format_try(tutar)} (KDV hariç net ciro)."


def _render_risk_kirilim(outcome: QueryOutcome) -> str:
    err = _empty_or_error(outcome, "Teslimat riski kırılımı: kayıt yok.")
    if err is not None:
        return err
    labeled: list[tuple[str, int]] = []
    for row in outcome.rows:
        key = str(row.get("risk_durumu") or "")
        ad = SEVKIYAT_RISK_LABEL.get(key, key or "—")
        labeled.append((ad, as_int(row.get("sayi"))))
    labeled.sort(key=lambda x: -x[1])
    table_rows = [[ad, format_number(n)] for ad, n in labeled]
    bits = [f"{ad} {format_number(n)}" for ad, n in labeled]
    summary = "Teslimat riski (son teslimat gecikmesi): " + ", ".join(bits) + "."
    return maybe_table(["Durum", "Müşteri"], table_rows, fallback=summary)


def _render_borc_30(outcome: QueryOutcome) -> str:
    err = _empty_or_error(
        outcome,
        "28+ gün bandında (rapordaki 30 gün eşiğine en yakın) borçlu müşteri yok.",
    )
    if err is not None:
        return err
    table_rows: list[list[str]] = []
    for row in outcome.rows:
        table_rows.append(
            [
                str(row.get("unvan") or "—"),
                str(row.get("sehir") or "—"),
                str(row.get("ilce") or "—"),
                format_try(row.get("bakiye_28_plus"), kurus=True),
            ]
        )
    n = format_number(len(table_rows))
    summary = (
        f"{n} müşteride 28+ gün gecikmiş açık bakiye var "
        "(raporda 30 gün kırılımı yok; 28–34 bandından itibaren). "
        "Tutarlar KDV dahil yaşlandırma bakiyesidir."
    )
    return maybe_table(
        ["Müşteri", "Şehir", "İlçe", "28+ gün"],
        table_rows,
        fallback=summary,
    )


def _render_ilce(ilce: str):
    def render(outcome: QueryOutcome) -> str:
        err = _empty_or_error(
            outcome, f"{ilce}: bu ilçe/şehir adıyla müşteri yok."
        )
        if err is not None:
            return err
        row = outcome.rows[0]
        sayi = format_number(row.get("musteri_sayisi"))
        ciro = format_try(row.get("net_ciro"))
        borc = format_try(row.get("acik_bakiye"), kurus=True)
        risk = format_number(row.get("sevkiyat_riskli"))
        return (
            f"{ilce}: {sayi} müşteri, {ciro} KDV hariç net ciro, "
            f"{borc} açık bakiye, {risk} teslimat-riskli (>90 gün)."
        )

    return render


def _render_yas_bant(label: str):
    def render(outcome: QueryOutcome) -> str:
        err = _empty_or_error(
            outcome, f"{label} gün bandında açık bakiye yok."
        )
        if err is not None:
            return err
        tutar = outcome.rows[0].get("tutar")
        return (
            f"{label} gün gecikme bandındaki açık bakiye: "
            f"{format_try(tutar, kurus=True)}."
        )

    return render


def _render_skt(outcome: QueryOutcome) -> str:
    err = _empty_or_error(
        outcome,
        f"Önümüzdeki {SKT_UYARI_GUN} günde SKT'si dolacak tarihli kayıt yok. "
        "SKT tablosu fabrikadan yüklenir, otomatik tazelenmez.",
    )
    if err is not None:
        return err
    yuklenen = [
        str(r.get("yuklendi_at") or "")[:10]
        for r in outcome.rows
        if r.get("yuklendi_at")
    ]
    aralik = ""
    if yuklenen:
        aralik = f" Yükleme tarihi: {min(yuklenen)} – {max(yuklenen)}."
    table_rows: list[list[str]] = []
    for row in outcome.rows:
        gun = row.get("gun_kalan")
        gun_s = format_number(gun) if gun is not None else "—"
        table_rows.append(
            [
                str(row.get("urun_adi") or "—"),
                str(row.get("skt_tarihi") or "—"),
                gun_s,
                str(row.get("parti_no") or "—"),
            ]
        )
    summary = (
        f"{format_number(len(table_rows))} ürünün SKT'si {SKT_UYARI_GUN} gün içinde "
        f"(veya geçmiş). Fabrika alış raporu — canlı stok değil.{aralik}"
    )
    return maybe_table(
        ["Ürün", "SKT", "Kalan gün", "Parti"],
        table_rows,
        fallback=summary,
    )


def _render_son_sevk(kim: str):
    def render(outcome: QueryOutcome) -> str:
        err = _empty_or_error(outcome, f"{kim}: sevkiyat kaydı yok (5130).")
        if err is not None:
            return err
        table_rows: list[list[str]] = []
        for row in outcome.rows:
            table_rows.append(
                [
                    str(row.get("belge_kod") or "—"),
                    str(row.get("belge_tarihi") or "—")[:10],
                    format_try(row.get("net_fiyat")),
                    format_number(row.get("agirlik_kg")) + " kg",
                    str(row.get("plaka") or "—"),
                ]
            )
        summary = (
            f"{kim} — son {format_number(len(table_rows))} sevkiyat "
            "(5130, belge tarihi = gerçek yükleme)."
        )
        return maybe_table(
            ["Belge", "Tarih", "Tutar", "Kg", "Plaka"],
            table_rows,
            fallback=summary,
        )

    return render


def _render_sehir(sehir: str):
    def render(outcome: QueryOutcome) -> str:
        err = _empty_or_error(
            outcome, f"{sehir}: bu şehir adıyla müşteri yok."
        )
        if err is not None:
            return err
        row = outcome.rows[0]
        sayi = format_number(row.get("musteri_sayisi"))
        ciro = format_try(row.get("net_ciro"))
        borc = format_try(row.get("acik_bakiye"), kurus=True)
        return (
            f"{sehir}: {sayi} müşteri, {ciro} (KDV hariç net ciro), "
            f"{borc} açık bakiye."
        )

    return render


def _durum_sql(filtre: str) -> str:
    return (
        "SELECT COUNT(*) AS sayi FROM musteriler_rapor "
        f"WHERE durum ILIKE {sql_literal(filtre)}"
    )


def _diger_sql() -> str:
    return (
        "SELECT COUNT(*) AS sayi FROM musteriler_rapor "
        "WHERE COALESCE(durum, '') NOT ILIKE '%aktif%' "
        "AND COALESCE(durum, '') NOT ILIKE '%pasif%' "
        "AND COALESCE(durum, '') NOT ILIKE '%iptal%' "
        "AND COALESCE(durum, '') NOT ILIKE '%İptal%'"
    )


def _risk_sql(deger: str) -> str:
    return (
        "SELECT COUNT(*) AS sayi FROM musteriler_rapor "
        f"WHERE risk_durumu = {sql_literal(deger)}"
    )


def _borc_sql(kind: str) -> str:
    if kind == "temiz":
        where = (
            "yas_toplam IS NOT NULL AND COALESCE(yas_riskli_tutar, 0) < 1 "
            "AND COALESCE(yas_toplam, 0) < 1"
        )
    elif kind == "kisa":
        where = (
            "COALESCE(yas_toplam, 0) >= 1 AND COALESCE(yas_riskli_tutar, 0) < 1"
        )
    elif kind == "riskli":
        where = "COALESCE(yas_riskli_tutar, 0) >= 1"
    else:
        where = "yas_toplam IS NULL"
    return f"SELECT COUNT(*) AS sayi FROM musteriler_rapor WHERE {where}"


def _sehir_sql(slot: str) -> str:
    raw = slot.strip()
    upper = tr_upper(raw)
    return (
        "SELECT COUNT(*) AS musteri_sayisi, "
        "COALESCE(SUM(belge_net_ciro), 0) AS net_ciro, "
        "COALESCE(SUM(yas_toplam), 0) AS acik_bakiye "
        "FROM musteriler_rapor "
        f"WHERE sehir = {sql_literal(upper)} OR sehir ILIKE {sql_literal(raw)}"
    )


def _ilce_sql(slot: str) -> str:
    lit = sql_literal(slot.strip())
    return (
        "SELECT COUNT(*) AS musteri_sayisi, "
        "COALESCE(SUM(belge_net_ciro), 0) AS net_ciro, "
        "COALESCE(SUM(yas_toplam), 0) AS acik_bakiye, "
        "COUNT(*) FILTER (WHERE risk_durumu = 'riskli') AS sevkiyat_riskli "
        "FROM musteriler_rapor "
        f"WHERE ilce ILIKE {lit} OR sehir ILIKE {lit}"
    )


def _band_sql(kolon: str) -> str:
    return f"SELECT COALESCE(SUM({kolon}), 0) AS tutar FROM musteriler_rapor"


def _sevk_sql(kim: str) -> str:
    lit = sql_literal(kim.strip())
    return (
        "SELECT belge_kod, musteri_unvani, belge_tarihi, net_fiyat, "
        "agirlik / 1000.0 AS agirlik_kg, plaka "
        "FROM v_panorama_sevkiyat_raporu_kup_guncel "
        f"WHERE musteri_unvani ILIKE {lit} OR musteri_kodu ILIKE {lit} "
        "ORDER BY belge_tarihi DESC, belge_kod DESC LIMIT 6"
    )


_SKT_SQL = (
    "SELECT urun_kodu, urun_adi, skt_tarihi, parti_no, tek_parti, yuklendi_at, "
    "(skt_tarihi - CURRENT_DATE) AS gun_kalan "
    "FROM urun_skt "
    "WHERE durum = 'tarihli' AND skt_tarihi IS NOT NULL "
    f"AND skt_tarihi <= CURRENT_DATE + {SKT_UYARI_GUN} "
    "ORDER BY skt_tarihi ASC LIMIT 20"
)

_CIRO_SQL = (
    "SELECT COALESCE(SUM(belge_net_ciro), 0) AS net_ciro FROM musteriler_rapor"
)

_KIRILIM_SQL = (
    "SELECT risk_durumu, COUNT(*) AS sayi FROM musteriler_rapor "
    "GROUP BY risk_durumu"
)

_BORC_30_SQL = (
    "SELECT unvan, sehir, ilce, "
    f"({_HF_28_PLUS}) AS bakiye_28_plus "
    "FROM musteriler_rapor "
    f"WHERE ({_HF_28_PLUS}) >= 1 "
    "ORDER BY bakiye_28_plus DESC LIMIT 20"
)


def _exact_specs() -> dict[str, TemplateSpec]:
    items: list[tuple[str, TemplateSpec]] = [
        (
            "Toplam kaç müşteri var?",
            TemplateSpec(
                "musteri_toplam",
                "SELECT COUNT(*) AS sayi FROM musteriler_rapor",
                _count_render("Toplam müşteri", "Müşteri yok."),
            ),
        ),
        (
            "Toplam müşteri sayısı nedir?",
            TemplateSpec(
                "musteri_toplam",
                "SELECT COUNT(*) AS sayi FROM musteriler_rapor",
                _count_render("Toplam müşteri", "Müşteri yok."),
            ),
        ),
        (
            "Aktif müşteri sayısı nedir?",
            TemplateSpec(
                "musteri_durum_aktif",
                _durum_sql("%aktif%"),
                _count_render("Aktif müşteri", "Aktif müşteri yok."),
            ),
        ),
        (
            "Pasif müşteri sayısı nedir?",
            TemplateSpec(
                "musteri_durum_pasif",
                _durum_sql("%pasif%"),
                _count_render("Pasif müşteri", "Pasif müşteri yok."),
            ),
        ),
        (
            "İptal müşteri sayısı nedir?",
            TemplateSpec(
                "musteri_durum_iptal",
                (
                    "SELECT COUNT(*) AS sayi FROM musteriler_rapor "
                    "WHERE durum ILIKE '%iptal%' OR durum ILIKE '%İptal%'"
                ),
                _count_render("İptal müşteri", "İptal müşteri yok."),
            ),
        ),
        (
            "Durumu belirsiz müşteri sayısı nedir?",
            TemplateSpec(
                "musteri_durum_diger",
                _diger_sql(),
                _count_render(
                    "Durumu belirsiz müşteri",
                    "Durumu belirsiz müşteri yok.",
                ),
            ),
        ),
        (
            "Bu dönem net ciro (KDV hariç) nedir?",
            TemplateSpec("net_ciro", _CIRO_SQL, _render_net_ciro),
        ),
        (
            "Risk durumuna göre müşteri sayısı nedir?",
            TemplateSpec(
                "sevkiyat_risk_kirilim", _KIRILIM_SQL, _render_risk_kirilim
            ),
        ),
        (
            "Sağlıklı teslimat durumundaki müşteri sayısı nedir?",
            TemplateSpec(
                "sevkiyat_risk_saglikli",
                _risk_sql("saglikli"),
                _count_render(
                    "Sağlıklı teslimat (son teslimat ≤45 gün)",
                    "Sağlıklı teslimat durumunda müşteri yok.",
                ),
            ),
        ),
        (
            "İzlenmeli müşteri sayısı nedir?",
            TemplateSpec(
                "sevkiyat_risk_izlenmeli",
                _risk_sql("izlenmeli"),
                _count_render(
                    "İzlenmeli teslimat (>45 gün)",
                    "İzlenmeli müşteri yok.",
                ),
            ),
        ),
        (
            "Riskli müşteri sayısı nedir?",
            TemplateSpec(
                "sevkiyat_risk_riskli",
                _risk_sql("riskli"),
                _count_render(
                    "Teslimat riskli (>90 gün)",
                    "Teslimat-riskli müşteri yok.",
                ),
            ),
        ),
        (
            "Hiç teslimatı olmayan müşteri sayısı nedir?",
            TemplateSpec(
                "sevkiyat_risk_yok",
                _risk_sql("hic_teslimat_yok"),
                _count_render(
                    "Hiç teslimatı olmayan müşteri",
                    "Teslimatsız müşteri yok.",
                ),
            ),
        ),
        (
            "Borcu temiz müşteri sayısı nedir?",
            TemplateSpec(
                "borc_temiz",
                _borc_sql("temiz"),
                _count_render("Borcu temiz müşteri", "Temiz bakiye yok."),
            ),
        ),
        (
            "Açık bakiyesi olan ama 56 gün altı müşteri sayısı nedir?",
            TemplateSpec(
                "borc_kisa",
                _borc_sql("kisa"),
                _count_render(
                    "Açık bakiyesi 56 gün altı müşteri",
                    "Bu dilimde müşteri yok.",
                ),
            ),
        ),
        (
            "56 gün ve üzeri riskli borcu olan müşteri sayısı nedir?",
            TemplateSpec(
                "borc_56",
                _borc_sql("riskli"),
                _count_render(
                    "56+ gün riskli borcu olan müşteri",
                    "56+ gün riskli borçlu müşteri yok.",
                ),
            ),
        ),
        (
            "Yaşlandırma verisi olmayan müşteri sayısı nedir?",
            TemplateSpec(
                "borc_verisiz",
                _borc_sql("verisiz"),
                _count_render(
                    "Yaşlandırma verisi olmayan müşteri",
                    "Yaşlandırması eksik müşteri yok.",
                ),
            ),
        ),
        (
            "30 günü aşan borçlu müşterileri listele",
            TemplateSpec("borc_30_plus", _BORC_30_SQL, _render_borc_30),
        ),
        (
            "Son kullanma tarihi yaklaşan ürünler neler?",
            TemplateSpec("skt_yaklasan", _SKT_SQL, _render_skt),
        ),
    ]
    out: dict[str, TemplateSpec] = {}
    for prompt, spec in items:
        out[tr_fold(prompt)] = spec
    for label, kolon in HF_BANDS.items():
        prompt = f"{label} gün gecikme bandındaki açık bakiye nedir?"
        out[tr_fold(prompt)] = TemplateSpec(
            f"yas_bant_{kolon}",
            _band_sql(kolon),
            _render_yas_bant(label),
        )
    return out


EXACT: dict[str, TemplateSpec] = _exact_specs()
BY_ID: dict[str, TemplateSpec] = {}
for _spec in EXACT.values():
    BY_ID[_spec.template_id] = _spec

ALLOWED_TEMPLATE_IDS: frozenset[str] = frozenset(
    set(BY_ID) | {"ilce_teslimat_borc", "son_sevk", "sehir_ozet", "yas_bant"}
)


def match_template(text: str) -> TemplateSpec | None:
    raw = (text or "").strip()
    if not raw or is_quoted_prompt(raw):
        return None
    folded = tr_fold(raw)
    hit = EXACT.get(folded)
    if hit is not None:
        return hit

    band = BAND_RE.match(folded)
    if band:
        key = re.sub(r"\s+", "", band.group(1))
        kolon = HF_BANDS.get(key)
        if kolon:
            return TemplateSpec(
                f"yas_bant_{kolon}",
                _band_sql(kolon),
                _render_yas_bant(key),
            )

    ilce_m = ILCE_RE.match(raw)
    if ilce_m:
        ilce = ilce_m.group(1).strip()
        if ilce:
            return TemplateSpec(
                "ilce_teslimat_borc",
                _ilce_sql(ilce),
                _render_ilce(ilce),
            )

    sevk_m = SEVK_RE.match(raw)
    if sevk_m:
        kim = sevk_m.group(1).strip()
        if kim:
            return TemplateSpec(
                "son_sevk",
                _sevk_sql(kim),
                _render_son_sevk(kim),
            )

    sehir_m = SEHIR_OZET_RE.match(raw)
    if sehir_m:
        sehir = sehir_m.group(1).strip()
        if sehir:
            return TemplateSpec(
                "sehir_ozet",
                _sehir_sql(sehir),
                _render_sehir(sehir),
            )
    return None


def _band_label(kolon: str) -> str:
    for label, name in HF_BANDS.items():
        if name == kolon:
            return label
    return kolon


def build_spec(
    template_id: str,
    slots: dict[str, str] | None = None,
) -> TemplateSpec | None:
    """Router / test — eşleşme cümlesine bağlı olmadan spec üret."""
    tid = (template_id or "").strip()
    if not tid:
        return None
    extra = {k: (v or "").strip() for k, v in (slots or {}).items()}

    if tid == "ilce_teslimat_borc":
        ilce = extra.get("ilce") or extra.get("sehir") or ""
        if not ilce:
            return None
        return TemplateSpec(tid, _ilce_sql(ilce), _render_ilce(ilce))
    if tid == "son_sevk":
        kim = extra.get("kim") or extra.get("unvan") or extra.get("musteri") or ""
        if not kim:
            return None
        return TemplateSpec(tid, _sevk_sql(kim), _render_son_sevk(kim))
    if tid == "sehir_ozet":
        sehir = extra.get("sehir") or extra.get("ilce") or ""
        if not sehir:
            return None
        return TemplateSpec(tid, _sehir_sql(sehir), _render_sehir(sehir))
    if tid.startswith("yas_bant_"):
        kolon = tid.removeprefix("yas_bant_")
        if kolon not in HF_BANDS.values():
            return None
        return TemplateSpec(tid, _band_sql(kolon), _render_yas_bant(_band_label(kolon)))
    if tid == "yas_bant":
        key = re.sub(r"\s+", "", extra.get("band") or "").replace("–", "-")
        kolon = HF_BANDS.get(key)
        if not kolon:
            return None
        return TemplateSpec(
            f"yas_bant_{kolon}",
            _band_sql(kolon),
            _render_yas_bant(key),
        )

    return BY_ID.get(tid)
