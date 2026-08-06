-- Ortak "sonra bak" — mevcut müşteriler için favori.
-- Yazma/okuma: service role API (/api/musteri/favori).

create table if not exists public.musteri_favoriler (
  id uuid primary key default gen_random_uuid(),
  musteri_kodu text not null
    references public.musteriler (musteri_kodu) on delete cascade,
  not_metni text,
  olusturulma timestamptz not null default now(),
  constraint musteri_favoriler_musteri_unique unique (musteri_kodu)
);

create index if not exists musteri_favoriler_olusturulma_idx
  on public.musteri_favoriler (olusturulma desc);

alter table public.musteri_favoriler enable row level security;

drop view if exists public.musteri_favoriler_liste;

create view public.musteri_favoriler_liste
with (security_invoker = true)
as
select
  f.id as favori_id,
  f.not_metni,
  f.olusturulma,
  m.musteri_kodu,
  m.unvan,
  m.adres,
  m.sehir,
  m.ilce,
  m.lat,
  m.lon,
  m.risk_durumu
from public.musteri_favoriler f
join public.musteriler_harita m on m.musteri_kodu = f.musteri_kodu
where m.lat is not null and m.lon is not null;

revoke all on public.musteri_favoriler from anon, authenticated;
revoke all on public.musteri_favoriler_liste from anon, authenticated;
