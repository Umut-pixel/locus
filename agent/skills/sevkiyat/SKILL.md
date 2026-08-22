---
name: sevkiyat
description: Sevkiyat, teslimat, rut, plaka/araç ve bekleyen sipariş sorularında kullan. "Hangi rut", "en son ne sevk edildi", "bekleyen siparişler" gibi sorular.
---

# Sevkiyat & Teslimat

## Kaynak seçimi

| Soru | Kaynak |
|---|---|
| Müşteri bazlı teslimat durumu / rut performansı | `musteriler_rapor` |
| Gerçekleşmiş tek tek sevkiyatlar, plaka, ödeme tipi | `v_panorama_sevkiyat_raporu_kup_guncel` (5130) |
| Bekleyen / irsaliyeli siparişler | `v_panorama_siparis_durum_raporu_guncel` (5140) |

> **Tarih tuzağı:** 5140'ın `sevk_tarihi` alanı **planlanan** tarihtir; 5130'un
> `belge_tarihi` aracın gerçekten yüklendiği gündür. "En son ne sevk edildi"
> sorusu için **5130** kullan.

## Rut performansı

```sql
SELECT rut_kod, rut_aciklama,
       COUNT(*)                    AS musteri_sayisi,
       SUM(toplam_tutar)           AS toplam_tutar,
       ROUND(AVG(son_teslimattan_gecen_gun)) AS ort_gecikme_gun,
       COUNT(*) FILTER (WHERE risk_durumu = 'riskli') AS riskli_musteri
FROM musteriler_rapor
WHERE rut_kod IS NOT NULL
GROUP BY rut_kod, rut_aciklama
ORDER BY toplam_tutar DESC
```

## Son sevkiyatlar

`agirlik` alanı **gram** — kg için 1000'e böl.

```sql
SELECT belge_kod, musteri_unvani, belge_tarihi,
       net_fiyat, agirlik / 1000.0 AS agirlik_kg, plaka, odeme_tip
FROM v_panorama_sevkiyat_raporu_kup_guncel
ORDER BY belge_tarihi DESC, belge_kod DESC
LIMIT 50
```

## Plaka / araç kırılımı

```sql
SELECT plaka,
       COUNT(*)                  AS teslimat_sayisi,
       SUM(net_fiyat)            AS toplam_tutar,
       SUM(agirlik) / 1000.0     AS toplam_kg
FROM v_panorama_sevkiyat_raporu_kup_guncel
WHERE plaka IS NOT NULL
GROUP BY plaka
ORDER BY toplam_tutar DESC
```

## Bekleyen siparişler

`bekleyen_siparis` üç değer alır. "Faturalaştırıldı" tamamlanmıştır —
aksiyon gerektirenler ilk ikisi:

```sql
SELECT belge_kod, musteri_unvan, islem_tarihi, bekleyen_siparis,
       SUM(genel_toplam) AS tutar
FROM v_panorama_siparis_durum_raporu_guncel
WHERE bekleyen_siparis IN ('Bekleyen Sipariş', 'İrsaliyeleştirildi')
GROUP BY belge_kod, musteri_unvan, islem_tarihi, bekleyen_siparis
ORDER BY islem_tarihi ASC
```
