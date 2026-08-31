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
| `rapor_bolge_disi_ozet.sql` | Master'da kaydı olmayan belge cirosu mutabakat satırı |
| `metrik_gecmis_sema.sql` | `musteri_metrik_gecmis` (Trend 14g sparkline) |
| `yaslandirma_sema.sql` | ST yaşlandırma tablosu |
| `belge_ozet_sema.sql` | BelgeDetay müşteri aggregate |

## Panorama sync

| Dosya | İş |
|---|---|
| `panorama_landing_index.sql` | Landing tabloları indeksleri |
| `panorama_siparis_detay_sema.sql` | 5450 sipariş kanalı landing + 5451 guncel view |
| `panorama_tahsilat_sema.sql` | 5230 tahsilat landing + müşteri özeti |
| `panorama_sync_webhook.sql` | `panorama_sync_runs` → Vercel transform (`pg_net`) |
| `panorama_sync_stale_sweep.sql` | Yarım kalan `running` satırlarını `failed` işaretler (`pg_cron`, 15 dk) |

## UI / potansiyel

| Dosya | İş |
|---|---|
| `agent_konusmalar.sql` | Asistan sohbetleri + mesajları |
| `agent_konusma_mesaj_model.sql` | Mesaj satırına `model` kolonu |
| `agent_konusma_sira_no.sql` | `sira_no` — sohbet URL numarası (`/sohbet/{slug}-{no}`) |
| `entity_notlar.sql` | Müşteri + potansiyel notları |
| `musteri_gizlenenler.sql` | Haritadan gizlenen müşteriler |
| `potansiyel_musteri_bayrak.sql` | Potansiyel bayrağı + harita view |
| `potansiyel_favoriler.sql` | Potansiyel “sonra bak” listesi |
| `potansiyel_gizlenenler.sql` | Gizlenen potansiyeller |
| `potansiyel_gurultu_gizle.sql` | Petshop/vet dışı gürültü (soft-hide) |
