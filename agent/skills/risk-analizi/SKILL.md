---
name: risk-analizi
description: Risk, borç, açık bakiye, tahsilat ve yaşlandırma sorularında kullan. "Riskli müşteriler", "kim borçlu", "açık bakiye" gibi sorular.
---

# Risk & Borç Analizi

## ⚠️ Önce: hangi risk?

İki ayrı kavram. Kullanıcı belirtmezse **sor**.

### Sevkiyat riski (teslimat gecikmesi)
`risk_durumu` kolonunda hazır — yeniden hesaplama:
`riskli` >90 gün, `izlenmeli` >45 gün, `saglikli`, `hic_teslimat_yok`

```sql
SELECT risk_durumu, COUNT(*) FROM musteriler_rapor GROUP BY risk_durumu
```

### Borç riski (yaşlandırma)
Hesaplanmalı. Önemlilik eşiği **1 TL** — `borc_riskli` bayrağını kullanma:

```sql
SELECT
  CASE
    WHEN yas_toplam IS NULL    THEN 'yaslandirma_yok'
    WHEN yas_riskli_tutar >= 1 THEN 'riskli'
    WHEN yas_toplam       >= 1 THEN 'borclu'
    ELSE 'temiz'
  END AS borc_risk,
  COUNT(*)         AS musteri_sayisi,
  SUM(yas_toplam)  AS toplam_acik_bakiye
FROM musteriler_rapor
GROUP BY 1
```

## Yaşlandırma bantları

`hf_01_06` … `hf_70_ustu` (gecikme günü). `yas_toplam` = hepsinin toplamı.
`yas_riskli_tutar` = 56+ gün (yani `hf_56_62 + hf_63_69 + hf_70_ustu`).

```sql
SELECT SUM(hf_01_06) AS "1-6", SUM(hf_07_13) AS "7-13", SUM(hf_14_20) AS "14-20",
       SUM(hf_21_27) AS "21-27", SUM(hf_28_34) AS "28-34", SUM(hf_35_41) AS "35-41",
       SUM(hf_42_48) AS "42-48", SUM(hf_49_55) AS "49-55", SUM(hf_56_62) AS "56-62",
       SUM(hf_63_69) AS "63-69", SUM(hf_70_ustu) AS "70+"
FROM musteriler_rapor
```

## En riskli müşteriler

```sql
SELECT unvan, sehir, ilce, belge_st_adi AS temsilci,
       yas_toplam AS acik_bakiye, yas_riskli_tutar AS riskli_tutar
FROM musteriler_rapor
WHERE yas_riskli_tutar >= 1
ORDER BY yas_riskli_tutar DESC
LIMIT 20
```

## Fatura bazlı drill-down

`v_panorama_acik_fatura_vade_kup_guncel` — `hafta = 'Toplam'` satırlarını
**hariç tut** (agregat, çift sayım yapar):

```sql
SELECT musteri, belge_kod, gun, kalan_tutar
FROM v_panorama_acik_fatura_vade_kup_guncel
WHERE hafta <> 'Toplam' AND kalan_tutar > 0
ORDER BY gun DESC
```

## Tahsilat ≠ ciro

`yas_toplam` açık bakiyedir (ne kadar borçlu). Nakit girişi
`v_panorama_tahsilat_raporu_guncel` (5230) veya `musteriler_rapor.tahsilat_30g`.
`belge_net_ciro_kdv_dahil` fatura Nettutar'ıdır — tahsilat sanma.

```sql
SELECT SUM(tutar::numeric) AS odenen
FROM v_panorama_tahsilat_raporu_guncel
WHERE odeme_durum = 'Ödendi'
```

```sql
SELECT unvan, tahsilat_30g, odenmemis_tutar, yas_toplam
FROM musteriler_rapor
WHERE yas_toplam >= 1
ORDER BY tahsilat_30g ASC NULLS FIRST
LIMIT 20
```
