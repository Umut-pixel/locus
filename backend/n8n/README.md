# n8n iş akışları

## ⚠️ Bu dosyalara ASLA gerçek sır yazma

`panorama-otomasyon.json` içindeki Config düğümleri iki yer tutucu taşır:

```
<<SUPABASESERVICEROLEKEY_BURAYA>>
<<PANORAMAPASS_BURAYA>>
```

n8n'e içe aktardıktan **sonra** kendi n8n arayüzünde doldur. Dosyaya geri
yazıp commit etme.

**Neden:** 2026-08-19'da bu dosya gerçek `service_role` anahtarı ve Panorama
parolasıyla commit edildi ve herkese açık depoya push edildi. `service_role`
tüm RLS politikalarını atlar — sızdığında veritabanının tamamı okunup
yazılabilir hale gelir. İkisi de 2026-08-22'de döndürüldü/temizlendi.

## Mevcut durum (2026-09-04) — dosyada GERÇEK kimlik bilgileri var

Yukarıdaki kural hâlâ doğru hedeftir, ama **şu an uygulanmıyor.** Dosya
gerçek `panoramaPass` ve gerçek `supabaseServiceRoleKey` değerlerini düz
metin taşıyor.

**Neden böyle:** 2026-09-03'te bu alanlar `{{ $vars.… }}` ifadeleriyle
değiştirildi, ama karşılık gelen n8n değişkenleri **hiç oluşturulmamıştı**.
Sonuç: `Login *` düğümleri "Config.panoramaUser / panoramaPass gerekli"
hatasıyla patladı, tüm zincirler durdu. Çalışan sürüme geri dönüldü ve
otomasyon özellikleri o sürümün üzerine yeniden eklendi.

**Ders:** Çalışan bir kimlik bilgisini değişken referansına çevirmeden önce
değişkenin n8n'de **var olduğunu doğrula ve bir çekim testi yap.** Sıra:
önce değişkeni oluştur → tek zincirle test et → sonra dosyayı temizle.

Temizliğe dönmek istediğinde:

```
{{ $vars.SUPABASE_SERVICE_ROLE_KEY }}
{{ $vars.PANORAMA_PASS }}
```

n8n'de: Settings → Variables. Self-hosted'da `N8N_VARIABLES_*` ortam
değişkenleriyle de beslenebilir. Değişken adında tire varsa
(`$vars['ad-tireli']`) köşeli parantez şart — nokta gösterimi geçersiz JS olur.

`Login *` düğümleri ayrıca `$env.PANORAMA_PASS` / `$env.PANORAMA_USER`
yedeğini de okuyor (kod satır 3-4), yani Config alanını boşaltmak yerine
ortam değişkeni de kullanılabilir.

⚠️ Anahtar döndürme ayrı iş: bu değerler git geçmişinde zaten duruyor
(`098b118` ve öncesi). Dosyayı temizlemek yetmez — gerçek çözüm anahtarı
Supabase ve Panorama tarafında döndürmek.

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

## Dışa aktarmadan önce kontrol

```bash
grep -nE "eyJhbGciO|\"panoramaPass\": \"[^<]" backend/n8n/*.json
```

⚠️ **Şu an bu komut ÇIKTI VERİR** — dosya bilerek gerçek kimlik bilgileri
taşıyor (bkz. "Mevcut durum" bölümü). Yukarıdaki "çıktı boş olmalı" hedefi,
n8n değişkenleri kurulup bir çekim testiyle doğrulandıktan sonra geçerli
olacak. O zamana kadar bu kontrol yalnız *başka* bir sır türü sızmış mı diye
bakmak için kullanılabilir.
