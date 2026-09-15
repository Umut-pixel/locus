# Tech debt

## ROUTE_IZIN_MAP, DB'deki rol_izinleri'nin statik bir aynası (2026-09-15)

`frontend/lib/permissions.ts`'teki `ROUTE_IZIN_MAP` (middleware route guard +
nav filtreleme) ile `frontend/middleware.ts`'in kullandığı
`user.app_metadata.izinler` (login/rol değişikliğinde yazılır, bkz.
`frontend/app/api/kullanicilar/route.ts`) — gerçek veri sınırı HER ZAMAN
Postgres'teki `has_izin()`'in canlı okuduğu `public.rol_izinleri`. İkisi
senkron tutuluyor ama otomatik değil: SQL ile 3. bir rol eklenir ve o rolün
sayfa erişimi kodda karşılığı olmayan yeni bir izin koduna bağlanırsa,
middleware o kod için `ROUTE_IZIN_MAP`'te eşleşme bulamaz (route izinsiz kabul
edilir) — veri sızmaz (RLS zaten engeller) ama nav/route gate ile gerçek erişim
arasında kafa karıştırıcı bir UX tutarsızlığı oluşur.

**Doğru çözüm:** yeni rol/izin eklerken `frontend/lib/permissions.ts`
(`IZIN_KODLARI`, `SAYFA_IZIN_HARITASI`, `API_IZIN_HARITASI`,
`VARSAYILAN_ROTA_ONCELIGI`) ve `frontend/lib/app-sidebar-nav.ts`'teki `izin`
etiketlerini de güncellemek. Bugün 2 rol (admin, satis_temsilcisi) olduğu için
kabul edilebilir bir taviz.

**İlgili:** `sql/roller_izinler_sema.sql`, `frontend/lib/permissions.ts`,
`frontend/middleware.ts`.

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

**2026-09-14 — BDS (5451) zincirinde somut örnek + hızlı düzeltme:**
`panorama_sync_runs`'ta report_id=5451 son 3 günde 4 kez `failed` (hepsi
süpürücünün jenerik "00:30:00 içinde tamamlanmadı" mesajıyla — gerçek n8n
hatası yukarıdaki nedenle hiç yazılmadı). Kullanıcının n8n arayüzünde canlı
gördüğü gerçek hata: `Prep Complete Sync BDS` düğümünde
`{"message":"Gateway Timeout"}` — yani `Insert Rows Batch BDS`'in ~79
ardışık batch isteğinden (19.6K satır ÷ 250/batch) biri Supabase tarafında
504 almış. `neverError:true` var ama `retryOnFail` YOKTU — tek bir geçici
timeout tüm zinciri düşürüyordu (5450/BD2'de bu görülmedi çünkü onun batch
sayısı çok daha az, ~39).

*Hızlı düzeltme (yapıldı):* `Create Sync Run BDS`, `Insert Rows Batch BDS`,
`Complete Sync Run BDS` düğümlerine `retryOnFail:true, maxTries:3,
waitBetweenTries:3000` eklendi — yalnız bu 3 düğüm, yalnız BDS zinciri.
Diğer zincirlerde (Main/YL/SD/STK/TH/BD2) aynı desen (HTTP node + neverError,
retry yok) hâlâ var ve aynı riski taşıyor — bu commit onları KAPSAMIYOR,
yalnız somut olarak arızalanan BDS'i düzeltti. Genişletilecekse hepsine aynı
3 alanı eklemek yeterli, mimari değişmiyor.

*Hâlâ eksik:* retry tükenirse zincir yine sessizce "running" kalıp
süpürücüye düşecek — bu commit `errorWorkflow`/error-branch sorununu ÇÖZMÜYOR,
yalnız en sık görülen tetikleyiciyi (geçici 504) azaltıyor.

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

## Haftalık prospecting cron'u 40 gündür çalışmıyor (2026-09-14)

`ilce_merkezleri.son_tarama` içindeki **en yeni** damga `2026-08-05`. Yani
`google-places-prospecting` workflow'unun haftalık cron'u (`0 6 * * 3`,
Çarşamba 06:00) o tarihten beri bir kez bile başarıyla tamamlanmamış —
`Mark Son Tarama` düğümü hiç çalışmamış. 134 ilçenin **hiçbiri** 25 günlük
tazelik penceresi içinde değil.

**Nasıl fark edildi:** il bazlı manuel tarama özelliği için tazelik önizlemesi
yazılırken, "kaç ilçe taze" sorgusu her il için 0 döndü.

**Neden sessiz kaldı:** bu workflow `panorama_sync_runs` benzeri bir koşu
tablosu yazmıyordu, yani başarısızlık hiçbir yerde görünmüyor. Arayüzde de
"potansiyeller en son ne zaman tarandı" göstergesi yok — veri bayatlıyor ama
kimse fark etmiyor.

**Kısmen düzeldi:** manuel taramalar artık `potansiyel_taramalari` tablosuna
satır yazıyor (`sql/potansiyel_tarama_sema.sql`), yani en azından elle
başlatılan koşular izlenebilir. **Cron yolu hâlâ satır yazmıyor.**

**Yapılacak:**
1. n8n'de bu workflow'un execution geçmişine bak — cron tetikleniyor mu,
   tetikleniyor da bir düğümde mi patlıyor? (`Expand Ilce Rows`'un
   `rows.length < 900` tripwire'ı artık 973 ilçe beklediği için, seed'den
   önceki bir koşu bu eşikte de patlamış olabilir — sıra önemliydi.)
2. Cron yoluna da `Create Cron Tarama` + `Set Run Id` düğümleri ekle
   (aşağıdaki madde), böylece başarısızlık görünür olsun.
3. Google Places API anahtarının kotası/faturası hâlâ geçerli mi doğrula —
   sessiz başarısızlığın en olası nedeni bu.

**İlgili:** `backend/n8n/README.md` → "Harita → il bazlı tarama"

---

## Prospecting cron'u ile manuel tarama eşzamanlı çalışabilir (2026-09-14)

`$getWorkflowStaticData('global')` n8n'de **workflow başına**, execution
başına değil. Aynı anda iki `google-places-prospecting` koşusu olursa
`placesById`, `scannedDistricts` ve `clippedDistricts` birbirini ezer;
sonuç yanlış ilçelere `son_tarama` yazılması olur ve o ilçeler 25 gün
boyunca sonuçsuz kilitlenir.

Uygulama katmanındaki in-flight kilidi (`durum='running'` satırı varsa 409)
yalnız **manuel** taramaları görüyor; haftalık cron koşusu `potansiyel_taramalari`'na
satır yazmadığı için kilide görünmez.

**Şimdilik konan yama:** `/api/potansiyel/tarama` Çarşamba 06:00-08:00
Europe/Istanbul penceresinde manuel taramayı reddediyor. Bu bir tahmin —
cron'un gerçekte ne kadar sürdüğü ölçülmedi ve n8n instance'ının saat dilimi
Europe/Istanbul varsayıldı.

**Doğru çözüm:** cron yoluna `Config → Has Run Id? → [false] Create Cron
Tarama (POST, Prefer: return=representation) → Set Run Id → Reset Static
Accumulator` ekleyip kilidi evrenselleştirmek. Tarama davranışı değişmez ama
cron yolu artık "bit‑bit aynı" olmaz, o yüzden özellik canlıda kanıtlandıktan
sonra ayrı inmeli. Bu aynı zamanda yukarıdaki "cron sessizce ölüyor"
maddesini de çözer.

---

## "Merkez" adlı iki ilçede Text Search sorgusu anlamsız (2026-09-14)

`Build Text Queries` sorguyu `${varyasyon} ${ilce}` diye kuruyor
("evcil hayvan maması", "kuş yemi", "pet shop" + ilçe adı). 973 ilçelik seed
merkez ilçesini **il adıyla** yazıyor ("Bilecik"), yani sorgu "pet shop
Bilecik" oluyor — doğru. Ama seed'den önce var olan iki satır düz "Merkez"
taşıyor:

- `Çanakkale/Merkez` (`yoğun_bolge = true`)
- `Uşak/Merkez` (`yoğun_bolge = true`)

İkisi de yoğun, yani Text Search **onlarda çalışıyor** ve sorgu "pet shop
Merkez" oluyor. Google'ın bu sorguyla ne döndürdüğü ölçülmedi; muhtemelen
locationBias sayesinde tamamen çöp değil ama ilçe adı hiçbir sinyal taşımıyor.

**Neden düzeltilmedi:** yeniden adlandırmak `UNIQUE (il, ilce)` yüzünden yeni
satır açar; eski satırın `son_tarama` ve öğrenilmiş `yoğun_bolge` değeri
yetim kalır ve o iki ilçe bir tur boyunca yeniden taranır.

**Doğru çözüm:** tek seferlik bir `update ilce_merkezleri set ilce = il
where ilce = 'Merkez'` (satırı taşır, geçmişi korur) + CSV'deki karşılıklarını
güncelle. İki satır için ayrı bir migration yazmaya değer mi, ölçülmeden
karar verilmemeli.
