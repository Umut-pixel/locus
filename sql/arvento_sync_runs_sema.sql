-- =============================================================================
-- arvento_sync_runs — Arvento n8n çekim günlüğü
-- =============================================================================
--
-- n8n workflow: backend/n8n/Arvento Arac Takibi.json
--
-- Neden panorama_sync_runs YENİDEN KULLANILMIYOR (iki somut engel):
--   1) panorama_sync_runs.report_id NOT NULL integer. Arvento'nun rapor id'si
--      yok, sahte bir sayı uydurmak gerekirdi.
--   2) sweep_stale_panorama_sync_runs() pg_cron işi 15 dakikada bir çalışıp
--      30 dk'dan eski running/pending satırları 'failed'a çekiyor
--      (bkz. sql/panorama_sync_stale_sweep.sql). Bizim satırlarımızı da bozardı.
-- Kolon şekli kasıtlı olarak aynı tutuldu — ileride tek bir kaynak-agnostik
-- entegrasyon günlüğüne birleştirmek kolay olsun (CLAUDE.md: ingestion katmanı
-- kaynak-agnostik kalsın, Aralık 2026 DB göçü).
--
-- ⚠ KONUM İŞİ HER ÇALIŞTIRMADA SATIR YAZMAZ. Mesai içi polling dakikada bir —
-- günde ~800 satır saf gürültü olurdu. Konum kolu YALNIZ HATA satırı yazar.
-- Başarılı çekimin tazeliği arac_konum_son.cekildi_at'ten okunur.
-- Filo/bakım kolu (günde 1 kez) her çalıştırmayı running -> completed yazar.
--
-- Bu yüzden stale sweep cron'u BU TABLOYA KURULMUYOR: yalnız günde bir satır
-- açılıyor, yetim 'running' kilidi bir API endpoint'ini bloke etmiyor
-- (panorama'daki 409 sorunu burada yok).
--
-- Takip işi (kapsam dışı): sql/bildirim_sistemi.sql şu an yalnız
-- panorama_sync_runs'taki failed satırlarını Telegram'a düşürüyor. Bu tabloyu
-- da okuması küçük bir ek — ayrı iş olarak açılmalı.
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- =============================================================================

create table if not exists public.arvento_sync_runs (
    id             uuid primary key default gen_random_uuid(),
    is_turu        text not null,
    durum          text not null,
    satir_sayisi   integer,
    hata           text,
    cekildi_at     timestamptz not null default now(),
    tamamlandi_at  timestamptz,
    constraint arvento_sync_runs_is_turu_check check (is_turu in ('konum', 'filo_bakim')),
    constraint arvento_sync_runs_durum_check   check (durum in ('running', 'completed', 'failed'))
);

comment on table public.arvento_sync_runs is
  'Arvento n8n çekim günlüğü — bkz. sql/arvento_sync_runs_sema.sql başlığı. Konum kolu yalnız HATA yazar (dakikalık polling gürültü olurdu), filo/bakım kolu her çalıştırmayı yazar.';
comment on column public.arvento_sync_runs.is_turu is
  'Hangi kol: konum (dakikalık lastEvents) veya filo_bakim (günlük /v1/vehicle + Maintenance).';
comment on column public.arvento_sync_runs.satir_sayisi is
  'Yazılan satır sayısı. Konum kolunda yalnız hata satırı yazıldığı için genelde null.';
comment on column public.arvento_sync_runs.cekildi_at is
  'Çalıştırmanın başladığı an. Konum tazeliği için bu tabloya DEĞİL, arac_konum_son.cekildi_at''e bakılmalı.';

create index if not exists arvento_sync_runs_durum_zaman_idx
  on public.arvento_sync_runs (durum, cekildi_at desc);   -- "son hatalar" sorgusu

alter table public.arvento_sync_runs enable row level security;

do $$ begin
  create policy "arvento_sync_runs_select_public"
    on public.arvento_sync_runs for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

grant select on public.arvento_sync_runs to anon, authenticated;
grant select, insert, update on public.arvento_sync_runs to service_role;

do $$ begin
  grant select on public.arvento_sync_runs to locus_agent_ro;
  drop policy if exists agent_ro_select on public.arvento_sync_runs;
  create policy agent_ro_select
    on public.arvento_sync_runs for select to locus_agent_ro using (true);
exception when undefined_object then null;
end $$;
