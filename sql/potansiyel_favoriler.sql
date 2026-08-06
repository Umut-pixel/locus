-- Ortak "sonra bak" listesi — potansiyel müşteriler için favori.
-- Yazma/okuma: service role API (/api/potansiyel/favori). Anon grant yok.

create table if not exists public.potansiyel_favoriler (
  id uuid primary key default gen_random_uuid(),
  potansiyel_id uuid not null
    references public.potansiyel_musteriler (id) on delete cascade,
  not_metni text,
  olusturulma timestamptz not null default now(),
  constraint potansiyel_favoriler_potansiyel_unique unique (potansiyel_id)
);

create index if not exists potansiyel_favoriler_olusturulma_idx
  on public.potansiyel_favoriler (olusturulma desc);

alter table public.potansiyel_favoriler enable row level security;

-- Liste: yalnızca hâlâ "yeni" (haritada görünen) potansiyeller.
drop view if exists public.potansiyel_favoriler_liste;

create view public.potansiyel_favoriler_liste
with (security_invoker = true)
as
select
  f.id as favori_id,
  f.not_metni,
  f.olusturulma,
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
from public.potansiyel_favoriler f
join public.potansiyel_musteriler p on p.id = f.potansiyel_id
where p.eslesme_durumu = 'yeni';

revoke all on public.potansiyel_favoriler from anon, authenticated;
revoke all on public.potansiyel_favoriler_liste from anon, authenticated;
