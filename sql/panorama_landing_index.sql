-- =============================================================================
-- Panorama landing tablolari: eksik index'ler (2026-08-11 audit'i, K6)
-- =============================================================================
--
-- SORUN
--   Landing tablolarini n8n dogrudan Supabase'de olusturuyor; repoda DDL'leri
--   yok ve hicbirinde index tanimlanmamis. Audit sirasinda 16.334 satirlik
--   panorama_belge_detay_raporu uzerinde tek bir `musteri_kod` filtresi
--   PostgREST'te "statement timeout" (57014) ile dustu.
--
--   Bu tablolar her sync'te buyuyor (upsert + tarihce birikiyor), dolayisiyla
--   transform de (v_panorama_*_guncel view'lari uzerinden) giderek yavasliyor.
--
-- NOT
--   CONCURRENTLY kullanilmadi: Supabase SQL Editor tek transaction'da calistigi
--   icin CREATE INDEX CONCURRENTLY hata verir. Tablolar kucuk (10-20k satir),
--   normal CREATE INDEX'in kisa kilidi kabul edilebilir. Cok daha buyurlerse
--   psql'den CONCURRENTLY ile alinmali.
--
-- Idempotent: hepsi IF NOT EXISTS.
-- =============================================================================

-- Transform ve tekil musteri sorgulari bu kolondan filtreliyor.
create index if not exists idx_belge_detay_musteri_kod
  on public.panorama_belge_detay_raporu (musteri_kod);

create index if not exists idx_acik_fatura_musteri_kod
  on public.panorama_acik_fatura_vade_kup (musteri_kod);

-- "Bu rapor en son ne zaman basariyla cekildi" sorgusu (UI tazelik rozeti +
-- freshness gate) her sayfa yuklemesinde calisiyor.
create index if not exists idx_sync_runs_report_cekildi
  on public.panorama_sync_runs (report_id, cekildi_at desc);

-- v_panorama_*_guncel view'lari son sync'i secmek icin sync_id'ye bakiyor.
create index if not exists idx_belge_detay_sync
  on public.panorama_belge_detay_raporu (sync_id);

create index if not exists idx_acik_fatura_sync
  on public.panorama_acik_fatura_vade_kup (sync_id);

create index if not exists idx_siparis_durum_sync
  on public.panorama_siparis_durum_raporu (sync_id);

create index if not exists idx_siparis_detay_sync_id
  on public.panorama_siparis_detay_raporu (sync_id);

create index if not exists idx_detayli_stok_sync
  on public.panorama_detayli_stok_raporu (sync_id);

create index if not exists idx_tahsilat_sync
  on public.panorama_tahsilat_raporu (sync_id);

create index if not exists idx_tahsilat_musteri_kod
  on public.panorama_tahsilat_raporu (musteri_kod);

-- Dogrulama:
--   explain analyze
--   select count(*) from public.panorama_belge_detay_raporu where musteri_kod = '100000029';
-- Beklenen: Index Scan (Seq Scan degil), < 50 ms.
