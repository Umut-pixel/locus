-- Ortak gizlenen müşteriler (favori ile aynı erişim modeli).
-- Uygula: Supabase SQL Editor. Yazma/okuma: service role API (/api/musteri/gizle).

create table if not exists public.musteri_gizlenenler (
  id uuid primary key default gen_random_uuid(),
  musteri_kodu text not null
    references public.musteriler (musteri_kodu) on delete cascade,
  olusturulma timestamptz not null default now(),
  constraint musteri_gizlenenler_musteri_unique unique (musteri_kodu)
);

create index if not exists musteri_gizlenenler_olusturulma_idx
  on public.musteri_gizlenenler (olusturulma desc);

alter table public.musteri_gizlenenler enable row level security;

drop view if exists public.musteri_gizlenenler_liste;

create view public.musteri_gizlenenler_liste
with (security_invoker = true)
as
select
  g.id as gizle_id,
  g.olusturulma,
  m.musteri_kodu,
  m.unvan,
  m.adres,
  m.sehir,
  m.ilce,
  m.lat,
  m.lon,
  m.risk_durumu
from public.musteri_gizlenenler g
join public.musteriler_harita m on m.musteri_kodu = g.musteri_kodu
where m.lat is not null and m.lon is not null;

revoke all on public.musteri_gizlenenler from anon, authenticated;
revoke all on public.musteri_gizlenenler_liste from anon, authenticated;
