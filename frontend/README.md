# Petshop Müşteri Haritası — Frontend

Next.js + Mapbox + Supabase. Harita dashboard'u ve Excel yükleme API'si.

## Ortam değişkenleri (tek kaynak)

Repo kökündeki **`.env`** tek kaynaktır (Python + Next.js).  
`npm run dev` / `npm run build` öncesi `scripts/sync-env.mjs` bunu
`frontend/.env.local`’e kopyalar (Next yalnızca kendi dizinindeki `.env*` okur).

```bash
cp ../.env.example ../.env   # bir kez doldur
npm run sync-env             # veya doğrudan: npm run dev
```

| Değişken | Kim | Açıklama |
|---|---|---|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Python + Next | Proje URL (aynı değer, iki isim) |
| `SUPABASE_SERVICE_KEY` | Sunucu only | `/api/upload` yazma — **asla** `NEXT_PUBLIC_` olmasın |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tarayıcı | Harita okuma (RLS) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Tarayıcı | Mapbox `pk.…` |
| `CRON_SECRET` | Sunucu only | `/api/sync/panorama` — Database Webhook + manuel Bearer |
| `N8N_PANORAMA_MANUAL_WEBHOOK_URL` | Sunucu only | n8n `Webhook Manuel Sync` Production URL |
| `N8N_PANORAMA_MANUAL_WEBHOOK_SECRET` | Sunucu only | `X-N8N-Sync-Secret` (n8n Guard node; webhook Auth = None) |

### Vercel

Vercel dosya okumaz — aynı anahtarları **Project → Settings → Environment Variables** olarak ekleyin (Production + Preview).  
Root Directory: `frontend`. Build: `npm run build`, Output: Next varsayılan.

n8n landing (Europe/Istanbul) günde 3 dalga: **07:00 / 13:00 / 19:00**. Dalga içinde
zincirler 1'er dakika arayla akar (Main :00, Sipariş 5140 :01, Tahsilat 5230 :02,
Stok 5430 :03, Belge detay sipariş 5451 :04, Yaşlandırma 5530 :05); Belge detay
5450 yalnız sabah dalgasında (:06). Aynı IP'den paralel login Panorama'nın önündeki
F5 WAF'ı tetiklediği için eşzamanlı çalıştırılmaz.

`CRON_SECRET` tanımlı olmalı; aksi halde production’da endpoint 401 döner.
Vercel Cron kaldırıldı — tetik `panorama_sync_runs` → `completed` Database Webhook
(`pg_net`). Ana zincirde tazelik kapısı (5020/5500/5130 son 5 dk) vardır.
Yarım kalan `running` satırları `panorama_sync_stale_sweep` pg_cron job'ı 15 dakikada
bir `failed`a çeker (`sql/panorama_sync_stale_sweep.sql`) — yoksa manuel çekim
butonu kalıcı kilitleniyordu.

> **Tech debt:** 2026-08-06 akşam cron’u düşmedi — landing geldi, transform yok.  
> Takip: [`docs/tech-debt.md`](../docs/tech-debt.md#panorama-transform-cron-güvenilir-değil-2026-08-06).

## Kurulum

```bash
cd frontend
npm install
npm run dev
```

## Rota çizgisi (yol üzeri)

**Rotada göster** önce kuş uçuşu çizer, ardından [Mapbox Directions](https://docs.mapbox.com/api/navigation/directions/)
(`driving`) ile yollara oturtur. Token’ınızda Directions ürünü açık olmalı
(account.mapbox.com → Access tokens → scopes). İstek başarısız olursa düz çizgi kalır.

## Upload akışı

1. UI **Veri yükle** → Excel seçilir  
2. `POST /api/upload` → tip algılanır (MusteriListesi / Rut / Sevkiyat)  
3. Parse → (müşteride) geocode → Supabase `musteriler` upsert/update  
4. `yukleme_loglari` satırı yazılır (`yuklenme_zamani`)  
5. Değişen satırlarda `guncellendi` güncellenir  
6. Harita `refresh()` ile yeniden yüklenir  

## Panorama otomasyon sync

n8n `panorama_*` landing’e yazar → `GET/POST /api/sync/panorama` view’ları
`musteriler`e aktarır (`dosya_tipi=PanoramaSync` log) → harita `musteriler_harita`
okur. Dashboard `panorama_sync_runs` + son PanoramaSync log’unu poll eder.

Manuel transform: `Authorization: Bearer $CRON_SECRET` ile  
`POST /api/sync/panorama?force=1` (aynı landing’i yeniden uygula).

Ana sayfa **Şimdi çek** (yalnız “Güncel” iken): oturumlu `POST /api/sync/panorama/manual`  
n8n webhook’unu tetikler (60 dk rate limit). n8n URL tarayıcıya sızmaz.

## Canlı araç konumu (Arvento)

Araçların anlık konumu **üç yerde** görünür: `/harita` (müşteri haritası),
`/rotalar/harita` (rota haritası) ve araç detay sayfası.
Veri yolu: Arvento GPS → n8n (`backend/n8n/Arvento Arac Takibi.json`) →
Supabase → `v_arac_konum_son` view'ı.

| Katman | Dosya |
|---|---|
| Okuma + dönüşüm | `lib/rota/canli-konum.ts` |
| Realtime + yedek yoklama | `hooks/useCanliAracKonumlari.ts` |
| İmleç + balon + yelpaze (İKİ haritanın ortağı) | `lib/rota/canli-arac-imleci.ts` |
| Rota haritası | `components/rota/RotaHaritasi.tsx` (`canliAraclar` prop'u) |
| Müşteri haritası | `components/map/PetshopMap.tsx` (`canliAraclar` prop'u) |
| Araç listesi satırı | `components/rota/CanliAracListesi.tsx` |
| "Canlı araçlar" kartı (iki haritada da) | `components/rota/CanliAracKarti.tsx` |
| Araç detay paneli | `app/(app)/rotalar/[aracKod]/page.tsx` |

**Üst üste binme:** filo gün boyu depoda park hâlinde, hepsi aynı koordinatı
bildiriyor. `canliKaymalariUygula` imleçleri EKRAN PİKSELİNE göre kümeleyip
ortak merkez etrafında yelpazeye açıyor ve `zoomend`'de yeniden hesaplıyor.
Coğrafi ızgarayla kümelemek işe yaramaz: Türkiye görünümünde 11 m zaten tek
piksel (ölçüldü — en yakın ikili 0 px'ten 32 px'e çıktı).

**Bulunabilirlik:** her iki haritada da **Canlı araçlar** kartı var — kabuğu
`PlanKarnesi` ile aynı (başlık düğmesi + durum çipi + `GsapCollapse`). Araçları
plaka, durum, hız, yaş ve adresle listeler; hareket edenler üstte. Satıra
tıklayınca harita o araca uçar — rota haritasında `ucusHedefi`, müşteri
haritasında mevcut `regionFocus` makinesi (aracın çevresinde ~400 m'lik kutu)
yeniden kullanılıyor.

Kart gerekli çünkü kamera rota planına göre kuruluyor ve filonun bir kısmı hep
kadraj dışında kalıyor; imleci büyütmek bunu çözmüyor. Rota haritasında karnenin
ÜSTÜNDE duruyor ("araçlarım nerede" sorusu plan değerlendirmesinden önce gelir),
müşteri haritasında sağ üstte ve varsayılan KAPALI (harita orası için asıl içerik).

**Frontend yalnız view'ı okur.** `hareket` (hız > 0) ve `bayat` (10 dk) view'da
türetilir, uygulama kodunda tekrar hesaplanmaz. Plaka da view'dan gelir —
Arvento'nun `lastEvents` ucu yalnız cihaz node'u döndürüyor.

**Üç durum ayrı gösterilir:** taze konum (gerçek yer + hız + adres), bayat
ölçüm (soluk imleç, "son bilinen konum"), eşlenmemiş araç (araç detayında
"cihaz eşlenmemiş" uyarısı).

**Sevkiyat vs şahıs aracı.** Arvento 8 araç bildiriyor; 3'ü dağıtım filosu,
5'i çalışanların şahıs aracı. Ayrım `arvento_araclar.sevkiyat` bayrağından
gelir — araç sınıfından DEĞİL: `35ASM899` bir sevkiyat aracı ama OTOMOBIL
sınıfında, yani "KAMYON = sevkiyat" kuralı onu kaçırırdı. Bayrak `arac_kod`'dan
da ayrı: o "hangi rota aracı" sorusunu cevaplar ve hâlâ teyit bekliyor
(bkz. `sql/arvento_sevkiyat_bayragi.sql`).

| | İkon | Renk |
|---|---|---|
| Sevkiyat, KAMYON | lucide `truck` silueti | `#4285F4` |
| Sevkiyat, OTOMOBIL | lucide `car-front` silueti | `#4285F4` |
| Şahıs aracı | chevron (hareket) / nokta (park) | nötr gri |
| `arac_kod` eşlenmiş | (aynı siluet) | rota rengi |

Sevkiyat araçlarında chevron yerine siluet var çünkü gidiş yönü zaten koniyle
okunuyor; araç türünü görmek daha değerli. Listede de sevkiyat araçları ayrı
grupta ve üstte.

⚠️ **`arvento_araclar.arac_kod` eşlemesi ELLE yapılır.** Bir araca cihaz
eşlenmemişse haritada plakasıyla ve nötr renkle görünür, rota rengini almaz.
Eşleme yapılana kadar o rota aracı için depodaki tahmini yön oku durmaya
devam eder — bkz. `sql/arvento_arac_sema.sql` başlığındaki açık soru.

## Veri modeli

- Okuma: `musteriler_harita` (anon); sync durumu: `panorama_sync_runs`  
- Yazma: `musteriler` + `yukleme_loglari` (service_role)
