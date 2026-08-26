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

1. n8n → Credentials → Header Auth oluştur  
   name = `X-N8N-Sync-Secret`, value = rastgele sır  
2. Webhook node’una bu credential’ı bağla (JSON’daki `<<N8N_HEADER_AUTH_CREDENTIAL_ID>>` yer tutucu)  
3. Workflow’u aktif et, Production URL’i kopyala  
4. Kök `.env` + Vercel:  
   `N8N_PANORAMA_MANUAL_WEBHOOK_URL`  
   `N8N_PANORAMA_MANUAL_WEBHOOK_SECRET` (aynı value)

Webhook cron’u değiştirmez. Manuel execution’da zincirler **Wait 180s** ile sırayla gider  
(Main → YL → BD2 → Sipariş → Stok) — WAF’a paralel login basmamak için.

## Dışa aktarmadan önce kontrol

```bash
grep -nE "eyJhbGciO|\"panoramaPass\": \"[^<]" backend/n8n/*.json
```

Çıktı boş olmalı.
