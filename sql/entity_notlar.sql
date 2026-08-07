-- Genel notlar: müşteri + potansiyel (append-only geçmiş)
-- Yazma: service_role API only (RLS + revoke)

create table if not exists public.entity_notlar (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null check (entity_kind in ('musteri', 'potansiyel')),
  musteri_kodu text references public.musteriler (musteri_kodu) on delete cascade,
  potansiyel_id uuid references public.potansiyel_musteriler (id) on delete cascade,
  metin text not null check (char_length(btrim(metin)) > 0 and char_length(metin) <= 2000),
  olusturulma timestamptz not null default now(),
  guncelleme timestamptz not null default now(),
  constraint entity_notlar_target_chk check (
    (entity_kind = 'musteri' and musteri_kodu is not null and potansiyel_id is null)
    or (entity_kind = 'potansiyel' and potansiyel_id is not null and musteri_kodu is null)
  )
);

create index if not exists entity_notlar_musteri_idx
  on public.entity_notlar (musteri_kodu, olusturulma desc)
  where musteri_kodu is not null;

create index if not exists entity_notlar_potansiyel_idx
  on public.entity_notlar (potansiyel_id, olusturulma desc)
  where potansiyel_id is not null;

alter table public.entity_notlar enable row level security;

revoke all on table public.entity_notlar from public, anon, authenticated;
grant all on table public.entity_notlar to service_role;

comment on table public.entity_notlar is
  'Müşteri / potansiyel serbest metin notları. App session + service_role API.';
