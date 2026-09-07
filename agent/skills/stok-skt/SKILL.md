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
> `miktar` **ERP (Panorama) rakamıdır**, fiziksel sayım değil. Depo sayım föyü
> yüklüyse `urun_skt.parti_miktar` toplamı bundan sapabiliyor — 2026-09-07
> föyünde 92 üründen 71'i tutmuyor, net +3.344 adet (%11,5). Miktar sorusunda
> sayım föyü de varsa iki rakamı da söyle, birini diğerinin yerine koyma.

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

> **Tazelik uyarısı:** Bu tablo Panorama'dan gelmez, **otomatik tazelenmez**.
> Yanıtta hangi dosyadan ve ne zaman yüklendiğini mutlaka belirt — kullanıcı
> bunun canlı veri olmadığını bilmeli.

İki kaynak besliyor, `kaynak` kolonu söylüyor. Tablo tek snapshot tutuyor:
hangi dosya en son yüklendiyse tablonun tamamı odur, ikisi bir arada olmaz.

| `kaynak` | Dosya | Dolu alanlar | Boş alanlar |
|---|---|---|---|
| `fabrika` | ARMA İlaç alış raporu, 15 günde bir | `islem_tarihi`, `matbu_no`, `satir_miktar` | `depo_stok`, `parti_miktar` |
| `depo_sayim` | Depo SKT sayım föyü | `depo_stok`, `parti_miktar` | `islem_tarihi`, `matbu_no`, `satir_miktar` |

- `parti_miktar` — o partide **fiziksel olarak sayılan** adet. Sayım föyünde
  "bu SKT'den şu kadar var" cevabı verilebilir; fabrika dosyasında verilemez
  (orada miktar kalem düzeyinde ve çok partili kalemlerde bölünemiyor,
  `tek_parti = false` bunu işaretler).
- `depo_stok` — föydeki ERP rakamı; ürünün tüm satırlarında aynı, toplarken
  `max(depo_stok)` kullan, `sum` yanlış sonuç verir.

### ERP ↔ fiziksel sayım farkı

```sql
SELECT urun_kodu, urun_adi,
       MAX(depo_stok)                  AS erp_stok,
       COALESCE(SUM(parti_miktar), 0)  AS sayim,
       COALESCE(SUM(parti_miktar), 0) - MAX(depo_stok) AS fark
FROM urun_skt
WHERE kaynak = 'depo_sayim'
GROUP BY urun_kodu, urun_adi
HAVING COALESCE(SUM(parti_miktar), 0) <> MAX(depo_stok)
ORDER BY ABS(COALESCE(SUM(parti_miktar), 0) - MAX(depo_stok)) DESC
```

Yaklaşan SKT sorularında kalan gün sayısını hesapla ve hangi tarihte
yüklendiğini söyle. Önce `schema_lookup` ile kolon adlarını doğrula.

## Satış hızı + stok

Canlı stok 5430 anlık görüntü. "En çok satılan / stoğa ekle" için
`v_panorama_belge_detay_raporu_guncel` (5450) `urun_kodu` join — o view
son sync penceresidir, çok yıllı trend değil. Join SQL'i ciro-analizi
skill'inde.
