# SQL — Supabase / Postgres

Kanonik şema **`sema.sql`**. Risk hesaplama burada (`musteriler_harita.risk_durumu`); uygulama kodunda kopyalanmaz.

Uygula: Supabase Studio → SQL Editor. Önce `sema.sql`, sonra ihtiyaç duyulan deltalar.

## Kanonik

| Dosya | İş |
|---|---|
| `sema.sql` | `musteriler`, yaşlandırma, belge özet, indeksler, RLS, `musteriler_harita` view |

## View / metrik deltaları

`sema.sql` uygulandıktan sonra, view tanımı değiştiyse ilgili dosyayı da çalıştırın. View kolon eklenince `CREATE OR REPLACE` yetmez — bu dosyalar `DROP + CREATE` yapar.

| Dosya | İş |
|---|---|
| `risk_durumu_current_date.sql` | `risk_durumu`’nu `current_date`’e bağlar |
| `net_ciro_kdv_haric.sql` | `belge_net_ciro` KDV hariç |
| `raporlama_view_koordinatsiz.sql` | `musteriler_rapor` — koordinat filtresiz rapor kümesi |
| `rapor_bolge_disi_ozet.sql` | 8-il dışı ciro mutabakat satırı |
| `metrik_gecmis_sema.sql` | `musteri_metrik_gecmis` (Trend 14g sparkline) |
| `yaslandirma_sema.sql` | ST yaşlandırma tablosu |
| `belge_ozet_sema.sql` | BelgeDetay müşteri aggregate |

## Panorama sync

| Dosya | İş |
|---|---|
| `panorama_landing_index.sql` | Landing tabloları indeksleri |
| `panorama_sync_webhook.sql` | `panorama_sync_runs` → Vercel transform (`pg_net`) |

## UI / potansiyel

| Dosya | İş |
|---|---|
| `entity_notlar.sql` | Müşteri + potansiyel notları |
| `musteri_gizlenenler.sql` | Haritadan gizlenen müşteriler |
| `potansiyel_musteri_bayrak.sql` | Potansiyel bayrağı + harita view |
| `potansiyel_favoriler.sql` | Potansiyel “sonra bak” listesi |
| `potansiyel_gizlenenler.sql` | Gizlenen potansiyeller |
| `potansiyel_gurultu_gizle.sql` | Petshop/vet dışı gürültü (soft-hide) |
