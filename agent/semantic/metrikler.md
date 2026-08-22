# Metrik Sözlüğü — Locus

> Bu dosya agent'ın **tek doğruluk kaynağı**. Bir metrik burada tanımlı değilse
> uydurma; kullanıcıya "bu metrik tanımlı değil" de.

## ⚠️ Ciro — en sık yapılan hata

Panorama ERP'nin "Nettutar" alanı adının aksine **KDV DAHİL**'dir. Şemada üç ayrı
ciro kolonu var ve karıştırılırsa %20 sapma olur:

| Kolon | Anlam | Ne zaman kullan |
|---|---|---|
| `belge_brut_ciro` | İskonto öncesi brüt satış | "brüt ciro" açıkça istenirse |
| `belge_net_ciro` | **KDV HARİÇ** net satış = `brut_ciro − iskonto_toplam` | **VARSAYILAN** — "ciro" dendiğinde bu |
| `belge_net_ciro_kdv_dahil` | Panorama "Nettutar" = KDV **dahil** | "KDV dahil" / "tahsil edilen" denirse |

**Kural:** Kullanıcı sadece "ciro" derse → `belge_net_ciro` (KDV hariç).
Yanıtta hangisini kullandığını **her zaman belirt**: "₺47.831.052 (KDV hariç net ciro)".

`belge_iskonto_toplam` = uygulanan toplam iskonto.
Doğrulama: `belge_net_ciro_kdv_dahil ≈ belge_net_ciro × 1.20` (%20 KDV).

## Risk — İKİ ayrı kavram, karıştırma

Aynı `risk_durumu` etiketi iki farklı şey ölçebilir. Kullanıcı hangisini
kastettiğini söylemezse **sor**.

### 1. Sevkiyat riski (teslimat gecikmesi)
`musteriler_rapor.risk_durumu` kolonunda **hazır gelir** — SQL'de yeniden hesaplama.
`son_teslimat_tarihi`'ne göre view içinde hesaplanır:

| Değer | Koşul | Etiket |
|---|---|---|
| `hic_teslimat_yok` | `toplam_teslimat_sayisi = 0` veya `son_teslimat_tarihi IS NULL` | Hiç teslimat yok |
| `riskli` | son teslimattan > 90 gün | Riskli (>90 gün) |
| `izlenmeli` | son teslimattan > 45 gün | İzlenmeli (>45 gün) |
| `saglikli` | diğer | Sağlıklı |

### 2. Borç riski (yaşlandırma)
Kolonda **hazır yok** — tutarlardan hesaplanır. Önemlilik eşiği **1 TL**
(kuruşluk yuvarlama artıkları müşteriyi yanlışlıkla "riskli" yapmasın diye):

```sql
CASE
  WHEN yas_toplam IS NULL              THEN 'hic_teslimat_yok'  -- yaşlandırma verisi yok
  WHEN yas_riskli_tutar >= 1           THEN 'riskli'            -- 56+ gün gecikmiş borç
  WHEN yas_toplam       >= 1           THEN 'izlenmeli'         -- borcu var ama 56 gün altı
  ELSE 'saglikli'                                               -- temiz
END
```

> `borc_riskli` boolean kolonunu **kullanma** — "56+ günde bir kuruş bile var mı"
> sorusunun cevabı, önemlilik bilgisi taşımıyor. 2026-08-11 ölçümü: 112 "riskli"
> müşterinin 42'si (%37,5) aslında 1 TL altı artıktı.

Borç modunda etiketler farklı: `saglikli`→"Temiz", `izlenmeli`→"Borçlu",
`riskli`→"Riskli borç (56+ gün)".

## Borç yaşlandırma bantları

`musteri_yaslandirma` (view'da `hf_*` olarak) — gecikme günü bazlı açık bakiye:

| Kolon | Bant |
|---|---|
| `hf_01_06` | 1–6 gün |
| `hf_07_13` | 7–13 gün |
| `hf_14_20` | 14–20 gün |
| `hf_21_27` | 21–27 gün |
| `hf_28_34` | 28–34 gün |
| `hf_35_41` | 35–41 gün |
| `hf_42_48` | 42–48 gün |
| `hf_49_55` | 49–55 gün |
| `hf_56_62` | 56–62 gün |
| `hf_63_69` | 63–69 gün |
| `hf_70_ustu` | 70+ gün |

- `yas_toplam` = tüm bantların toplamı (toplam açık bakiye)
- `yas_riskli_tutar` = 56+ gün bantları toplamı (riskli alacak)
- `yas_st` = satış temsilcisi (yaşlandırma tarafındaki)

## Diğer metrikler

| Metrik | Kolon | Not |
|---|---|---|
| Açık bakiye | `yas_toplam` | Bant filtresi varsa o bandın kolonu kullanılır |
| Teslimat sayısı | `toplam_teslimat_sayisi` | Kümülatif |
| Son teslimattan geçen gün | `son_teslimattan_gecen_gun` | `current_date` ile canlı hesaplanır |
| Satış temsilcisi | `belge_st_adi` | View'da "temsilci" alanı yok, en yakın karşılık bu |
| Segment / kanal | `musteri_grubu` | Petshop / Veteriner / Yem toptan vb. |
| Ağırlık | `toplam_agirlik` | kg |

## Coğrafi kapsam

8 il: AYDIN, BALIKESİR, ÇANAKKALE, DENİZLİ, İZMİR, MANİSA, MUĞLA, UŞAK.
`sehir` kolonu **büyük harf** tutulur — filtrede `sehir = 'BALIKESİR'` (Türkçe İ dikkat).
Bu 8 il dışındaki ciro `rapor_bolge_disi_ozet` view'ında (mutabakat için).
