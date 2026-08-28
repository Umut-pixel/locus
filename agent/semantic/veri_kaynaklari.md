# Veri Kaynakları — Locus

## Tazelik modeli (ÖNEMLİ)

İki farklı tazelik sınıfı var. Karıştırmak "trend" sorularında yanlış cevap üretir:

| Sınıf | Kaynaklar | Davranış |
|---|---|---|
| **Kümülatif** | `musteriler_rapor` (ve `_harita`) | Her sync'te güncellenir, geçmişi taşır |
| **Tek pencere** | `v_panorama_*` | **Yalnız son sync penceresi.** Çok dönemli trend için KULLANMA |
| **Biriken snapshot** | `musteri_metrik_gecmis` | Günlük snapshot — gerçek zaman serisi burada |
| **Manuel** | `urun_skt` | Fabrikadan 15 günde bir, otomatik tazelenmez |

> "Son 6 ayın ciro trendi" gibi bir soru `v_panorama_belge_detay_raporu_guncel`'den
> **cevaplanamaz** — o view yalnız son sync'i tutar. `musteri_metrik_gecmis` kullan
> veya kapsamın sınırını kullanıcıya söyle.

---

## 1. `musteriler_rapor` — ANA KAYNAK
Müşteri bazlı, tek satır = tek müşteri. Çoğu soru buradan cevaplanır.
`musteriler` + `musteri_yaslandirma` + `musteri_belge_ozet` +
`musteri_tahsilat_ozet` join'i.

**Kimlik:** `musteri_kodu` (PK), `unvan`, `sehir`, `ilce`, `adres`, `lat`, `lon`
**Segment:** `musteri_grubu`, `durum`, `belge_st_adi` (temsilci)
**Rut:** `rut_kod`, `rut_aciklama`, `ziyaret_sira`
**Teslimat:** `son_teslimat_tarihi`, `ilk_teslimat_tarihi`, `toplam_teslimat_sayisi`,
  `toplam_agirlik`, `toplam_tutar`, `son_teslimattan_gecen_gun`, `risk_durumu`
**Borç:** `hf_01_06`…`hf_70_ustu`, `yas_toplam`, `yas_riskli_tutar`, `borc_riskli`, `yas_st`
**Ciro:** `belge_brut_ciro`, `belge_net_ciro`, `belge_net_ciro_kdv_dahil`,
  `belge_iskonto_toplam`, `belge_siparis_sayisi`, `belge_fatura_sayisi`,
  `belge_son_islem_tarihi`, `belge_vade_gunu`, `belge_top_urun_grup`, `belge_top_urun`
**Tahsilat (5230, ciro değil):** `son_tahsilat_tarihi`, `tahsilat_7g`,
  `tahsilat_30g`, `tahsilat_ytd`, `odenmemis_tutar`, `odenmemis_adet`

> `musteriler_harita` = aynı gövde + `lat/lon IS NOT NULL` filtresi.
> Finansal toplamlarda **`musteriler_rapor` kullan** — harita view'ı koordinatsız
> müşterileri dışlar ve ciro eksik çıkar (2026-08-18: 12 müşteri / ₺240.626).

## 2. `v_panorama_belge_detay_raporu_guncel` — satır bazlı ciro (5450)
Belge kalemi seviyesi. Ürün/temsilci kırılımı ve iade analizi için.
`islem_tarihi`, `urun_kodu`, `urun`, `miktar`, `nettutar` (KDV dahil!),
`brut_tutar`, `iskonto`, `belge_tip`, `islem_tip`, `urun_grup`,
`satis_temsilcisi`

- Gerçek net satış = `brut_tutar − iskonto` (nettutar'ı ciroda kullanma)
- Ürün bazlı satış: `GROUP BY urun_kodu` (ad için `urun`). `urun_grup` marka/grup —
  SKU değil.
- Belge tipi: `Satış`, `Konsinye Satış`, `Satış - İade`, `Satış-İade`
- `islem_tip` içinde "iade" geçen satırlar iade — ciroya negatif girer ama
  aktivite kırılımlarına (temsilci/ürün) girmez
- Türkçe İ/I tuzağı: `lower()` yerine `islem_tip ILIKE '%iade%'` güvenli değil,
  `replace(replace(islem_tip,'İ','i'),'I','ı')` deseni kullanılır

## 3. `v_panorama_sevkiyat_raporu_kup_guncel` — sevkiyat (5130)
Bir belge = bir sevkiyat. `belge_tarihi` = aracın yüklendiği gün (gerçek).
`musteri_kodu`, `musteri_unvani`, `belge_kod`, `belge_tarihi`, `net_fiyat`,
`agirlik` (gram! kg için /1000), `plaka`, `odeme_tip`

## 4. `v_panorama_siparis_detay_raporu_guncel` — sipariş belge detay (5450 HTTP / 5451 sync)

Grain = kalem. Kimlik = `siparis_no` (Belgekod yok). Tam snapshot: guncel view
son completed 5451. İptal veya faturalaşmış sipariş yeni Excel'de yoksa
listeden düşer.

Açık pipeline: `bekleyen_siparis IN ('Bekleyen Sipariş', 'İrsaliyeleştirildi')`.
Satış kümesi: `belge_tip IN ('Satış', 'Konsinye Satış', 'Satış - İade', 'Satış-İade')`
— Alış / Verilen Sipariş (tedarik) hariç.

> `nettutar` = 5450 Nettutar = **KDV dahil**.
> `iptal_neden` dolu satırları sayma.
> Fatura cirosu için `v_panorama_belge_detay_raporu_guncel` (5450 fatura, Edt_R4=0).
> 5140 `v_panorama_siparis_durum_raporu_guncel` upsert kalıntısı bırakır — bekleyen
> KPI için **kullanma**.

## 4b. `v_panorama_siparis_durum_raporu_guncel` — eski fulfillment (5140)

Upsert (`belge_kod,kalem_sira`). `sevk_tarihi` **nominal/planlanan** — 5130'un
`belge_tarihi`'nden farklı olabilir. Gerçekleşmiş sevkiyat için 5130 kullan.

## 5. `v_panorama_acik_fatura_vade_kup_guncel` — açık fatura
Satır bazlı açık fatura. `musteri_kod`, `musteri`, `belge_kod`, `gun` (gecikme),
`hafta` (bant), `kalan_tutar`, `st` (temsilci).
> `hafta = 'Toplam'` satırlarını **hariç tut** — agregat satırı, çift sayım yapar.

## 6. `v_panorama_detayli_stok_raporu_guncel` — stok (5430)
`urun_kodu`, `urun`, `depo_ad`, `grup` (marka), `urun_hiyerarsi1` (kategori),
`birim`, `kdv`, `fiyat`, `miktar`, `brut_tutar`, `kdvli_tutar`
> `urun_hiyerarsi2` tüm satırlarda boş — kullanma. `miktar <= 0` = stokta yok.
> Satış hızı + stok: 5450 ile `urun_kodu` join. Hizmet/POP satırlarını
> (`grup` Hizmet, fiyat ~0) sipariş listesine koyma.

## 7. `v_panorama_tahsilat_raporu_guncel` — nakit girişi (5230)

Makbuz/çek/senet belgesi = bir satır. **Ciro değil.** `belge_net_ciro` /
`belge_net_ciro_kdv_dahil` fatura Nettutar'ıdır; tahsilat `tutar` +
`odeme_durum`. Açık bakiye (`yas_toplam`) "ne kadar borçlu", 5230 "ne kadar
ödedi".

`islem_tarihi`, `vade_tarihi`, `tutar`, `odeme_durum` (`Ödendi` / `Ödenmedi`),
`tahsilat_tur` (kredi kartı, havale/EFT, alınan çek, senet, nakit),
`musteri_kod`, `satis_temsilcisi`, `belgekod`, `cek_no`

- Nakit girişi: `odeme_durum = 'Ödendi'`
- Operasyonel izleme: `odeme_durum = 'Ödenmedi'` (çek/senet)
- Müşteri özeti (harita): `musteriler_rapor.son_tahsilat_tarihi`,
  `tahsilat_30g`, `odenmemis_tutar` — 5450 ciro kolonlarıyla karıştırma
- `tc_kimlik_no` / `vergi_no` PII — SELECT etme

## 8. `urun_skt` — son kullanma tarihi
Fabrikanın 15 günde bir gönderdiği alış raporundan. Otomatik tazelenmez —
kapsanan tarih aralığını yanıtta belirt.

## 9. `musteri_metrik_gecmis` — zaman serisi
Günlük pg_cron snapshot'ı (05:15 UTC). Gerçek trend analizi için tek doğru kaynak.
`snapshot_tarihi`, `musteri_kodu`, `net_ciro`, `toplam_teslimat_sayisi`

## 10. `agent_konusmalar` / `agent_konusma_mesajlari` — sohbet hafızası
Kullanıcı–asistan konuşmalarının tam metni. Operasyon verisi değil.
Önce `konusma_gecmisi` aracını kullan; SQL ile okuyacaksan yalnız
başlık/özet için `agent_konusmalar`, tam diyalog için mesaj tablosu.
Yazma yok — kalıcı yazım Next.js API üzerinden.
