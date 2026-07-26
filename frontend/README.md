# Petshop Müşteri Haritası — Frontend

Next.js + TypeScript + Tailwind + shadcn/ui ile kurulmuş, Mapbox GL üzerinde
1292 müşteriyi (1203 koordinatlı) clustering, risk durumu ve arama/filtre
paneliyle gösteren tek sayfalık dashboard.

## Kurulum

```bash
npm install
```

`.env.local` dosyasını doldurun (örnek: `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://pzepnmzxrwnlhixdrgzm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Project Locus anon key>
NEXT_PUBLIC_MAPBOX_TOKEN=<Mapbox public access token, pk.xxx>
SUPABASE_SERVICE_KEY=<service_role key — yalnızca sunucu /api/upload>
```

- **Supabase anon key**: Settings → API → `anon` `public` key. RLS + `select`
  policy zaten `musteriler_harita` view'ında kurulu, bu key tarayıcıya
  güvenle konabilir. `service_role` anahtarı **asla** `NEXT_PUBLIC_*` olarak
  konmaz; yalnızca `SUPABASE_SERVICE_KEY` ile sunucu tarafında kullanılır.
- **Mapbox token**: [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/)
  üzerinden alınan **public** (pk.xxx) token. Harita stili (`Outdoors`,
  `umutt` hesabında yayınlı, id `cmqpjeid3001m01s67kbq1804`) `mapbox://`
  şemasıyla barındırılıyor — bu yüzden `style.json`/`sprite_images` bu
  projeye kopyalanmadı, sadece style URL'i (`lib/mapbox-style.ts`) kullanıldı.
  Stil lisansı için orijinal `license.txt`'ye bakın (Maki ikonları CC-0,
  stilin kendisi Mapbox Studio türevi).

```bash
npm run dev
```

> **Not:** `next dev` bu ortamda Turbopack ile kararsız davrandığı için
> (`package.json`'da) `--webpack` bayrağıyla çalıştırılıyor.

## Veri modeli

Uygulama sadece **anon key** ile Supabase'deki `public.musteriler_harita`
view'ını okur (bkz. kök dizindeki `sema.sql`). Yazma işlemi yok — ETL/upload
tarafı tamamen ayrı (`../supabase_yukle.py`, `service_role` ile).

## Görsel kodlama

- **Nokta rengi** → `risk_durumu`: sağlıklı (yeşil) / izlenmeli (amber,
  >45 gün) / riskli (kırmızı, >90 gün) / hiç teslimat yok (gri)
- **Nokta opaklığı** → `geocode_hassasiyet`: saha_gps (1.0) / mahalle_merkezi
  (0.75) / ilce_merkezi (0.45) — centroid noktalarının kesin adres gibi
  görünmemesi için
- **Clustering** → Mapbox GL native cluster (`cluster: true`), tıklayınca
  zoom+expand

## Dosya yapısı

```
lib/
  supabase.ts       anon client
  types.ts          MusteriHarita tipi
  mapbox-style.ts    style URL + başlangıç görünümü
  risk-style.ts      renk/opaklık/etiket sabitleri
  geojson.ts         satır -> GeoJSON dönüştürücü
  format.ts          TL/sayı/tarih formatlama
hooks/
  useMusteriHarita.ts  Supabase'den sayfalı veri çekme
components/
  map/PetshopMap.tsx      harita + cluster/point layer'ları
  map/RiskLegend.tsx      sabit legend
  sidebar/FilterPanel.tsx        şehir/risk/arama + istatistik
  sidebar/CustomerDetailCard.tsx seçili müşteri detay kartı
  sidebar/MobileFilterSheet.tsx  mobil çekmece (< lg)
app/page.tsx           layout birleştirme
```
