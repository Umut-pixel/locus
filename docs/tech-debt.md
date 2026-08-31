# Tech debt

## Panorama transform cron güvenilir değil (2026-08-06)

**Belirti:** n8n landing ~19:00 TR’de `panorama_sync_runs`’a yazıyor; harita güncellenmiyor. UI “Sync alındı — harita bekleniyor” (`transformPending`).

**Kök neden adayı:** Vercel Cron `GET /api/sync/panorama` (`vercel.json`: `15 4 * * *` ve `15 16 * * *` UTC → 07:15 / 19:15 TR) production’da tetiklenmiyor veya 401.

**Kanıt (2026-08-06):**
- Landing 5020/5500/5130 `tamamlandi_at` ≈ 16:00 UTC tamam.
- `yukleme_loglari` PanoramaSync log’u 16:15 UTC’de oluşmadı; son log ~12:41 UTC eski `sync_ids`.
- Transform elle koşuldu: `npx tsx scripts/run-panorama-transform.ts --skip-geocode` → log `4a1df121-…` (16:17 UTC).

**Kontrol listesi (bulunca):**
1. Vercel → Project → Cron Jobs / Logs — 16:15 UTC koşusu var mı, status?
2. Env: Production’da `CRON_SECRET` set mi? Cron Authorization header ile mi geliyor?
3. Hobby plan / pause / Root Directory `frontend` deploy doğru mu?
4. Alternatif: n8n landing bitince `POST /api/sync/panorama` webhook (Bearer `CRON_SECRET`) — cron’a bağımlılık kalkar.
5. İzleme: `transformPending` uzun süre true ise toast / alert.

**Geçici workaround:**  
`cd frontend && npx tsx scripts/run-panorama-transform.ts`  
(gerekirse `--skip-geocode` / `--force`)

**İlgili:** `frontend/vercel.json`, `frontend/app/api/sync/panorama/route.ts`, `frontend/hooks/usePanoramaSyncStatus.ts`, `frontend/README.md` (Panorama otomasyon).

## n8n zincirleri hata durumunu yazmıyor (2026-08-31)

**Belirti:** Ana sayfadaki "Şimdi çek" 409 `Bir sync zaten çalışıyor.` ile
kalıcı olarak kilitlendi. 5451 ve 5230 satırları 2026-08-28'den beri
`durum='running'` takılıydı.

**Kök neden:** `Panorama Otomasyon` iş akışında her zincir önce
`Create Sync Run` ile `durum='running'` satırı açıyor, insert batch'leri
bitince `Complete Sync Run` ile `completed`a çekiyor. Arada error branch yok,
workflow'da `errorWorkflow` tanımlı değil ve **hiçbir node `failed` ya da
`hata` yazmıyor** (`grep -o "durum: '[a-z_]*'"` → yalnız 8× `running`,
8× `completed`). Zincir ortada çökerse satır sonsuza kadar `running` kalıyor.

Ek olarak `Complete Sync Run` PATCH'i `neverError: true` ile çalışıyor ve
dönen statü kodunu kimse okumuyor — release isteği 4xx alsa bile akış başarılı
görünür, satır `running` kalır.

**Şu an yapılan (kapatma değil, azaltma):**
- `sql/panorama_sync_stale_sweep.sql` — pg_cron 15 dakikada bir 30 dakikadan
  eski `running` satırlarını `failed` + `hata` yapar.
- `app/api/sync/panorama/manual/route.ts` — in-flight kontrolü artık yalnız
  son 30 dakikadaki satırları kilit sayar (süpürücü gecikse bile çalışır).

**Doğru çözüm:** n8n tarafında her zincirin `Create Sync Run` sonrasına error
branch eklenip `durum='failed'` + `hata` yazılması, ya da workflow'a bir
`errorWorkflow` bağlanması. O zaman `hata` kolonu gerçek n8n mesajını taşır;
bugün yalnız süpürücünün jenerik metnini taşıyor.

**İlgili:** `backend/n8n/Panorama Otomasyon (8).json` (`Prep Complete Sync*`,
`Complete Sync Run*`), `frontend/hooks/usePanoramaSyncStatus.ts` (`hata`yı
okuyor), `sql/panorama_sync_stale_sweep.sql`.
