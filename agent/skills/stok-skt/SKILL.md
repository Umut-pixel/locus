---
name: stok-skt
description: Stok, ürün, marka/kategori ve son kullanma tarihi (SKT) sorularında kullan. "Stokta ne var", "stokta yok", "SKT yaklaşan ürünler" gibi sorular.
---

# Stok & SKT

## Stok — `v_panorama_detayli_stok_raporu_guncel` (5430)

Kolonlar: `urun_kodu`, `urun`, `depo_ad`, `grup` (**marka**),
`urun_hiyerarsi1` (**kategori**), `birim`, `kdv`, `fiyat`, `miktar`,
`brut_tutar`, `kdvli_tutar`

> `urun_hiyerarsi2` tüm satırlarda boş — kullanma.
> `miktar <= 0` = stokta yok.

### Stokta olmayanlar (en aksiyona dönük)

```sql
SELECT urun_kodu, urun, grup AS marka, urun_hiyerarsi1 AS kategori, fiyat
FROM v_panorama_detayli_stok_raporu_guncel
WHERE miktar <= 0
ORDER BY fiyat DESC
```

### Marka bazlı stok değeri

```sql
SELECT grup AS marka,
       COUNT(*)          AS urun_adet,
       SUM(miktar)       AS toplam_miktar,
       SUM(brut_tutar)   AS stok_degeri
FROM v_panorama_detayli_stok_raporu_guncel
GROUP BY grup
ORDER BY stok_degeri DESC
```

## SKT — `urun_skt`

> **Tazelik uyarısı:** Bu tablo Panorama'dan gelmez. Fabrikanın 15 günde bir
> gönderdiği alış raporundan yüklenir ve **otomatik tazelenmez**. Yanıtta
> kapsanan tarih aralığını mutlaka belirt — kullanıcı bunun canlı veri
> olmadığını bilmeli.

Yaklaşan SKT sorularında kalan gün sayısını hesapla ve hangi tarihte
yüklendiğini söyle. Önce `schema_lookup` ile kolon adlarını doğrula.

## Satış hızı + stok

Canlı stok 5430 anlık görüntü. "En çok satılan / stoğa ekle" için
`v_panorama_belge_detay_raporu_guncel` (5450) `urun_kodu` join — o view
son sync penceresidir, çok yıllı trend değil. Join SQL'i ciro-analizi
skill'inde.
