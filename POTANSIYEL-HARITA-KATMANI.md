# Implementasyon Planı: Potansiyel Müşteri Harita Katmanı (Locus Dashboard)

Bu doküman **başka bir agent / geliştirici** için yazılmıştır. Yer araştırma
motoru (Google Places prospecting) + mevcut Locus dashboard bağlamını verir;
görev yalnızca frontend'de `potansiyel_musteriler_harita` katmanını açmaktır.

İlgili brief'ler (Downloads):
- `cursor-brief-yer-arastirma-motoru.md` — Places pipeline
- `cursor-brief-potansiyel-musteri-bayragi.md` — bayrak + view (SQL yapıldı)
- Bu dosya — **dashboard harita katmanı**

---

## 1. Ürün bağlamı

**Locus** = Peritas Pet Food saha satış paneli (Next.js + Mapbox + Supabase).

- Mevcut müşteriler Panorama ERP'den gelir → `musteriler` / haritada
  `musteriler_harita` (risk renkleri: sağlıklı / izlenmeli / riskli / hiç teslimat yok).
- Yeni modül: 8 illik Ege bölgesinde (İzmir, Manisa, Aydın, Muğla, Denizli,
  Balıkesir, Çanakkale, Uşak) Google Places ile petshop / veteriner / mama
  satıcısı adayları bulunur → `potansiyel_musteriler`.
- Dashboard'da bunlar **mevcut müşterilerden ayrı** gösterilmeli: "henüz
  Panorama müşterisi olmayan" prospect katmanı.

**Bu turda yapılacak:** haritada toggle'lı prospect marker katmanı + hafif detay.
**Yapılmayacak:** İZTO, RLS politikaları, n8n değişikliği, risk mantığını prospect'e kopyalama.

---

## 2. Stack ve repo

| Parça | Konum / not |
|--------|-------------|
| Frontend | `Downloads/n8n system/petshop_etl/frontend/` (Next.js App Router) |
| Supabase proje | `pzepnmzxrwnlhixdrgzm` (Project Locus, eu-central-1) |
| Browser client | `frontend/lib/supabase.ts` — **yalnızca anon key** |
| Mevcut müşteri haritası | View `musteriler_harita` → `useMusteriHarita` → `PetshopMap` |
| n8n prospecting | Desktop: `google-places-prospecting.workflow.json` (aylık/haftalık tarama) |

Önemli dosyalar (mevcut müşteri deseni — kopyala, karıştırma):
- `frontend/lib/supabase.ts` — `MUSTERILER_HARITA_VIEW`
- `frontend/lib/types.ts` — `MusteriHarita`
- `frontend/hooks/useMusteriHarita.ts`
- `frontend/components/map/PetshopMap.tsx`
- `frontend/app/page.tsx` — veri + filtre state

---

## 3. Veri modeli (Supabase)

### 3.1 Operasyonel / Panorama (özet — dokunma)

- `musteriler` — temiz müşteri master (`musteri_kodu`, `unvan`, `ilce`, `lat`/`lon`, …)
- `musteriler_harita` — **risk view**; uygulama riski burada okur, JS'te yeniden hesaplama
- `panorama_*` landing tabloları, sync run'lar — ETL hattı

### 3.2 Prospecting tabloları

#### `ilce_merkezleri`
Grid merkezi referansı (134 ilçe, 8 il).

| Kolon | Anlam |
|--------|--------|
| `il`, `ilce` | unique |
| `lat`, `lon` | Nominatim |
| `yoğun_bolge` | true → 2×2 sub-grid + Text Search |
| `son_tarama` | skipDays ile kota tasarrufu; null = kuyrukta |
| `dogrulandi` | geocode doğrulama |

#### `potansiyel_musteriler` (kaynak tablo)

| Kolon | Anlam |
|--------|--------|
| `kaynak`, `kaynak_id` | unique; Places `place.id` |
| `isim`, `isim_normalized`, `adres`, `il`, `ilce`, `lat`, `lon` | |
| `google_types`, `primary_type` | |
| `kalite_bayragi` | örn. `suspicious_name` |
| `eslesme_durumu` | `yeni` \| `mevcut_musteri` \| `manuel_kontrol` \| `gizli` |
| `eslesen_musteri_kodu` | fuzzy eşleşince `musteriler.musteri_kodu` |
| `tarandigi_tarih` | |
| **`potansiyel_musteri`** | **GENERATED** `(eslesme_durumu = 'yeni')` — ayrı yazma yok |

`gizli`: dashboard’dan manuel (“Haritadan gizle”) — yanlış/alakasız Places kaydı. View’dan düşer; n8n upsert `eslesme_durumu` ezmez.

Upsert kuralları (n8n — frontend bilmeli, değiştirmemeli):
- **Yeni** `kaynak_id` → fuzzy + insert (eşleşme alanları dolu)
- **Mevcut** `kaynak_id` → sadece taze alanlar (`adres`, `lat`, `lon`, `tarandigi_tarih`, `google_types`); `eslesme_durumu` ezilmez

#### `potansiyel_musteriler_harita` (VIEW — dashboard bunu okur)

```sql
-- Zaten production'da mevcut
select id, isim, adres, ilce, il, lat, lon,
       primary_type, kalite_bayragi, tarandigi_tarih
from potansiyel_musteriler
where potansiyel_musteri = true;  -- yani eslesme_durumu = 'yeni'
```

- `manuel_kontrol` ve `mevcut_musteri` **görünmez** (bilinçli).
- `musteriler_harita` ile birleştirme / join yok.
- Anon SELECT grant var (pipeline döneminde RLS kapalı; brief bilerek erteledi).

Lokal SQL yansıması: `petshop_etl/sql/potansiyel_musteri_bayrak.sql`

### 3.3 Snapshot sayılar (yaklaşık, değişir)

- `potansiyel_musteriler` toplam ~3.7k+
- View (yalnız `yeni`) biraz daha az
- `ilce_merkezleri`: 134; yoğun ~50; bir kısmı hâlâ `son_tarama` null (retarama kuyruğu)

---

## 4. Places → DB hattı (okuma için bağlam)

```
ilce_merkezleri
  → n8n google-places-prospecting
  → Nearby (+ yoğun sub-grid + kırpılınca deepen pass)
  → Text Search (yoğun × 3 sorgu)
  → classify yeni vs mevcut kaynak_id
  → insert / fresh-update
  → potansiyel_musteriler
  → view potansiyel_musteriler_harita
```

Frontend **n8n'e bağlanmaz**; sadece Supabase view okur.

Pacing notu: Nearby dakikalık kota 600/dk; workflow batchSize=1 + ~250ms interval.
Çökme / 429 yarım bırakırsa veri kısmi kalır, unique upsert güvenli — dashboard yine view'dan okur.

---

## 5. Frontend implementasyon planı

### 5.1 Sabitler ve tip

`frontend/lib/supabase.ts`:
```ts
export const POTANSIYEL_MUSTERILER_HARITA_VIEW = "potansiyel_musteriler_harita";
```

`frontend/lib/types.ts`:
```ts
/** public.potansiyel_musteriler_harita */
export interface PotansiyelHarita {
  id: string;
  isim: string | null;
  adres: string | null;
  ilce: string | null;
  il: string | null;
  lat: number | null;
  lon: number | null;
  primary_type: string | null;
  kalite_bayragi: string | null;
  tarandigi_tarih: string | null;
}
```

### 5.2 Hook

`frontend/hooks/usePotansiyelHarita.ts` — `useMusteriHarita` ile aynı desen:
- `supabase.from(POTANSIYEL_MUSTERILER_HARITA_VIEW).select(...).not('lat','is',null)...`
- Sayfalama gerekirse Range (anon default 1000; **~3.6k satır için mutlaka sayfala** veya RPC)
- `lat`/`lon` null olanları filtrele
- loading / error / refresh

**Dikkat:** Supabase JS default max rows 1000. Tüm prospect'ler için:
- birkaç sayfa çek, veya
- edge function / `limit`+`range` döngüsü,
- veya geçici `Prefer: count=exact` + 0–999, 1000–1999, …

### 5.3 Harita katmanı (`PetshopMap`)

- Mevcut müşteri marker'larına **dokunma** (risk renkleri aynı kalsın).
- Yeni GeoJSON / Marker source: prospect'ler.
- Görsel ayrım (zorunlu):
  - Farklı renk (müşteri risk paletine karışmayan; örn. nötr slate/teal outline)
  - Daha küçük veya farklı şekil (daire vs müşteri pin)
  - `kalite_bayragi === 'suspicious_name'` → opacity düşük veya ayrı filtre
- **Toggle** (UI): "Potansiyel müşteriler" açık/kapalı (varsayılan: kapalı veya açık — ürün kararı; öneri **kapalı** ilk yüklemede kalabalık olmasın, veya zoom'a bağlı).
- Click → hafif panel: `isim`, `adres`, `ilce`/`il`, `primary_type`, `tarandigi_tarih`.  
  `CustomerDetailPanel` risk/borç UI'sını **kullanma**.

### 5.4 `page.tsx` / sidebar

- `usePotansiyelHarita()` çağır
- Toggle state (localStorage isteğe bağlı)
- İsteğe bağlı filtre: il, `primary_type` (`pet_store` / `veterinary_care`)
- Sayaç: "X potansiyel" (view count)

### 5.5 Yapılmaması gerekenler

- `musteriler_harita` view tanımını değiştirme
- Prospect satırını `MusteriHarita` tipine zorla cast etme
- `eslesme_durumu` veya `potansiyel_musteri` kolonunu client'ta "yeniden hesaplama"
- service_role'ü browser'a koyma
- RLS'i bu turda açma (ayrı güvenlik işi; şimdilik view grant ile okunuyor)

---

## 6. Kabul kriterleri

- [ ] Haritada prospect marker'lar yalnızca `potansiyel_musteriler_harita` üzerinden
- [ ] `mevcut_musteri` / `manuel_kontrol` marker olarak çıkmaz
- [ ] Mevcut müşteri risk katmanı bozulmaz
- [ ] Toggle ile prospect katmanı açılıp kapanır
- [ ] ~3k+ satır eksiksiz yüklenir (1000 limit tuzağı yok)
- [ ] Marker tıklanınca isim/adres görünür; risk paneli açılmaz
- [ ] Mobile'da da toggle erişilebilir (FilterPanel / MobileFilterSheet ile uyum)

---

## 7. Güvenlik / tech-debt (agent notu)

- `potansiyel_musteriler` RLS şu an kapalı (pipeline dönemi). View public read.
  Pipeline stabil olunca: RLS + authenticated-only policy; `tech-debt.md` / Panorama
  credential workaround ile aynı aile.
- Fuzzy eşikler (85/60) ve yoğun liste kalibrasyonu n8n tarafında TODO.

---

## 8. Hızlı doğrulama SQL

```sql
select count(*) from potansiyel_musteriler_harita;
select eslesme_durumu, count(*) from potansiyel_musteriler group by 1;
-- harita view == yeni sayısı olmalı
```

---

## 9. Özet görev cümlesi (agent için)

> Locus Next.js haritasına `potansiyel_musteriler_harita` view'ından okuyan,
> mevcut `musteriler_harita` risk katmanından görsel ve UX olarak ayrı,
> toggle'lı bir prospect marker katmanı ekle. Veriyi anon Supabase client ile
> sayfalayarak çek; risk/borç panellerini kullanma.
