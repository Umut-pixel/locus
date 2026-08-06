-- Ortak gizlenen potansiyeller.
-- Uygula: Supabase SQL Editor. Yazma/okuma: service role API (/api/potansiyel/gizle).

create table if not exists public.potansiyel_gizlenenler (
  id uuid primary key default gen_random_uuid(),
  potansiyel_id uuid not null
    references public.potansiyel_musteriler (id) on delete cascade,
  olusturulma timestamptz not null default now(),
  constraint potansiyel_gizlenenler_potansiyel_unique unique (potansiyel_id)
);

create index if not exists potansiyel_gizlenenler_olusturulma_idx
  on public.potansiyel_gizlenenler (olusturulma desc);

alter table public.potansiyel_gizlenenler enable row level security;

drop view if exists public.potansiyel_gizlenenler_liste;

create view public.potansiyel_gizlenenler_liste
with (security_invoker = true)
as
select
  g.id as gizle_id,
  g.olusturulma,
  p.id,
  p.kaynak_id,
  p.isim,
  p.adres,
  p.il,
  p.ilce,
  p.lat,
  p.lon,
  p.primary_type,
  p.google_types,
  p.kalite_bayragi,
  p.tarandigi_tarih
from public.potansiyel_gizlenenler g
join public.potansiyel_musteriler p on p.id = g.potansiyel_id
where p.eslesme_durumu = 'yeni';

revoke all on public.potansiyel_gizlenenler from anon, authenticated;
revoke all on public.potansiyel_gizlenenler_liste from anon, authenticated;
