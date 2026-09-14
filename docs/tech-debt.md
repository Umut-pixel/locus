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

## Arvento bakım: tam-pencere yenileme + doğrulanmamış alan formatları (2026-09-14)

**Belirti (henüz görünmüyor):** `arac_bakim` tablosu bugün boş. Arvento'ya hiç
bakım kaydı girilmemiş — `POST /v1/FleetReport/Maintenance` her sorguda
`HTTP 200 + List: []` dönüyor. Boru hattı kuruldu ama hiç gerçek satır işlemedi.

**İki ayrı borç:**

**1) Silinen kayıt bizde kalır.** `Arvento Arac Takibi.json` her gün geçmiş
24 + gelecek 12 ayı 3'er aylık 12 pencerede çekip `kayit_no` (RecordNo)
üzerinden upsert ediyor. Arvento'da **silinen** bir bakım kaydı bizim tabloda
kalır — hiçbir şey onu temizlemiyor. `SevkiyatRaporuKup` agregasyonuyla aynı
sınıf sorun (bkz. CLAUDE.md).
*Doğru çözümü:* çekilen pencere aralığına düşen ve bu çalıştırmada görülmeyen
`kayit_no`'ları işaretlemek (soft-delete) veya pencere bazlı `delete + insert`.

**2) Parse varsayımları doğrulanmadı.** Kayıt olmadığı için şunların hiçbiri
gerçek veriyle test edilemedi:
- `RecordNo` global unique mi, yoksa araç bazında mı tekrar ediyor? (bugün PK)
- `Km` / `PlannedKm` / `Amount` string dönüyor; ondalık ayırıcı virgül mü nokta
  mı, `Amount` içinde `TL`/`₺` eki var mı? Bugün sezgisel: son ayırıcıdan sonra
  1-2 hane varsa ondalık (`"12.450,75"` → 12450.75), 3 hane varsa binlik
  (`"123.456"` → 123456).
- `StartDate` / `EndDate` / `PlannedDate` yanıtta hangi formatta? (üç format
  birden deneniyor)
- `Type` alanının alabildiği değerler?
- Planlanmış (henüz yapılmamış) bakımlar dönüyor mu?

*Zararı sınırlayan tasarım:* her satırın tamamı `arac_bakim.ham_kayit jsonb`
kolonunda saklanıyor. Parse yanlış çıkarsa tablo **veri kaybı olmadan**
`ham_kayit` üzerinden yeniden üretilebilir.

**Yapılacak:** Arvento'ya birkaç gerçek bakım kaydı girildiğinde
`Bakim Normalize` düğümünün çıktısı `ham_kayit` ile karşılaştırılıp
`sayiCevir` / `tarihCevir` düzeltilmeli, `sql/arvento_bakim_sema.sql`
başlığındaki "DOĞRULANMADI" uyarıları kaldırılmalı.

**İlgili:** `backend/n8n/Arvento Arac Takibi.json`, `sql/arvento_bakim_sema.sql`

## Arvento konum izi telafi edilemez (2026-09-14)

**Belirti (risk):** `arac_konum_gecmis` dolmazsa o zaman dilimi **kalıcı olarak
kayıptır**. Arvento'nun geçmiş iz uçlarının üçü de hesabımızda kapalı
(`/v1/vehicle/events`, `/v1/report/general`, `/v1/report/vehicleOperating` —
hepsi "Bu servisi kullanmaya yetkiniz yoktur"), yani geriye dönüp soramayız.

**Etkisi:** "Planlanan vs gerçekleşen rota" karşılaştırmasının tek veri kaynağı
bu tablo. n8n workflow'u durursa, oturum kilitlenirse veya Supabase yazımı
sessizce başarısız olursa o günün izi hiç oluşmaz.

**Bugünkü koruma:** 6 düğümde `onError: continueErrorOutput` → `arvento_sync_runs`
`failed` satırı. Ama **kimse o satırı okumuyor.**

**Doğru çözümü:** `sql/bildirim_sistemi.sql` şu an yalnız `panorama_sync_runs`'taki
`failed` satırlarını Telegram'a düşürüyor; `arvento_sync_runs`'ı da okuması
gerekiyor. Ayrıca "son N dakikadır hiç konum yazılmadı" (`arac_konum_son.cekildi_at`
bayatladı) kontrolü eklenmeli — sessiz durma en tehlikeli senaryo.

**İlgili:** `sql/arvento_sync_runs_sema.sql`, `sql/bildirim_sistemi.sql`,
`backend/n8n/Arvento Arac Takibi.json`

## Sızmış anahtarlar hâlâ geçerli — rotasyon bekliyor (2026-09-14)

**Durum:** `backend/n8n/Panorama Otomasyon (9).json` bugün credential desenine
taşındı, dosyada artık düz metin sır yok. **Ama bu, sızmış anahtarları
geçersiz kılmaz.**

**Ne sızdı:** Project Locus `service_role` JWT'si ve Panorama ERP parolası
(`patigo` kullanıcısı). İkisi de git geçmişinde duruyor — `098b118` ve öncesi,
ayrıca 2026-08-19'da herkese açık depoya push edilmişti.

**Neden ciddi:** `service_role` **tüm RLS politikalarını atlar.** Anahtarı
eline geçiren biri `musteriler`, `panorama_*` landing tabloları, `araclar`,
yeni `arac_konum_*` tabloları dahil veritabanının tamamını okuyup yazabilir.
Dosyayı temizlemek yalnız *yeni* sızıntıyı önler.

**Yapılacak (sırayla):**
1. Supabase → Settings → API → `service_role` anahtarını yeniden üret.
2. n8n'deki `supabaseApi` credential'ını yeni anahtarla güncelle.
3. Tek zincirle (örn. Yaşlandırma 5530) manuel çekim testi yap.
4. Panorama ERP parolasını değiştir, n8n `PANORAMA_PASS` ortam değişkenini
   güncelle, yine tek zincirle test et.
5. Vercel/frontend tarafında aynı `service_role` anahtarı kullanılıyorsa
   (`SUPABASE_SERVICE_ROLE_KEY` env) orayı da güncellemeyi unutma.

**Git geçmişini temizlemek ayrı ve daha zor bir iş** (`filter-repo` + force
push + herkesin klonunu yenilemesi). Rotasyon yapıldıktan sonra geçmişteki
anahtar zararsız hale geldiği için bu opsiyoneldir.

**İlgili:** `backend/n8n/README.md` ("Anahtar rotasyonu — HENÜZ YAPILMADI")
