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

### Vercel

Vercel dosya okumaz — aynı anahtarları **Project → Settings → Environment Variables** olarak ekleyin (Production + Preview).  
Root Directory: `frontend`. Build: `npm run build`, Output: Next varsayılan.

Cron (Europe/Istanbul ≈ UTC+3): `04:15` ve `16:15` UTC → n8n 07:00 / 19:00 sonrası transform.  
`CRON_SECRET` tanımlı olmalı; aksi halde production’da endpoint 401 döner.
Vercel Cron kaldırıldı — tetik `panorama_sync_runs` → `completed` Database Webhook
(`pg_net`). Ana zincirde tazelik kapısı (5020/5500/5130 son 5 dk) vardır.

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

Manuel: `Authorization: Bearer $CRON_SECRET` ile  
`POST /api/sync/panorama?force=1` (aynı sync’i yeniden uygula).

## Veri modeli

- Okuma: `musteriler_harita` (anon); sync durumu: `panorama_sync_runs`  
- Yazma: `musteriler` + `yukleme_loglari` (service_role)
