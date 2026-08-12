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

-- ST yaşlandırma (borç gecikme) — her yüklemede tam snapshot
create table if not exists public.musteri_yaslandirma (
    musteri_kodu   text primary key references public.musteriler (musteri_kodu) on delete cascade,
    st             text,
    hf_01_06       numeric(16,2) not null default 0,
    hf_07_13       numeric(16,2) not null default 0,
    hf_14_20       numeric(16,2) not null default 0,
    hf_21_27       numeric(16,2) not null default 0,
    hf_28_34       numeric(16,2) not null default 0,
    hf_35_41       numeric(16,2) not null default 0,
    hf_42_48       numeric(16,2) not null default 0,
    hf_49_55       numeric(16,2) not null default 0,
    hf_56_62       numeric(16,2) not null default 0,
    hf_63_69       numeric(16,2) not null default 0,
    hf_70_ustu     numeric(16,2) not null default 0,
    toplam         numeric(16,2) not null default 0,
    riskli_tutar   numeric(16,2) not null default 0,
    borc_riskli    boolean not null default false,
    guncellendi    timestamptz not null default now(),
    inserted_at    timestamptz not null default now()
);

create index if not exists musteri_yaslandirma_risk_idx
  on public.musteri_yaslandirma (borc_riskli)
  where borc_riskli = true;

alter table public.musteri_yaslandirma enable row level security;

do $$ begin
  create policy "musteri_yaslandirma_select_public"
    on public.musteri_yaslandirma
    for select
    to anon, authenticated
    using (true);
exception when duplicate_object then null;
end $$;

-- BelgeDetayRaporu — müşteri bazlı ticari dönem özeti (her yüklemede tam snapshot)
create table if not exists public.musteri_belge_ozet (
    musteri_kodu      text primary key references public.musteriler (musteri_kodu) on delete cascade,
    donem_bas         date,
    donem_bit         date,
    satir_sayisi      integer not null default 0,
    siparis_sayisi    integer not null default 0,
    fatura_sayisi     integer not null default 0,
    net_ciro          numeric(16,2) not null default 0,
    brut_ciro         numeric(16,2) not null default 0,
    iskonto_toplam    numeric(16,2) not null default 0,
    promo_satir       integer not null default 0,
    iptal_satir       integer not null default 0,
    son_islem_tarihi  date,
    vade_gunu         integer,
    top_urun_grup     text,
    son_urun_grup     text,
    top_urun          text,
    son_urun          text,
    st_adi            text,
    st_kodu           text,
    guncellendi       timestamptz not null default now()
);

alter table public.musteri_belge_ozet enable row level security;

do $$ begin
  create policy "musteri_belge_ozet_select_public"
    on public.musteri_belge_ozet
    for select
    to anon, authenticated
    using (true);
exception when duplicate_object then null;
end $$;

-- Haritada sadece konumu olan aktif musteriler
-- Not: kolon eklerken CREATE OR REPLACE yetmez; drop + create gerekir.
drop view if exists public.musteriler_harita;
create view public.musteriler_harita
with (security_invoker = true) as
select m.musteri_kodu, m.unvan, m.adres, m.sehir, m.ilce, m.lat, m.lon, m.rut_kod, m.rut_aciklama,
       m.ziyaret_sira, m.son_teslimat_tarihi, m.ilk_teslimat_tarihi, m.toplam_teslimat_sayisi,
       m.toplam_agirlik, m.toplam_tutar,
       -- Takvime gore yasananan gun sayisi. m.son_teslimattan_gecen_gun ETL
       -- sirasinda "dosyadaki EN YENI sevkiyat" referansiyla yaziliyor
       -- (bkz. lib/import/parse-sevkiyat.ts) — yani sync durursa donuyor ve
       -- kimse riskli banda gecmiyor (2026-08-06 olayi, tech-debt.md).
       -- Burada current_date'ten turetince gorunum kendi kendini duzeltiyor.
       case
         when m.son_teslimat_tarihi is null then m.son_teslimattan_gecen_gun
         else (current_date - m.son_teslimat_tarihi)
       end as son_teslimattan_gecen_gun,
       m.durum, m.musteri_grubu, m.geocode_hassasiyet, m.guncellendi,
       case
         when m.toplam_teslimat_sayisi = 0                        then 'hic_teslimat_yok'
         when m.son_teslimat_tarihi is null                       then 'hic_teslimat_yok'
         when (current_date - m.son_teslimat_tarihi) > 90         then 'riskli'
         when (current_date - m.son_teslimat_tarihi) > 45         then 'izlenmeli'
         else 'saglikli'
       end as risk_durumu,
       y.st as yas_st,
       y.hf_01_06, y.hf_07_13, y.hf_14_20, y.hf_21_27, y.hf_28_34,
       y.hf_35_41, y.hf_42_48, y.hf_49_55, y.hf_56_62, y.hf_63_69, y.hf_70_ustu,
       y.toplam as yas_toplam,
       y.riskli_tutar as yas_riskli_tutar,
       y.borc_riskli,
       y.inserted_at as yas_inserted_at,
       b.donem_bas as belge_donem_bas,
       b.donem_bit as belge_donem_bit,
       b.satir_sayisi as belge_satir_sayisi,
       b.siparis_sayisi as belge_siparis_sayisi,
       b.fatura_sayisi as belge_fatura_sayisi,
       b.net_ciro as belge_net_ciro,
       b.brut_ciro as belge_brut_ciro,
       b.iskonto_toplam as belge_iskonto_toplam,
       b.promo_satir as belge_promo_satir,
       b.iptal_satir as belge_iptal_satir,
       b.son_islem_tarihi as belge_son_islem_tarihi,
       b.vade_gunu as belge_vade_gunu,
       b.top_urun_grup as belge_top_urun_grup,
       b.son_urun_grup as belge_son_urun_grup,
       b.top_urun as belge_top_urun,
       b.son_urun as belge_son_urun,
       b.st_adi as belge_st_adi,
       b.st_kodu as belge_st_kodu
from public.musteriler m
left join public.musteri_yaslandirma y on y.musteri_kodu = m.musteri_kodu
left join public.musteri_belge_ozet b on b.musteri_kodu = m.musteri_kodu
where m.lat is not null and m.lon is not null;

grant select on public.musteriler_harita to anon, authenticated;

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
set search_path = public
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
    durum                 text not null default 'ok',
    karsilastirma         jsonb
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

-- Sevkiyat yüklemesi sonrası müşteri sağlık anlık görüntüsü (önceki + yeni)
create table if not exists public.musteri_snapshotlari (
    id                              uuid primary key default gen_random_uuid(),
    yukleme_id                      uuid references public.yukleme_loglari (id) on delete set null,
    musteri_kodu                    text not null references public.musteriler (musteri_kodu) on delete cascade,
    risk_durumu                     text not null,
    toplam_teslimat_sayisi          integer not null default 0,
    toplam_tutar                    numeric(16,2) not null default 0,
    toplam_agirlik                  numeric(14,2) not null default 0,
    son_teslimattan_gecen_gun       integer,
    son_teslimat_tarihi             date,
    onceki_risk_durumu              text,
    onceki_toplam_teslimat_sayisi   integer,
    onceki_toplam_tutar             numeric(16,2),
    onceki_toplam_agirlik           numeric(14,2),
    onceki_son_teslimattan_gecen_gun integer,
    onceki_son_teslimat_tarihi      date,
    olusturuldu                     timestamptz not null default now()
);

create index if not exists musteri_snapshotlari_kod_zaman_idx
  on public.musteri_snapshotlari (musteri_kodu, olusturuldu desc);

create index if not exists musteri_snapshotlari_yukleme_idx
  on public.musteri_snapshotlari (yukleme_id);

alter table public.musteri_snapshotlari enable row level security;

do $$ begin
  create policy "musteri_snapshotlari_select_public"
    on public.musteri_snapshotlari
    for select
    to anon, authenticated
    using (true);
exception when duplicate_object then null;
end $$;
