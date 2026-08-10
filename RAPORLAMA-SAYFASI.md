# Raporlama Sayfası — Veri Akışı (`/raporlar`)

Bu doküman `/raporlar` sayfasının nasıl çalıştığını, hangi Supabase
tablo/view'larından beslendiğini ve filtre/sayfalama/dışa aktarma
mekanizmalarının nasıl işlediğini anlatır. Kod değişmeden bu dosyayı
güncel tutun; kolon adları ve dosya yolları burada birebir koddan alınmıştır.

---

## 1. Bileşen hiyerarşisi

```
app/(app)/raporlar/page.tsx            ← sayfa, filtre/sayfa state'i burada
  ├─ MusteriRaporlamaFilters.tsx        ← arama + risk/segment/temsilci/il/ilçe dropdown'ları + dışa aktar
  ├─ MusteriRaporlamaTable.tsx          ← satır listesi + sayfalama + her satırda ciro sparkline'ı
  │    └─ useMusteriTrend()             ← yalnızca görünen sayfanın 14 günlük ciro trendi
  └─ MusteriRaporlamaSummary.tsx        ← alt bar: toplam müşteri, toplam net ciro, risk dağılımı
```

Veri çekme mantığının tamamı `frontend/hooks/useMusteriRaporlama.ts` içinde
toplanmıştır; sayfa yalnızca `filters`/`page` state'ini tutar ve hook'u çağırır.

---

## 2. Supabase kaynakları

Hepsi `frontend/lib/supabase.ts`'te sabit olarak tanımlı; istemci **yalnızca
anon key** kullanır (service_role yok, RLS ile korunur — bkz. §6).

| Sabit | Gerçek tablo/view | Bu sayfada kullanımı |
|---|---|---|
| `MUSTERILER_HARITA_VIEW` | `musteriler_harita` (view) | Satırlar, filtreler, özet — **tek kaynak** |
| `MUSTERI_METRIK_GECMIS_TABLE` | `musteri_metrik_gecmis` (tablo) | Her satırdaki 14 günlük ciro sparkline'ı |

### 2.1 `musteriler_harita` view'ının kökeni

Rapor sayfası bu view'ı tek bir tablo gibi okur, ama view aslında üç tabloyu
birleştirir (tanım: `sema.sql`):

```
musteriler  (temel müşteri master — Panorama'dan ETL ile beslenir)
  left join musteri_yaslandirma   (ST yaşlandırma / açık bakiye — her yüklemede tam snapshot)
  left join musteri_belge_ozet    (BelgeDetayRaporu — dönemsel ciro/sipariş özeti)
  where lat is not null and lon is not null
```

`risk_durumu` **view içinde `CASE WHEN` ile hesaplanır** (`son_teslimattan_gecen_gun`
ve `toplam_teslimat_sayisi`'a göre); frontend risk'i asla yeniden hesaplamaz,
sadece view'dan gelen değeri okur:

```sql
case
  when toplam_teslimat_sayisi = 0     then 'hic_teslimat_yok'
  when son_teslimattan_gecen_gun > 90 then 'riskli'
  when son_teslimattan_gecen_gun > 45 then 'izlenmeli'
  else 'saglikli'
end as risk_durumu
```

View `security_invoker = true` ile tanımlı ve `anon, authenticated`'a `grant select`
verilmiş; harita sayfası (`/`) da aynı view'ı okur — rapor ve harita **aynı
risk tanımını** paylaşır, iki ayrı hesaplama yok.

### 2.2 Raporlama satırının seçtiği kolonlar

`useMusteriRaporlama.ts` içindeki `ROW_SELECT` sabiti, view'dan çekilen dar
kolon setidir (`MusteriRaporSatiri` tipiyle bire bir eşleşir):

```
musteri_kodu, unvan, sehir, ilce, musteri_grubu, durum, belge_st_adi,
risk_durumu, belge_net_ciro, belge_siparis_sayisi, belge_fatura_sayisi,
belge_son_islem_tarihi, yas_toplam, yas_riskli_tutar,
son_teslimat_tarihi, toplam_teslimat_sayisi
```

Tablodaki sütunlarla ilişkisi:

| Rapor kolonu | Kaynak | Anlamı |
|---|---|---|
| `unvan`, `sehir`, `ilce`, `durum` | `musteriler` | Kimlik/konum, aktiflik durumu |
| `musteri_grubu` | `musteriler` | Panorama segment kodu (`"201 - PETSHOP"` gibi) |
| `belge_st_adi` | `musteri_belge_ozet.st_adi` | Satış temsilcisi — view'da ayrı "temsilci" alanı yok, en yakın gerçek kolon budur |
| `belge_net_ciro` | `musteri_belge_ozet.net_ciro` | "Net Ciro" kolonu |
| `belge_siparis_sayisi`, `belge_fatura_sayisi` | `musteri_belge_ozet` | Dışa aktarımda görünür, tabloda değil |
| `yas_toplam` | `musteri_yaslandirma.toplam` | "Açık Bakiye" kolonu |
| `yas_riskli_tutar` | `musteri_yaslandirma.riskli_tutar` | `> 0` ise satır "danger" (kırmızı) render edilir |
| `risk_durumu` | view'ın hesapladığı alan | Risk pill'i besler |

---

## 3. Sorgu akışı (`useMusteriRaporlama`)

### 3.1 Ana satır sorgusu (sayfalı)

Her filtre/sayfa değişiminde tek bir Supabase sorgusu çalışır:

```
supabase.from('musteriler_harita')
  .select(ROW_SELECT, { count: 'exact' })
  .<applyFilters>
  .order('son_teslimattan_gecen_gun', { ascending: false, nullsFirst: false })
  .order('unvan', { ascending: true })
  .range(page * 25, page * 25 + 24)
```

- Sayfa boyutu: `RAPORLAMA_PAGE_SIZE = 25`.
- Varsayılan sıralama: en gecikmiş (risk açısından en öncelikli) müşteri en üstte.
- `AbortController` ile önceki istek iptal edilir (hızlı filtre değişiminde yarış durumu önlenir).
- Arama alanı `SEARCH_DEBOUNCE_MS = 300ms` debounce edilir.

### 3.2 Özet sorgusu (`summary`)

Tabloda gösterilen 25 satırdan **bağımsız**, aynı filtrelerle eşleşen
**tüm** kümenin toplam net ciro + risk dağılımını hesaplamak için ayrı, dar
projeksiyonlu bir sorgu çalışır (`belge_net_ciro, risk_durumu` — sadece 2 kolon).
Bu, `fetchAllFiltered` ile PostgREST'in 1000 satır limitini aşarak toplanır (§4).

### 3.3 Filtre → kolon eşlemesi (`applyFilters`)

`RaporlamaFilters` tipindeki her alan, view üzerinde şu koşula dönüşür:

| Filtre | Supabase koşulu |
|---|---|
| `search` (≥2 karakter) | `unvan.ilike.%q%` OR `musteri_kodu.ilike.%q%` |
| `risk` | `eq('risk_durumu', ...)` |
| `segment` | `eq('musteri_grubu', ...)` |
| `temsilci` | `eq('belge_st_adi', ...)` |
| `sehir` | `eq('sehir', ...)` |
| `ilce` | `eq('ilce', ...)` |

Bu fonksiyon satır sorgusu, özet sorgusu ve dışa aktarma sorgusunda **aynen
tekrar kullanılır** — üç yerde ayrı filtre mantığı yok.

### 3.4 Dropdown seçenekleri

- **Temsilci** (`useTemsilciSecenekleri`) ve **ilçe** (`useIlceSecenekleri`,
  seçili şehre göre daralır) listeleri `fetchDistinctColumn` ile view'dan
  `DISTINCT`-benzeri (client-side `Set`) toplanır.
- **Segment** listesi dinamik değil — `lib/raporlama-style.ts` içinde
  10 Ağustos 2026'da canlı DB'de gözlenen 7 sabit kod (`200`–`206`) hardcoded.
  Bilinmeyen bir kod gelirse dropdown'da çıkmaz ama satırda hash-bazlı
  fallback renkle (kırılmadan) gösterilir.
- **Şehir** listesi Supabase'den değil, `lib/import/cities.ts`'teki
  `SEHIR_HEDEF` sabitinden gelir (Ege bölgesi 8 il).

---

## 4. 1000 satır limiti ve `fetchAllFiltered`

PostgREST, `.range()` verilmezse yanıtı sessizce **1000 satırda keser**.
Toplam veri seti ~1200+ müşteri olduğu için özet ve dışa aktarma gibi
"filtreye uyan TÜM satırları" gerektiren yerler bunu atlatmak için
1000'lik turlarla döner (`FETCH_ALL_BATCH_SIZE = 1000`,
`FETCH_ALL_MAX_BATCHES = 5` → en fazla 5000 satır güvenlik sınırı):

```
from = 0
loop (max 5 kez):
  select ... .range(from, from + 999)
  sonuç 1000'den azsa dur
  from += 1000
```

Bu, hem `summary` hesaplamasında hem `fetchAllMusteriRaporu` (dışa aktarma)
içinde kullanılır. **Ana tablo sorgusu** (25 satırlık sayfa) bu sorunu
yaşamaz çünkü zaten kendi `.range()`'ini kullanır.

---

## 5. Ciro trendi (sparkline)

`MusteriRaporlamaTable`, görünen 25 satırın `musteri_kodu`'larını
`useMusteriTrend()`'e verir. Bu hook **ayrı bir tablodan**, `musteriler_harita`
view'ından değil, ham `musteri_metrik_gecmis` tablosundan okur:

```
supabase.from('musteri_metrik_gecmis')
  .select('musteri_kodu,snapshot_tarihi,net_ciro')
  .in('musteri_kodu', <görünen sayfanın kodları>)
  .gte('snapshot_tarihi', bugün - 14 gün)
  .order('snapshot_tarihi', { ascending: true })
```

- Yalnızca **görünen sayfa** için çekilir — 1200+ müşterinin tamamı için değil.
- `Sparkline.tsx` en az 2 nokta ister; azsa "henüz veri yok" placeholder'ı gösterir.
- **Önemli:** bu tablo 9 Ağustos 2026'dan itibaren birikmeye başlamıştır. İlk
  günlerde çoğu müşteride yalnızca 1-2 snapshot olur; bu normaldir ve zamanla
  düzelir, bir bug değildir.
- Renk: satırda `yas_riskli_tutar > 0` ise sparkline kırmızı (`#f87171`),
  değilse mavi (`#60a5fa`) — trend yönünden bağımsız, açık bakiye riskine göre.

---

## 6. Dışa aktarma (.xlsx)

`lib/raporlama-export.ts` → `exportMusteriRaporu`:

1. `fetchAllMusteriRaporu(filters)` ile geçerli filtrelerle eşleşen **tüm**
   satırlar (yalnızca görünen sayfa değil) `ROW_SELECT` ile çekilir (§4'teki
   batching mantığıyla).
2. `xlsx` kütüphanesiyle client-side `.xlsx` dosyasına yazılır
   (`locus-musteri-raporu-YYYY-MM-DD.xlsx`), sunucu tarafı yok.
3. Kolonlar Türkçe başlıklarla yeniden adlandırılır (Müşteri Kodu, Unvan,
   Segment, Risk Durumu, Net Ciro (TL), Açık Bakiye (TL) vb.).

---

## 7. Güvenlik notları

- Frontend Supabase client'ı (`lib/supabase.ts`) yalnızca `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  kullanır; `persistSession: false`.
- `musteriler_harita` view'ı `security_invoker = true` ile tanımlı ve altındaki
  üç tabloda (`musteriler`, `musteri_yaslandirma`, `musteri_belge_ozet`) RLS
  açık, `anon, authenticated` rollerine `select` politikası var (bkz. `sema.sql`).
- `musteri_metrik_gecmis` için ayrı bir RLS/politika tanımı bu repoda yok —
  Supabase projesinde (proje id: `pzepnmzxrwnlhixdrgzm`) doğrudan kontrol edilmeli.

---

## 8. Hızlı referans — hangi dosyaya bakmalı

| Değiştirmek istediğin şey | Dosya |
|---|---|
| Filtre alanı eklemek/çıkarmak | `hooks/useMusteriRaporlama.ts` (`RaporlamaFilters`, `applyFilters`) + `components/raporlama/MusteriRaporlamaFilters.tsx` |
| Tabloya kolon eklemek | `ROW_SELECT` + `MusteriRaporSatiri` (`useMusteriRaporlama.ts`) + `MusteriRaporlamaTable.tsx` |
| Risk hesaplama mantığı | `sema.sql` → `musteriler_harita` view tanımı (frontend'de değil, DB'de) |
| Segment/durum renk paleti | `lib/raporlama-style.ts` |
| Trend/sparkline penceresi (14 gün) | `hooks/useMusteriRaporlama.ts` → `TREND_GUN_SAYISI` |
| Dışa aktarma kolonları | `lib/raporlama-export.ts` |
