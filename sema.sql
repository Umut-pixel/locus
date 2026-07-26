-- petshop MVP: temizlenmis musteri veri seti
create table if not exists public.musteriler (
    musteri_kodu              text primary key,
    unvan                     text not null,
    adres                     text,
    sehir                     text,
    ilce                      text,
    lat                       double precision,
    lon                       double precision,
    rut_kod                   text,
    rut_aciklama              text,
    ziyaret_sira              integer,
    son_teslimat_tarihi       date,
    ilk_teslimat_tarihi       date,
    toplam_teslimat_sayisi    integer not null default 0,
    toplam_agirlik            numeric(14,2) not null default 0,   -- kg
    toplam_tutar              numeric(16,2) not null default 0,   -- TL
    son_teslimattan_gecen_gun integer,
    durum                     text,
    musteri_grubu             text,
    bolge_grubu               text,
    geocode_kaynak            text,
    geocode_hassasiyet        text,
    satis_temsilcileri        text,
    telefon                   text,
    posta_kodu                text,
    guncellendi               timestamptz not null default now()
);

create index if not exists musteriler_sehir_idx        on public.musteriler (sehir);
create index if not exists musteriler_rut_idx          on public.musteriler (rut_kod, ziyaret_sira);
create index if not exists musteriler_son_teslimat_idx on public.musteriler (son_teslimat_tarihi desc);
create index if not exists musteriler_konum_idx        on public.musteriler (lat, lon)
    where lat is not null;

-- Haritada sadece konumu olan aktif musteriler
create or replace view public.musteriler_harita
with (security_invoker = true) as
select musteri_kodu, unvan, sehir, ilce, lat, lon, rut_kod, rut_aciklama,
       ziyaret_sira, son_teslimat_tarihi, toplam_teslimat_sayisi,
       toplam_agirlik, toplam_tutar, son_teslimattan_gecen_gun,
       durum, geocode_hassasiyet,
       case
         when toplam_teslimat_sayisi = 0            then 'hic_teslimat_yok'
         when son_teslimattan_gecen_gun > 90        then 'riskli'
         when son_teslimattan_gecen_gun > 45        then 'izlenmeli'
         else 'saglikli'
       end as risk_durumu
from public.musteriler
where lat is not null and lon is not null;

alter table public.musteriler enable row level security;

do $$ begin
  create policy "musteriler_select_public"
    on public.musteriler
    for select
    to anon, authenticated
    using (true);
exception when duplicate_object then null;
end $$;

-- Satır her UPDATE'te guncellendi otomatik artsın
create or replace function public.set_guncellendi()
returns trigger
language plpgsql
as $$
begin
  new.guncellendi := now();
  return new;
end;
$$;

drop trigger if exists musteriler_set_guncellendi on public.musteriler;
create trigger musteriler_set_guncellendi
  before update on public.musteriler
  for each row
  execute function public.set_guncellendi();

-- Dosya yükleme geçmişi (timestamp + özet)
create table if not exists public.yukleme_loglari (
    id                    uuid primary key default gen_random_uuid(),
    dosya_adi             text not null,
    dosya_tipi            text not null,
    dosya_boyutu_byte     bigint,
    yuklenme_zamani       timestamptz not null default now(),
    islenen_satir         integer not null default 0,
    yeni_musteri          integer not null default 0,
    guncellenen_musteri   integer not null default 0,
    geocode_basarisiz     integer not null default 0,
    eslesmeyen_kod_sayisi integer not null default 0,
    uyarilar              jsonb,
    durum                 text not null default 'ok'
);

create index if not exists yukleme_loglari_zaman_idx
  on public.yukleme_loglari (yuklenme_zamani desc);

alter table public.yukleme_loglari enable row level security;

do $$ begin
  create policy "yukleme_loglari_select_public"
    on public.yukleme_loglari
    for select
    to anon, authenticated
    using (true);
exception when duplicate_object then null;
end $$;
