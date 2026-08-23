-- =============================================================================
-- agent_konusmalar / agent_konusma_mesajlari
-- =============================================================================
-- Asistan sohbetlerinin tam metni. UI buradan okur; agent konusma_gecmisi
-- aracı ve (isteğe bağlı) sql_query ile salt okur.
-- Yazma yalnız Next.js service_role API. Anon/authenticated Data API kapalı.
-- =============================================================================

create table if not exists public.agent_konusmalar (
  id uuid primary key default gen_random_uuid(),
  baslik text not null default 'Yeni konuşma',
  ozet text,
  mesaj_sayisi integer not null default 0,
  olusturulma timestamptz not null default now(),
  guncelleme timestamptz not null default now(),
  constraint agent_konusmalar_baslik_len check (char_length(baslik) between 1 and 120),
  constraint agent_konusmalar_ozet_len check (ozet is null or char_length(ozet) <= 2000)
);

create table if not exists public.agent_konusma_mesajlari (
  id uuid primary key default gen_random_uuid(),
  konusma_id uuid not null references public.agent_konusmalar(id) on delete cascade,
  sira integer not null,
  rol text not null,
  metin text not null,
  alinti text,
  olusturulma timestamptz not null default now(),
  constraint agent_konusma_mesajlari_rol check (rol in ('user', 'assistant', 'error')),
  constraint agent_konusma_mesajlari_sira check (sira >= 0),
  constraint agent_konusma_mesajlari_metin check (char_length(metin) between 1 and 200000),
  constraint agent_konusma_mesajlari_unique unique (konusma_id, sira)
);

create index if not exists agent_konusmalar_guncelleme_idx
  on public.agent_konusmalar (guncelleme desc);

create index if not exists agent_konusma_mesajlari_konusma_sira_idx
  on public.agent_konusma_mesajlari (konusma_id, sira);

alter table public.agent_konusmalar enable row level security;
alter table public.agent_konusma_mesajlari enable row level security;

revoke all on public.agent_konusmalar from anon, authenticated;
revoke all on public.agent_konusma_mesajlari from anon, authenticated;

grant select on public.agent_konusmalar to locus_agent_ro;
grant select on public.agent_konusma_mesajlari to locus_agent_ro;

drop policy if exists agent_ro_select on public.agent_konusmalar;
create policy agent_ro_select on public.agent_konusmalar
  for select to locus_agent_ro using (true);

drop policy if exists agent_ro_select on public.agent_konusma_mesajlari;
create policy agent_ro_select on public.agent_konusma_mesajlari
  for select to locus_agent_ro using (true);
