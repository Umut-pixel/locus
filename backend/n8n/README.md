# n8n iş akışları

## ⚠️ Bu dosyalara ASLA gerçek sır yazma

**2026-09-14 itibarıyla bu kural gerçekten uygulanıyor — üç workflow'un
hiçbirinde düz metin sır yok.** Doğrula:

```bash
grep -nE "eyJhbGciO|arma123|\"panoramaPass\"|\"supabaseServiceRoleKey\"" backend/n8n/*.json
```

Çıktı **boş olmalı**. Çıktı verirse dışa aktarılan dosyaya sır sızmış demektir,
commit etme.

### Sırlar nerede duruyor

| Sır | Yer |
|---|---|
| Supabase URL + `service_role` key | n8n credential deposu, tip `supabaseApi` |
| Panorama ERP kullanıcı/parola | n8n ortam değişkeni: `PANORAMA_USER`, `PANORAMA_PASS` |
| Arvento kullanıcı/parola | n8n ortam değişkeni: `ARVENTO_USER`, `ARVENTO_PASS` |
| Google Places API key | n8n credential, tip `httpHeaderAuth` |
| Manuel sync webhook sırrı | `$vars.PANORAMA_MANUAL_SYNC_SECRET` veya `$env.N8N_PANORAMA_MANUAL_WEBHOOK_SECRET` |

**Neden:** 2026-08-19'da Panorama dosyası gerçek `service_role` anahtarı ve ERP
parolasıyla commit edilip herkese açık depoya push edildi. `service_role` tüm
RLS politikalarını atlar — sızdığında veritabanının tamamı okunup yazılabilir.

## Panorama credential taşıması (2026-09-14)

Panorama zincirleri EPDK ve Google Places'in çoktan geçtiği desene taşındı.
Değişen:

| Önce | Sonra |
|---|---|
| `Config*` düğümlerinde `supabaseServiceRoleKey`, `supabaseUrl`, `panoramaUser`, `panoramaPass` (8 düğüm × 4 alan) | Bu alanlar **silindi** |
| HTTP düğümlerinde elle `apikey` + `Authorization: Bearer {{ $json.supabaseServiceRoleKey }}` | `authentication: predefinedCredentialType`, `nodeCredentialType: supabaseApi` |
| `{{ $json.supabaseUrl }}/rest/v1/…` | `{{ $credentials.host }}/rest/v1/…` |
| Kimliğin item zincirinde düğümden düğüme taşınması (104 satır) | Kaldırıldı — credential doğrudan HTTP düğümünde |
| `cfg.panoramaUser \|\| $env.PANORAMA_USER` | Yalnız `$env.PANORAMA_USER` |

24 HTTP düğümü (`Create Sync Run *`, `Insert Rows Batch *`, `Complete Sync Run *`)
etkilendi. Bağlantılar, cron takvimi, `disabled` bayrakları ve düğüm sayısı
değişmedi (yalnız bir kurulum sticky'si eklendi).

### İçe aktardıktan sonra ZORUNLU iki adım

Bunlar yapılmazsa **8 zincirin hepsi patlar**:

1. **Ortam değişkenleri** — n8n Settings → Environment Variables:
   `PANORAMA_USER`, `PANORAMA_PASS`.
   Eksikse `Login *` düğümleri şu mesajla durur:
   *"PANORAMA_USER / PANORAMA_PASS ortam değişkenleri tanımlı değil."*
2. **Supabase credential** — 24 HTTP düğümünde `supabaseApi` credential'ı elle seç.

Sonra **tek bir zincirle** (örn. Yaşlandırma 5530) manuel çekim testi yap,
`panorama_sync_runs`'ta `completed` satırı gördükten sonra diğerlerini aç.

### `$vars` neden kullanılmadı

2026-09-03'te tam bu alanlar `{{ $vars.… }}`'e çevrildi ama karşılık gelen n8n
değişkenleri **hiç oluşturulmamıştı** — `Login *` düğümleri patladı, tüm
zincirler durdu, çalışan sürüme geri dönüldü.

`$env` ve credential deposu bu riski taşımıyor: credential seçilmemişse n8n
düğümü zaten çalıştırmaz ve arayüzde kırmızı gösterir; ortam değişkeni yoksa
`Login` ilk satırda açık mesajla durur. İkisi de **sessizce yanlış davranmaz**.

**Ders (hâlâ geçerli):** çalışan bir kimlik bilgisini referansa çevirmeden önce
referansın hedefinin var olduğunu doğrula ve tek zincirle çekim testi yap.

### ⚠️ Anahtar rotasyonu — HENÜZ YAPILMADI

Dosyayı temizlemek anahtarı geçersiz kılmaz. `service_role` JWT ve ERP parolası
**git geçmişinde duruyor** (`098b118` ve öncesi). Gerçek çözüm:

1. Supabase → Settings → API → `service_role` anahtarını yeniden üret,
   n8n credential'ını güncelle.
2. Panorama ERP parolasını değiştir, `PANORAMA_PASS` ortam değişkenini güncelle.

Bu iki adım tamamlanana kadar eski anahtarlar geçerli sayılmalı.

## Manuel sync (ana sayfa “Şimdi çek”)

`Panorama Otomasyon (7).json` içinde `Webhook Manuel Sync` node’u:

1. n8n’de bu JSON’u **mevcut** Panorama Otomasyon üzerine içe aktar (veya
   Webhook node’unu elle düzelt). Canlı instance hâlâ **GET + Header Auth**
   ise POST 404 / GET 403 verir — Next `n8n tetiklenemedi` döner.
2. Webhook: Method **POST**, Authentication **None**, path
   `panorama-manual-sync`. Kaydet, workflow’u **kapatıp tekrar aç**
   (production webhook yeniden kaydolur). Test URL (`/webhook-test/`) kullanma.
3. Sır `Guard Manuel Secret` node’unda `X-N8N-Sync-Secret` (veya Bearer) ile
   kontrol edilir. İsteğe bağlı: Variables `PANORAMA_MANUAL_SYNC_SECRET`.
4. Kök `.env` + Vercel:  
   `N8N_PANORAMA_MANUAL_WEBHOOK_URL`  
   `N8N_PANORAMA_MANUAL_WEBHOOK_SECRET`

Webhook cron’u değiştirmez. Manuel execution’da zincirler sırayla gider  
(Main → YL → BD2 fatura → Sipariş 5140 → Stok → Tahsilat → Belge detay sipariş 5451) — aralarında **bekleme yok** (2026-09-04, bkz. "Bekleme süresi" bölümü).

## Tek tek rapor çekme (2026-09-03)

Webhook artık gövdeden **hangi zincirlerin** çalışacağını okuyor.

```json
POST /webhook/panorama-manual-sync
{ "source": "locus-manual", "reportIds": [5530] }
```

- `reportIds` **boş ya da yok** → bütün zincirler (eski davranış, birebir aynı).
- GET yedek yolu gövde taşıyamaz; id’ler query string’den okunur:
  `?reportIds=5530,5430`.

Nasıl çalışıyor:

1. `Guard Manuel Secret` header doğrulamasından sonra `body.reportIds` /
   `query.reportIds` okuyup `{ ok, manual, istenen }` döndürür.
2. **`IF Manuel → MAIN`** (yeni düğüm) `Guard` ile `Config` arasına girdi —
   Main zinciri eskiden koşulsuz çalışıyordu, tek başına atlanamıyordu.
   `Schedule Main 07/13/19 → Config` bağlantısına dokunulmadı, cron aynı.
3. Yedi `IF Manuel → *` düğümü artık “manuel mi” değil, **“bu zincir istendi
   mi”** diye bakıyor: `istenen` boşsa hepsi geçer.
4. **Kritik:** her IF’in **false çıkışı bir sonraki IF’e bağlı**. Zincir kaskad
   olduğu için eskiden bir IF kapanınca arkasındaki her şey ölürdü. False dalı
   zinciri tamamen atlar — istenmeyen bir rapor saniyeler içinde geçilir.

Zincir → id eşlemesi (`frontend/lib/panorama-raporlar.ts` ile aynı olmalı):

| Zincir | Gönderilecek id | Kapsadığı rapor |
|---|---|---|
| Main | `5020` | 5020 + 5500 + 5130 (bölünemez) |
| YL | `5530` | 5530 |
| BD2 | `5450` | 5450 |
| SD | `5140` | 5140 |
| STK | `5430` | 5430 |
| TH | `5230` | 5230 |
| BDS | `5451` | 5450 scrape, `syncReportId` 5451 |

Yan etki: cron çalışmalarında false dalı sıradaki IF düğümlerini de yürür.
Hiçbiri iş yapmaz (hepsi false döner) ve `IF Manuel → BDS` false çıkışı
bağlanmadan biter — execution logunda birkaç fazla no-op düğüm görünür.

## Bekleme süresi — KALDIRILDI (2026-09-04)

Zincirler arası 6 `Wait` düğümü (`Wait Main→YL`, `Wait YL→BD2`, `Wait BD2→SD`,
`Wait SD→STK`, `Wait STK→TH`, `Wait TH→BDS`) workflow'dan tamamen silindi.
Her `IF Manuel → X` düğümünün **true** çıkışı artık doğrudan o zincirin
`Config` düğümüne bağlı — önce `Wait`'e, `Wait` da `Config`'e gidiyordu.

`frontend/lib/panorama-raporlar.ts` içindeki `ZINCIR_ARASI_BEKLEME_SN` `0`'a
çekildi; tahmini bitiş damgası artık beklemesiz hesaplanıyor. "Hepsi" seçili
manuel çekim ~25 dk'dan ~7 dk'ya indi (ölçülen zincir sürelerinin toplamı,
`frontend/lib/panorama-raporlar.ts`'deki `tahminiSn` alanları).

⚠️ **Geri alınan risk:** Wait, aynı egress IP'den arka arkaya gelen
login'lerin önündeki F5 WAF'a bot trafiği gibi görünmesini önlüyordu
(login node'undaki `f5_cspm` cookie'si ve `loginDebug.note` bu yüzden var —
bkz. üstteki cron bölümü). "Hepsi" seçiliyken artık 7 login aralıksız
ateşleniyor. WAF tekrar tetiklenirse (execution'larda ardışık login
hatası / 403 görülürse) ilk geri alınacak değer budur: 6 IF'in true
çıkışını tekrar birer `Wait` düğümüne bağlayın (120 sn önerilir, ölçülen
en uzun çekim penceresi 108 sn) ve `ZINCIR_ARASI_BEKLEME_SN`'i eşleştirin.
Cron zaten Wait kullanmıyordu (ayrı `Schedule *` düğümleriyle 1'er dakika
kademeli tetikleniyor), bu değişiklik yalnız manuel/webhook yolunu etkiler.

## Cron takvimi (2026-08-31)

Günde 3 dalga, **Europe/Istanbul**: `07:00` / `13:00` / `19:00`. Dalga içinde
zincirler **1’er dakika arayla** — aynı egress IP’den 7 eşzamanlı Panorama
login’i, önündeki F5 WAF’a bot trafiği gibi görünür (login node’unun `f5_cspm`
cookie’si ve `loginDebug.note`’u bu yüzden var). Paralel çalıştırmayın.

| Dakika | Schedule node | Rapor | Cron |
|---|---|---|---|
| :00 | Schedule Main 07/13/19 | 5020 / 5500 / 5130 | `0 7,13,19 * * *` |
| :01 | Schedule Siparis Detay Gunluk | 5140 | `1 7,13,19 * * *` |
| :02 | Schedule Tahsilat Gunluk | 5230 | `2 7,13,19 * * *` |
| :03 | Schedule Stok Gunluk | 5430 | `3 7,13,19 * * *` |
| :04 | Schedule Belge Detay Siparis Gunluk | 5451 | `4 7,13,19 * * *` |
| :05 | Schedule Yaslandirma 5530 | 5530 | `5 7,13,19 * * *` |
| :06 | Schedule Belge Detay BD2 Gunluk | 5450 | `6 7 * * *` — **yalnız sabah** |

`Schedule Belge Detay PZT-CAR-CUM-PAZ` (eski BD zinciri) **deaktif** kalır.

5450 en ağır scrape (9.253 satır, ölçülen max 108 sn) ve günde 1x çalışır;
dalganın en sonuna konuldu ki gecikmesi başka zinciri itmesin.

Ölçülen Create Sync Run → Complete Sync Run pencereleri (aralarında Wait yok):
5450 108 sn, 5020 57 sn, 5451 52 sn, kalanı <31 sn. Stagger yetmezse aralığı
2 dakikaya çıkarın — cron dakikalarını `0,2,4,6,8,10,12` yapmak yeterli.

Bu tablo `frontend/lib/panorama-schedule.ts` içindeki `SLOT_MINUTES` ile
eşleşmeli; ana sayfadaki “Sonraki: …” damgası oradan üretiliyor.

## EPDK Yakıt Fiyatı Otomasyonu (2026-09-13)

`EPDK Yakit Fiyat Otomasyonu.json` — Panorama'dan bağımsız, ayrı bir workflow.
Günde 1x (06:00 TR) EPDK'nın resmi `petrolBayiSatisFiyatBulten` API'sinden
benzin/motorin fiyatını çekip `public.fuel_prices`'a upsert eder (şema:
`sql/fuel_prices_sema.sql`, önce uygulanmalı — `UNIQUE (price_date, fuel_type)`
olmadan upsert Postgres hatasıyla düşer).

**Gerçek API testiyle doğrulanan, örnek şemadan sapan noktalar:**
- İstek **GET + JSON body** (`{"raporTarihi":"dd.MM.yyyy"}`) — query param ve
  POST ikisi de denendi, ikisi de çalışmadı (400 / 404).
- Tarih formatı istekte `dd.MM.yyyy`, ama yanıttaki `Tarih` alanında
  `yyyy-MM-dd` — ikisini karıştırmayın, `price_date` yanıttan okunuyor.
- Auth yok. Rate limit gerçek (`ERR-224` 429, art arda hızlı çağrıda görüldü)
  — fallback öncesi 5sn Wait + `retryOnFail` bu yüzden var.
- Bu bültende LPG/Otogaz hiç görülmedi (yalnız benzin/motorin + 4 alakasız
  endüstriyel ürün). Normalize node LPG için de bir eşleme deniyor ama
  gerçek isim doğrulanana kadar veri gelmeyecek — bkz. workflow içindeki
  sticky note. **2026-09-13'te kapatıldı:** apigateway.epdk.gov.tr'de 13
  olası endpoint adı denendi, hiçbiri kayıtlı değil ("ApiProxy is not
  found"); tek bulunan LPG kaynağı bildirim.epdk.gov.tr'deki HTML/JSF form
  sayfası (scraping gerektirir, yasak). Filo zaten tamamen dizel — gerçek
  ihtiyaç çıkmadan tekrar araştırmaya değmez.

**Neden Supabase node değil HTTP Request:** n8n'in yerleşik Supabase node'unda
upsert operasyonu yok (kaynak koddan doğrulandı — yalnız Create/Get/Get
Many/Update/Delete var). Upsert, Supabase credential'ı "Predefined Credential
Type" olarak seçilmiş bir HTTP Request node'uyla, PostgREST'in kendi upsert
mekanizmasıyla (`Prefer: resolution=merge-duplicates` + `?on_conflict=...`)
yapılıyor — Panorama'nın kendi upsert'lerinde kullandığı yöntemin aynısı,
farkı secret'ın Config node'unda değil n8n credential deposunda tutulması.

Kurulum: workflow'u içe aktar → "Upsert Fuel Prices" node'unu aç → Supabase
API credential'ını seç/oluştur (host + secret/service_role key) → manuel
çalıştır → şema doğruysa Schedule'ı aktif et. Hiçbir secret JSON'da yok.

## Google Places Prospecting — Supabase auth (2026-09-14)

`google-places-prospecting (1).json`. Belirti: **"Expand Ilce Rows" düğümü
`{"message":"Invalid API key","hint":"Double check your Supabase anon or
service_role API key."}` ile patlıyordu.**

Gerçek hata `Expand Ilce Rows`'da değil, bir önceki `Fetch Ilce Merkezleri`
HTTP düğümündeydi. O düğümde `neverError: true` açık olduğu için PostgREST'in
401 gövdesi hata sayılmadan aşağı akıyor, kod düğümü de onu "dizi değil" diye
yakalayıp fırlatıyordu. Kök neden: `Config.supabaseServiceRoleKey` hâlâ
`REPLACE_ME_SERVICE_ROLE_JWT` yer tutucusuydu ve o dize `apikey` başlığı
olarak gönderiliyordu.

**Çözüm — secret Config'ten çıkarıldı, n8n credential deposuna taşındı.**
EPDK'daki `Upsert Fuel Prices` ile aynı desen (yukarıdaki bölüm):

- Supabase'e giden 7 HTTP Request düğümü artık
  `Authentication = Predefined Credential Type → Supabase API` kullanıyor.
  Credential kendi `apikey` + `Authorization: Bearer` başlıklarını ekler;
  düğümlerdeki elle yazılmış iki başlık silindi.
- URL tabanı `{{ $credentials.host }}` (EPDK'da çalıştığı doğrulanmış kullanım).
- `Config` düğümünde artık `supabaseServiceRoleKey` alanı **yok**; kod
  düğümlerinin item'dan item'a taşıdığı 25 ölü referans da temizlendi.
- `Expand Ilce Rows` içindeki "Config.supabaseServiceRoleKey doldur" kontrolü
  kaldırıldı; yerine auth hatasını tanıyıp hangi düğümlerde credential
  seçileceğini söyleyen bir mesaj kondu.

İçe aktardıktan sonra Supabase API credential'ı seçilecek 7 düğüm:
`Fetch Ilce Merkezleri`, `Fetch Musteriler`, `Fetch Existing Place Ids`,
`Insert New`, `Update Fresh Fields`, `Mark Son Tarama`, `Mark Yogun Bolge`.
(Google tarafı ayrı: `Nearby/Text/Deep*` düğümleri Header Auth credential.)

**Neden yerleşik Supabase node değil:** aynı gerekçe EPDK bölümündekiyle —
node'da upsert operasyonu yok, bu akışın 4 yazması da PostgREST upsert'ü
(`on_conflict=...` + `Prefer: resolution=merge-duplicates`). Ayrıca CLAUDE.md
"ingestion katmanını kaynak-agnostik tut" diyor; düz HTTP + REST, Aralık
2026'daki veritabanı geçişinde node değiştirmeden taşınabilir.

Canlı şemaya karşı doğrulandı (2026-09-14): `ilce_merkezleri` 134 satır
(kod ≥100 bekliyor), kolon adı gerçekten `yoğun_bolge` (Türkçe ğ ile — URL'de
öyle duruyor, doğru), `son_tarama` var; `potansiyel_musteriler` 3.794 satır ve
`UNIQUE (kaynak, kaynak_id)`, `ilce_merkezleri` `UNIQUE (il, ilce)` — her iki
`on_conflict` hedefi de mevcut. `musteriler` 1.432 satır (Range 0-4999 yeterli).

## Arvento Araç Takibi (2026-09-14)

Dosya: `Arvento Arac Takibi.json` · 29 düğüm · `active: false` (import sonrası
elle açılır) · `timezone: Europe/Istanbul`.

Araçların anlık konumunu ve bakım kayıtlarını Arvento Service API'sinden çekip
Supabase'e yazar. Şema: `sql/arvento_*.sql`.

### Neden TEK workflow (bölünemez)

Arvento'da **tek-oturum kısıtı** var: her `POST /v1/login` yeni `sessionId`
üretiyor ve **öncekini anında öldürüyor** (eski sid → HTTP 401, boş body,
2026-09-14 canlı testinde doğrulandı). Konum ve filo/bakım ayrı workflow olsaydı
her biri diğerinin oturumunu keserdi. İkisi de `Oturum Al` düğümünü ve aynı
`$getWorkflowStaticData('global')` cache'ini paylaşıyor.

Aynı sebeple: **bu hesapla Postman'den veya Arvento web arayüzünden login
atmak, çalışan workflow'un oturumunu öldürür.** Workflow bunu 401 dalıyla
toparlar ama gereksiz login üretir.

### Ortam değişkenleri (JSON'da sır YOK)

```
ARVENTO_USER
ARVENTO_PASS
```
n8n Settings → Environment Variables. Code node'ları `$env` üzerinden okur —
Panorama'nın `Login` düğümündeki `$env.PANORAMA_USER` yedeğiyle aynı mekanizma.
`$vars` **kullanılmadı** (2026-09-03 dersi: değişken yoksa zincir patlıyor).
Supabase tarafı `predefinedCredentialType: supabaseApi`.

### Cron

| Tetikleyici | İfade | Ne |
|---|---|---|
| `Schedule Konum` | `*/1 7-19 * * 1-6` | Mesai içi, dakikada bir |
| `Schedule Konum` | `*/15 0-6,20-23 * * *` | Mesai dışı + Pazar, 15 dk |
| `Schedule Filo Bakim` | `7 5 * * *` | Araç listesi + bakım, günde 1 |

`05:07` bilerek seçildi: EPDK 06:00 ve Panorama 07:00 dalgalarından önce, ve
mesai dışı tetikleyicinin `:00/:15/:30/:45` dakikalarıyla çakışmıyor.

### İlk import — SIRA ÖNEMLİ

1. Mevcut workflow üzerine import et, credential'ları elle seç.
2. Workflow'u **kapat ve tekrar aç**.
3. Önce **`Schedule Filo Bakim`**'i manuel çalıştır → `arvento_araclar` 8 satır.
4. Sonra **`Schedule Konum`**'u manuel çalıştır → `v_arac_konum_son` dolmalı.
5. `arvento_araclar.arac_kod`'u elle doldur (bkz. aşağıda).
6. Active yap.

3. adım atlanırsa konum satırları yine yazılır (FK bilerek yok) ama
`v_arac_konum_son` inner join olduğu için arayüzde **hiçbir araç görünmez**.

### Araç eşlemesi elle yapılır

`arvento_araclar.arac_kod` NULL başlar. Arvento 8 araç döndürüyor, bunların
3'ü sevkiyat (`35ASM899`, `34UBB75`, `42ENL50` — "PATİGO SEVKİYAT 1/2/3"),
5'i şahıs aracı görünüyor. Bizim `araclar` tablosunda ise 4 rota aracı var.
**Melih'e sorulacak:** 4. rota aracında cihaz yok mu? Otomatik tahmin
yapılmıyor — API yalnız "OTOMOBIL"/"KAMYON" ayrımı veriyor, hangi kamyonun
NPR 10 hangisinin 3D olduğunu bilmiyor.

### Hata yönetimi — Panorama'dan farkı

Panorama her zincirde önce `running` satırı açıp sonra `completed`'a çekiyor;
hiçbir error branch olmadığı için zincir çökünce satır sonsuza kadar `running`
kalıyor ve `sql/panorama_sync_stale_sweep.sql` diye ayrı bir pg_cron süpürücü
yazmak gerekmiş.

Burada **`running` durumu hiç oluşmuyor**: filo/bakım kolu tek satırı EN SONDA,
kesinleşmiş durumla yazıyor. 6 düğümde `onError: continueErrorOutput` tanımlı,
hepsi `Hata Hazirla` → `Hata Kaydi` koluna bağlı ve `failed` satırı yazıyor.
Süpürücü cron'a gerek yok.

**Konum kolu başarılı çalıştırmada sync_runs satırı YAZMAZ** — dakikada bir
çalıştığı için günde ~800 satır gürültü olurdu. Tazelik
`arac_konum_son.cekildi_at`'ten okunur.

### API sözleşmesi (2026-09-14 canlı test)

- **HTTP kodu her zaman 200**, hata `HasError`/`Status` alanlarında. Tek
  istisna geçersiz sid → gerçek 401. Status: `0`=OK, `1000`=null reference,
  `1012`=InvalidDateInterval.
- **`Date` alanı Türkiye yerel saati (UTC+3), UTC DEĞİL.** HTTP `date` header'ı
  `06:59:47 GMT` iken API `20260914095947` döndü. Normalize `+03:00` offset'iyle
  parse ediyor, orijinali `ham_tarih`'te saklıyor.
- `{"Nodes": []}` tüm araçları döndürür; `{}` → Status 1000.
- Plaka formatı tutarsız: 7 araç bitişik, 1 araç boşluklu (`"34 PDV 736"`).
  Normalize upper + boşluksuz yapıyor, orijinali `plaka_ham`'da tutuyor.
- Maintenance 1,5 yıllık aralıkta `InvalidDateInterval` veriyor → 3'er aylık
  12 pencereye bölünüyor (geçmiş 24 ay + gelecek 12 ay), pencereler arası 1 sn.

**Hesabımızda KAPALI uçlar** ("Bu servisi kullanmaya yetkiniz yoktur"):
`/v1/vehicle/events`, `/v1/report/general`, `/v1/report/vehicleOperating`,
`/v1/vehicle/lastEventsIgnition`, `/v1/vehicle/lastEventsV2`,
`/v1/vehicle/groups`. Bu yüzden düz `lastEvents` kullanılıyor ve plaka
`arvento_araclar` üzerinden join ediliyor.

### Arvento'ya sorulacaklar

| Soru | Şimdiki varsayım |
|---|---|
| `sessionId` gerçek ömrü | `Oturum Al`'da `TTL_MS` = 30 dk + 401'de yeniden login |
| Cihaz değişince `Node` değişir mi | `plaka` UNIQUE tutularak ikincil kimlik korunuyor |
| Günlük/aylık API kotası | ~800 çağrı/gün; 32 ardışık istekte limit görülmedi |
| Kalıcı `SecretKey` (`/v1/externalLogin`) | Parola ile devam — key gelirse `Oturum Al` tek yerde değişir |
| IP whitelist gerekiyor mu | Test edilen IP'den çalıştı; n8n sunucusu farklı IP'deyse gerekebilir |

### Kod düğümlerini n8n olmadan test etme

```bash
node backend/n8n/test/arvento-code-nodes.test.mjs
```

`Code` düğümlerinin gövdesi saf JS; `$input` / `$('Düğüm Adı')` / `$env` /
`$getWorkflowStaticData` sahtelenince JSON'dan çıkarılıp doğrudan koşturulabilir.
26 test, girdileri 2026-09-14 canlı Postman yanıtlarından birebir alınmış.
UTC+3 çevrimi, plaka normalize, dedup anahtarları, `HasError` yakalama ve
PostgREST hata kontrolü bu şekilde doğrulandı — import etmeden.

**Workflow'daki düğüm adlarını değiştirirsen bu dosyayı da güncelle** —
testler koda düğüm adıyla erişiyor.

## Harita → il bazlı tarama (2026-09-14)

Haritadaki **"Potansiyel ara"** düğmesi Türkiye illerini soluk gri poligon
olarak çiziyor; bir il seçilince `google-places-prospecting` workflow'u
**yalnız o il için** çalışıyor. Günde 2 tarama hakkı var.

```
harita → POST /api/potansiyel/tarama { plaka }
       → route: guard merdiveni → potansiyel_taramalari satırı aç
       → POST /webhook/potansiyel-tarama { runId, il, plaka, skipDays, maxCells }
       → Webhook Potansiyel Tarama → Guard Tarama Secret → Config → (mevcut zincir)
       → Summary → Has Run Id? → Complete Tarama (PATCH durum=completed, ozet)
       → tarayıcı satırı anon key ile 15 sn'de bir poll eder → toast
```

**Kurulum:** workflow'u içe aktar → `Complete Tarama` düğümünde Supabase API
credential'ını seç (artık **8** düğüm credential istiyor) → Webhook düğümünü
kaydet, workflow'u **kapatıp tekrar aç** (production webhook yeniden kaydolur)
→ Production URL'i ve sırrı `.env`/Vercel'e yaz:

```
N8N_POTANSIYEL_TARAMA_WEBHOOK_URL=https://<n8n>/webhook/potansiyel-tarama
N8N_POTANSIYEL_TARAMA_WEBHOOK_SECRET=<uzun rastgele>
```

Sır `Guard Tarama Secret` düğümünde `X-N8N-Sync-Secret` (veya Bearer) ile
kontrol ediliyor — webhook `Authentication = None`, ev deseniyle aynı.
n8n tarafında istersen `$vars.POTANSIYEL_TARAMA_SECRET` da okunuyor.

### Config düğümü artık gövdeden besleniyor

| alan | cron/manuel | webhook |
|---|---|---|
| `il` | `''` → filtre yok | seçilen il, `Build Nearby Cells` filtreler |
| `runId` | `''` → `Has Run Id?` false, PATCH yok | satır id'si |
| `skipDays` | `'25'` | route `TARAMA_SKIP_DAYS` gönderir |
| `maxCells` | `600` | `600` |

Hepsi `{{ $json.X \|\| varsayılan }}` — cron yolunda `$json` boş olduğu için
**davranış bit‑bit eskisiyle aynı**. Set düğümünde *Include Other Fields*
kapalı; atanmayan alan sessizce düşer, yeni bir alan eklerken bunu unutma.

### `maxCells` sigortası — neden var

Günde 2 tarama **koşu** sayısını sınırlar, **çağrı** sayısını değil. Yeni
iller `yoğun_bolge=false` ile başlıyor, yani ilk taramada her ilçe tek
5 km'lik hücre; şehir merkezinde o hücre 20 sonuç dönüp kırpılıyor ve 2 pass
derinleşme ile ilçe başına 21 hücreye kadar çıkabiliyor. İstanbul'un 39
ilçesi ilk taramada ~800 Nearby çağrısı demek.

`Build Nearby Cells` bu yüzden **ilçe granülaritesinde** kesiyor: öngörülen
hücre sayısı `maxCells`'i aşacaksa yeni ilçe eklenmiyor ve o ilçe
`scannedDistricts`'e de girmiyor — böylece taranmamış ilçeye `son_tarama`
yazılıp 25 gün kilitlenmesi engelleniyor. Atlanan sayı `Summary.atlananIlceSayisi`
ile arayüze taşınıyor.

### Eşzamanlılık

`$getWorkflowStaticData('global')` n8n'de **workflow başına**, execution
başına değil. İki eşzamanlı tarama birbirinin `placesById` /
`scannedDistricts` / `clippedDistricts`'ini ezer ve yanlış ilçelere
`son_tarama` yazar. Korumalar:

- API in-flight kilidi: `durum='running'` satır varsa 409. **Zaman kesiti
  yok** — ölüye karar veren tek merci `sweep_stale_potansiyel_taramalari`
  (40 dk eşik, 10 dk'da bir cron). Panorama'daki "kilit süpürücüden kısa"
  deseni burada bilerek TERSİNE çevrildi.
- Haftalık cron (`0 6 * * 3`) run satırı yazmıyor, yani kilit onu göremiyor;
  route Çarşamba 06:00-08:00 TR penceresinde manuel taramayı reddediyor.
  Kalıcı çözüm cron yoluna da satır açmak — henüz yapılmadı.

### Aynı değişiklikte giden üç mevcut hata

| Düğüm | Neydi | Neden önemliydi |
|---|---|---|
| `Fetch Ilce Merkezleri` | `limit=500` | 81 il seed'inden sonra ~973 ilçe var; URL sessizce ilk 500'ü döndürürdü, ülkenin yarısı taramaya görünmez olurdu |
| `Expand Ilce Rows` | taban `< 100` | 134'lük eşik seed sonrası anlamsız; artık `< 900` ve tek tripwire o |
| `Reset Static Accumulator` | `placesApiErrors` hiç sıfırlanmıyordu | `Mark Scanned Prep` bu kümülatif listeden 429 kara listesi kuruyor → bir kez 429 alan ilçeye **bir daha asla** `son_tarama` yazılmıyordu, sonsuza dek yeniden taranıyordu |

Üçüncüsü tazelik önizlemesinin dayandığı veriyi çürütüyordu; il bazlı manuel
tarama cron'dan daha sık 429 aldığı için düzeltilmeden çıkılamazdı.

### Sıfır maliyetli uçtan uca test

Webhook gövdesine `skipDays: 99999` koy: tüm ilçeler "taze" sayılır →
`Build Nearby Cells` → `skipAll` → `Has Cells?` doğrudan `Summary`'ye →
`Has Run Id?` → `Complete Tarama`. Webhook'tan toast'a kadar bütün yeni yol
**tek bir Google çağrısı yapılmadan ve `son_tarama` yazılmadan** doğrulanır.
(`Mark Scanned Prep`'in `placeTotal=0` throw'u atlanan dalda kalır.)

Cron regresyonu: `Manual Trigger`'dan çalıştır — `il` boş → filtre yok,
`runId` boş → PATCH yok, `potansiyel_taramalari` el değmemiş olmalı.

### Bilinen sınırlama — "Merkez" adlı ilçeler

`Build Text Queries` sorguyu `${varyasyon} ${ilce}` diye kuruyor. Seed
merkez ilçesini il adıyla yazıyor ("Bilecik"), yani sorgu "pet shop Bilecik"
oluyor. Ama eski iki satır (`Çanakkale/Merkez`, `Uşak/Merkez`) düz "Merkez"
taşıyor ve ikisi de `yoğun_bolge=true` — onlarda sorgu "pet shop Merkez"
oluyor, işe yaramaz. Yeniden adlandırmak `son_tarama`/`yoğun_bolge`
geçmişini yetim bırakacağı için dokunulmadı.

## Dışa aktarmadan önce kontrol

```bash
grep -nE "eyJhbGciO|arma123|\"panoramaPass\"|\"supabaseServiceRoleKey\"" backend/n8n/*.json
```

**Çıktı boş olmalı.** 2026-09-14'ten beri üç workflow da bu kontrolü geçiyor.
Çıktı verirse n8n'den dışa aktarırken sır sızmış demektir — commit etme,
değeri credential'a/ortam değişkenine taşı ve yeniden dışa aktar.
