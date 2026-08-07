-- potansiyel_musteri bayrağı + harita view (musteriler_harita'ya dokunma)
-- Not: kolon sırası değişince CREATE OR REPLACE yetmez → DROP + CREATE.
-- eslesme_durumu: yeni | mevcut_musteri | manuel_kontrol | gizli
--   gizli = dashboard “Haritadan gizle”; view yalnızca yeni gösterir.

alter table public.potansiyel_musteriler
  add column if not exists potansiyel_musteri boolean
  generated always as (eslesme_durumu = 'yeni') stored;

create index if not exists potansiyel_musteriler_potansiyel_idx
  on public.potansiyel_musteriler (potansiyel_musteri);

drop view if exists public.potansiyel_musteriler_harita;

create view public.potansiyel_musteriler_harita as
select
  id,
  kaynak_id,
  isim,
  adres,
  ilce,
  il,
  lat,
  lon,
  primary_type,
  google_types,
  kalite_bayragi,
  tarandigi_tarih
from public.potansiyel_musteriler
where potansiyel_musteri = true;

grant select on public.potansiyel_musteriler_harita to anon, authenticated;
