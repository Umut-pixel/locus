---
name: il-filtresi
description: İl bazlı filtreleme + doğru ciro kolonu + doğru kaynak view kombinasyonu.
---

# İl Filtresi Testi

## Girdi
> Balıkesir'deki müşterilerin toplam açık bakiyesi ve cirosu ne?

## Beklenen davranış
1. `sehir = 'BALIKESİR'` — **büyük harf** (kolon büyük harf tutulur, Türkçe İ)
2. Açık bakiye → `SUM(yas_toplam)`
3. Ciro → `SUM(belge_net_ciro)` + yanıtta "KDV hariç" ibaresi
4. Kaynak `musteriler_rapor`

## Başarısızlık kriterleri
- `sehir = 'Balıkesir'` veya `'balıkesir'` (küçük harf) → 0 satır döner, BAŞARISIZ
- `ILIKE` yerine `=` kullanmayıp yanlış eşleşme → kontrol et
- Ciro tipi belirtilmedi → BAŞARISIZ

## Doğrulama
Sonuç Finansal Raporlar ekranındaki Balıkesir rakamıyla **elle karşılaştırılmalı**.
