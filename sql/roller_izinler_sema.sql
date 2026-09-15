-- Çok-kullanıcı + rol/izin sistemi — temel şema.
-- Additive: mevcut hiçbir tabloya dokunmaz. Faz 1 (bkz. plan).
--
-- kullanicilar.id = auth.users.id (Supabase Auth ile 1:1). RLS bilinçli
-- olarak anon/authenticated için politikasız bırakıldı — mevcut "kilitli
-- tablo" deseniyle aynı (bildirim_ayarlari, entity_notlar vb.). Erişim
-- yalnız service-role API route'ları + has_izin()/get_my_izin_kodlari()
-- (security definer) üzerinden.

create table if not exists public.roller (
  id smallserial primary key,
  kod text not null unique,
  ad text not null,
  aciklama text,
  olusturuldu timestamptz not null default now()
);

create table if not exists public.izinler (
  id smallserial primary key,
  kod text not null unique,
  ad text not null,
  aciklama text,
  olusturuldu timestamptz not null default now()
);

create table if not exists public.rol_izinleri (
  rol_id smallint not null references public.roller(id) on delete cascade,
  izin_id smallint not null references public.izinler(id) on delete cascade,
  primary key (rol_id, izin_id)
);

create table if not exists public.kullanicilar (
  id uuid primary key references auth.users(id) on delete cascade,
  ad_soyad text not null,
  kullanici_adi text not null unique,
  rol_id smallint not null references public.roller(id),
  aktif boolean not null default true,
  olusturuldu timestamptz not null default now(),
  olusturan uuid references auth.users(id)
);

alter table public.roller enable row level security;
alter table public.izinler enable row level security;
alter table public.rol_izinleri enable row level security;
alter table public.kullanicilar enable row level security;

create or replace function public.has_izin(p_izin_kodu text)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from public.kullanicilar k
    join public.rol_izinleri ri on ri.rol_id = k.rol_id
    join public.izinler i on i.id = ri.izin_id
    where k.id = auth.uid() and k.aktif = true and i.kod = p_izin_kodu
  );
$$;
-- Postgres yeni fonksiyonlarda varsayılan olarak PUBLIC'e (dolayısıyla anon'a
-- da) EXECUTE verir — sadece "to authenticated" grant etmek bunu geri almaz,
-- üstüne ekler. anon'un ihtiyacı yok (Supabase advisor'ın da işaretlediği gibi).
revoke execute on function public.has_izin(text) from public;
grant execute on function public.has_izin(text) to authenticated;

create or replace function public.get_my_izin_kodlari()
returns text[]
language sql security definer stable
set search_path = public
as $$
  select coalesce(array_agg(i.kod), '{}')
  from public.kullanicilar k
  join public.rol_izinleri ri on ri.rol_id = k.rol_id
  join public.izinler i on i.id = ri.izin_id
  where k.id = auth.uid() and k.aktif = true;
$$;
revoke execute on function public.get_my_izin_kodlari() from public;
grant execute on function public.get_my_izin_kodlari() to authenticated;

insert into public.roller (kod, ad) values
  ('admin', 'Yönetici'),
  ('satis_temsilcisi', 'Satış Temsilcisi')
on conflict (kod) do nothing;

insert into public.izinler (kod, ad) values
  ('harita', 'Harita'),
  ('stok_raporlari', 'Stok Raporları'),
  ('finansal_raporlar', 'Finansal Raporlar'),
  ('tahsilat_raporlari', 'Tahsilat Raporları'),
  ('sevkiyat_raporlari', 'Sevkiyat Raporları'),
  ('musteri_raporlama', 'Müşteri Raporlama'),
  ('rota_planlama', 'Rota Planlama'),
  ('ai_sohbet', 'AI Sohbet'),
  ('ayarlar', 'Ayarlar'),
  ('kullanici_yonetimi', 'Kullanıcı Yönetimi'),
  ('musteri_finansal_detay', 'Müşteri Finansal Detay')
on conflict (kod) do nothing;

-- admin -> tüm izinler
insert into public.rol_izinleri (rol_id, izin_id)
select r.id, i.id
from public.roller r
cross join public.izinler i
where r.kod = 'admin'
on conflict do nothing;

-- satis_temsilcisi -> yalnız harita + stok_raporlari
insert into public.rol_izinleri (rol_id, izin_id)
select r.id, i.id
from public.roller r
join public.izinler i on i.kod in ('harita', 'stok_raporlari')
where r.kod = 'satis_temsilcisi'
on conflict do nothing;
