-- İlçe merkezi referansı (Google Places prospecting grid)
-- RLS bilinçli olarak kapalı bırakıldı — pipeline sonrası toplu ele alınacak.

create table if not exists public.ilce_merkezleri (
  id uuid primary key default gen_random_uuid(),
  il text not null,
  ilce text not null,
  lat numeric,
  lon numeric,
  nominatim_display_name text,
  "yoğun_bolge" boolean not null default false,
  dogrulandi boolean not null default false,
  unique (il, ilce)
);

create index if not exists ilce_merkezleri_il_ilce_idx
  on public.ilce_merkezleri (ilce, il);

alter table public.ilce_merkezleri
  add column if not exists son_tarama timestamptz;
