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

## Daha iyisi: n8n değişkenleri

Inline değer yerine n8n'in kendi değişkenlerini kullan; böylece dışa
aktarılan JSON'da sır hiç bulunmaz:

```
{{ $vars.SUPABASE_SERVICE_ROLE_KEY }}
{{ $vars.PANORAMA_PASS }}
```

n8n'de: Settings → Variables. Self-hosted'da `N8N_VARIABLES_*` ortam
değişkenleriyle de beslenebilir.

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

Webhook cron’u değiştirmez. Manuel execution’da zincirler **Wait 180s** ile sırayla gider  
(Main → YL → BD2 fatura → Sipariş 5140 → Stok → Tahsilat → Belge detay sipariş 5451) — WAF’a paralel login basmamak için.

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

Çıktı boş olmalı.
