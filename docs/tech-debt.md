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
