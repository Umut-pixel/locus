---
name: ciro-analizi
description: Ciro, iskonto, iade ve satış temsilcisi/ürün kırılımı sorularında kullan. "Ciro ne kadar", "hangi temsilci en çok sattı", "iade oranı" gibi sorular.
---

# Ciro Analizi

## Önce hangi kolon?

| Kullanıcı ne dedi | Kolon |
|---|---|
| "ciro" (belirtmeden) | `belge_net_ciro` — KDV hariç |
| "KDV dahil ciro", "tahsil edilen" | `belge_net_ciro_kdv_dahil` |
| "brüt ciro", "iskonto öncesi" | `belge_brut_ciro` |

Yanıtta hangisini kullandığını yaz.

## Müşteri bazlı toplam (çoğu soru)

```sql
SELECT sehir,
       SUM(belge_net_ciro)            AS net_ciro_kdv_haric,
       SUM(belge_brut_ciro)           AS brut_ciro,
       SUM(belge_iskonto_toplam)      AS iskonto,
       COUNT(*)                       AS musteri_sayisi
FROM musteriler_rapor
WHERE belge_net_ciro IS NOT NULL
GROUP BY sehir
ORDER BY net_ciro_kdv_haric DESC
```

## Satır bazlı kırılım (ürün / temsilci / iade)

`v_panorama_belge_detay_raporu_guncel` — **yalnız son sync penceresi**.

Gerçek net satış = `brut_tutar − iskonto`. `nettutar` KDV dahildir, ciroda kullanma.

```sql
SELECT satis_temsilcisi,
       SUM(brut_tutar - iskonto) AS net_satis
FROM v_panorama_belge_detay_raporu_guncel
WHERE satis_temsilcisi IS NOT NULL
GROUP BY satis_temsilcisi
ORDER BY net_satis DESC
```

## İade

`islem_tip` içinde "iade" geçen satırlar. Türkçe İ/I tuzağı var —
`lower()` güvenilir değil:

```sql
WHERE replace(replace(islem_tip, 'İ', 'i'), 'I', 'ı') ILIKE '%iade%'
```

İadeler ciroya negatif girer ama temsilci/ürün kırılımına girmez.

## Trend

`v_panorama_*` tek pencere olduğu için trend veremez.
Gerçek zaman serisi: `musteri_metrik_gecmis` (`snapshot_tarihi`, `net_ciro`).
