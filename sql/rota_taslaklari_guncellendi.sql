-- =============================================================================
-- rota_taslaklari.guncellendi — şema kaymasını gider
-- =============================================================================
--
-- Bu kolon prod'da zaten var (muhtemelen elle `alter table` ile eklenmiş) ve
-- app/api/rota/taslak/route.ts hem okuyor hem yazıyor (.order("guncellendi"),
-- update({ ..., guncellendi })) ama rota_taslaklari.sql'deki `create table`
-- DDL'inde hiç tanımlı değildi. Bu migration, izlenmeyen değişikliği repoya
-- geri yazar — additive/idempotent, prod'da hiçbir şeyi değiştirmez.
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- =============================================================================

alter table public.rota_taslaklari
  add column if not exists guncellendi timestamptz not null default now();

create index if not exists rota_taslaklari_guncellendi_idx
  on public.rota_taslaklari (guncellendi desc);

comment on column public.rota_taslaklari.guncellendi is
  'Son yazım anı — harita-canli taslağın "anlık mı" sorusuna cevap için (bkz. RotaHaritaAiBubble bağlamı).';
