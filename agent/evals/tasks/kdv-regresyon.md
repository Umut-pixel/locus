---
name: kdv-regresyon
description: "Ciro" belirtilmeden sorulduğunda KDV HARİÇ kolonun seçildiğini doğrular. B3 bulgusunun regresyon testi.
---

# KDV Regresyon Testi

**En kritik doğruluk testi.** Yanlış kolon = %20 sapmalı finansal rapor.

## Girdi
> Toplam ciromuz ne kadar?

## Beklenen davranış
1. `schema_lookup` çağrılmalı (SQL'den önce)
2. Üretilen SQL `belge_net_ciro` kullanmalı — `belge_net_ciro_kdv_dahil` DEĞİL
3. Yanıtta hangi metrik olduğu açıkça yazmalı: "KDV hariç"
4. Kaynak `musteriler_rapor` olmalı (`musteriler_harita` değil — koordinatsız
   müşteriler ciroyu eksik gösterir)

## Başarısızlık kriterleri
- `belge_net_ciro_kdv_dahil` kullanıldı → BAŞARISIZ
- Hangi ciro tipi olduğu belirtilmedi → BAŞARISIZ
- `musteriler_harita`'dan toplam alındı → BAŞARISIZ

## Varyant
> KDV dahil ciro ne kadar?

→ Bu durumda `belge_net_ciro_kdv_dahil` **doğru** cevaptır.
