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
(Main → YL → BD2 → Sipariş → Stok) — WAF’a paralel login basmamak için.

## Dışa aktarmadan önce kontrol

```bash
grep -nE "eyJhbGciO|\"panoramaPass\": \"[^<]" backend/n8n/*.json
```

Çıktı boş olmalı.
