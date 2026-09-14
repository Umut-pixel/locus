-- =============================================================================
-- arac_konum_son / arac_konum_gecmis — Arvento canlı konum ve iz
-- =============================================================================
--
-- Kaynak: Arvento Service API
--   POST https://ws.arvento.com/api/v1/vehicle/lastEvents   body {"Nodes": []}
-- n8n workflow: backend/n8n/Arvento Arac Takibi.json
--   mesai  */1 7-19 * * 1-6   (dakikada bir)
--   dışı   */15 0-6,20-23 * * *
--
-- ⚠ NEDEN GEÇMİŞİ BİZ TUTUYORUZ: Arvento'nun geçmiş iz uçlarının ÜÇÜ DE
-- hesabımızda kapalı (2026-09-14 canlı test, hepsi "Bu servisi kullanmaya
-- yetkiniz yoktur"):
--   POST /v1/vehicle/events            — ham paket geçmişi
--   POST /v1/report/general            — locationInfo/ignitionInfo detay raporu
--   POST /v1/report/vehicleOperating   — günlük km / rölanti / duraklama
-- Yani arac_konum_gecmis bir konfor değil, "planlanan vs gerçekleşen rota"
-- özelliğinin TEK dayanağı. Polling durursa o zaman dilimi KALICI OLARAK
-- kayıptır — Arvento'ya geriye dönüp soramayız. Mesai içi sıklığın 1 dakika
-- olmasının sebebi bu (cihaz zaten ~1 dk'da bir gönderiyor; 32 ardışık istekte
-- rate limit görülmedi, yanıt header'larında X-RateLimit-* yok).
--
-- UNIQUE (node, olcum_zamani) TASARIMIN KİLİT TAŞI: dakikada bir çekiyoruz,
-- cihaz da ~1 dk'da bir gönderiyor — aynı ölçüm iki kez gelebilir. n8n
-- "Prefer: resolution=ignore-duplicates" ile yazdığı için tekrar sessizce
-- atılır. Bu constraint olmadan geçmiş tablosu gereksiz şişer.
--
-- FK YOK, BİLEREK: konum kolu dakikada bir, filo kolu günde bir çalışıyor.
-- arac_konum_son.node -> arvento_araclar(node) FK'sı olsaydı, import'tan sonra
-- filo senkronu bir kez çalışmadan HİÇBİR konum yazılamazdı — dakikalık bir işi
-- günlük bir işe bağlamak operasyonel kırılganlık. Tanınmayan node yazılabilir;
-- v_arac_konum_son inner join olduğu için arayüzde görünmez, filo senkronu
-- çalıştığında kendiliğinden ortaya çıkar.
--
-- PLAKA BURADA YOK, BİLEREK: lastEvents yalnız Node döndürüyor (plaka veren
-- lastEventsIgnition/V2 uçları kapalı). Plaka türetilmiş veridir ve view'da
-- yaşar — CLAUDE.md'deki "risk hesabı view'da, uygulama kodunda tekrarlanmaz"
-- ilkesinin aynısı. Frontend YALNIZ v_arac_konum_son okur.
--
-- KONTAK KOLONU YOK: Ignition alanını yalnız lastEventsIgnition veriyor, o uç
-- kapalı. Hareket hız üzerinden (hiz_kmh > 0), "araç bildirim yapıyor mu"
-- tazelik üzerinden (bayat) türetiliyor.
--
-- 2026-09-14 doğrulanan birimler (canlı veriden):
--   Speed     km/h            (otoyolda 85 ölçüldü)
--   Odometer  km, ondalıklı   (23315.5 — ARAÇ km'si, cihaz km'si değil)
--   Course    0-360 derece    (245 = güneybatı, otoyol yönüyle tutarlı)
--   Altitude  metre
--   Lat/Lon   ondalık derece, WGS84
--   Date      "20260914095947" = TÜRKİYE YEREL SAATİ (UTC+3), UTC DEĞİL.
--             HTTP date header 06:59:47 GMT iken API 09:59:47 döndü.
--             n8n bu string'i +03:00 offset'iyle parse eder, orijinali
--             ham_tarih'te saklar.
--
-- Koordinat filtresi: lat/lon 0 veya null olan satır YAZILMAZ (check constraint
-- + n8n normalize katmanı). Geçersiz node gönderildiğinde API hata vermiyor,
-- satırı sessizce listeden düşürüyor — sahte 0,0 koordinatı üretmiyor ama
-- garanti altına alınıyor.
--
-- Hacim: 8 araç x ~1 dk x 13 saat mesai ~= 6.600 satır/gün -> 90 günde ~600 bin.
-- pg_cron günlük purge en altta.
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- =============================================================================

-- ── Son konum: araç başına tek satır, n8n upsert eder ────────────────────────
create table if not exists public.arac_konum_son (
    node          text primary key,
    olcum_zamani  timestamptz not null,
    ham_tarih     text,
    lat           numeric(9,6) not null,
    lon           numeric(9,6) not null,
    hiz_kmh       numeric(6,2),
    yon_derece    numeric(5,2),
    rakim_m       numeric(7,1),
    odometre_km   numeric(12,3),
    adres         text,
    bolge         text,
    cekildi_at    timestamptz not null default now(),
    constraint arac_konum_son_lat_check check (lat between -90 and 90 and lat <> 0),
    constraint arac_konum_son_lon_check check (lon between -180 and 180 and lon <> 0),
    constraint arac_konum_son_yon_check check (yon_derece is null or yon_derece between 0 and 360),
    constraint arac_konum_son_hiz_check check (hiz_kmh is null or hiz_kmh >= 0)
);

comment on table public.arac_konum_son is
  'Araç başına son bilinen konum — bkz. sql/arvento_konum_sema.sql başlığı. Supabase Realtime bu tabloyu yayınlar. Frontend doğrudan bunu değil v_arac_konum_son view''ını okur.';
comment on column public.arac_konum_son.node is
  'Arvento cihaz id''si. arvento_araclar''a FK YOK (bilerek): dakikalık konum kolu günlük filo koluna bağımlı olmasın. Henüz tanınmayan node yazılabilir, v_arac_konum_son inner join olduğu için arayüzde filo senkronuna kadar görünmez.';
comment on column public.arac_konum_son.olcum_zamani is
  'Cihazın konumu ÜRETTİĞİ an (API Date alanı, TR yerel saatinden +03:00 ile parse edildi). cekildi_at ile karıştırılmamalı.';
comment on column public.arac_konum_son.ham_tarih is
  'API''nin döndürdüğü orijinal "yyyyMMddHHmmss" string''i. Saat dilimi varsayımı yanlış çıkarsa buradan yeniden hesaplanır.';
comment on column public.arac_konum_son.cekildi_at is
  'n8n''in bu satırı yazdığı an. Veri tazeliği/izleme bundan okunur — sync_runs tablosuna her çalıştırmada satır yazılmıyor.';
comment on column public.arac_konum_son.odometre_km is
  'ARAÇ kilometresi (cihaz km''si değil), ondalıklı. 2026-09-14 canlı veriden doğrulandı.';
comment on column public.arac_konum_son.bolge is
  'API''nin Region alanı. 2026-09-14 testinde 8 aracın hepsinde boş string geldi — coğrafi bölge tanımı yapılmamış.';
comment on column public.arac_konum_son.adres is
  'API''nin ters-geocode ettiği adres. Zaten Türkçe geliyor; ln header''ı adres dilini DEĞİŞTİRMİYOR (2026-09-14 testi).';

-- ── Geçmiş iz: append-only ───────────────────────────────────────────────────
-- FK BİLEREK YOK: araç Arvento'dan silinse bile geçmiş izi durmalı.
create table if not exists public.arac_konum_gecmis (
    id            bigint generated always as identity primary key,
    node          text not null,
    olcum_zamani  timestamptz not null,
    lat           numeric(9,6) not null,
    lon           numeric(9,6) not null,
    hiz_kmh       numeric(6,2),
    yon_derece    numeric(5,2),
    odometre_km   numeric(12,3),
    constraint arac_konum_gecmis_node_zaman_key unique (node, olcum_zamani),
    constraint arac_konum_gecmis_lat_check check (lat between -90 and 90 and lat <> 0),
    constraint arac_konum_gecmis_lon_check check (lon between -180 and 180 and lon <> 0)
);

comment on table public.arac_konum_gecmis is
  'Araç iz geçmişi, append-only. Arvento''nun geçmiş uçları kapalı olduğu için bu tablo izin TEK kaynağı — bkz. sql/arvento_konum_sema.sql başlığı. 90 günde bir pg_cron ile temizlenir.';
comment on constraint arac_konum_gecmis_node_zaman_key on public.arac_konum_gecmis is
  'Tekrar eden ölçümleri yutar. n8n Prefer: resolution=ignore-duplicates ile yazar — bu constraint olmadan tablo gereksiz şişer.';

create index if not exists arac_konum_gecmis_node_zaman_idx
  on public.arac_konum_gecmis (node, olcum_zamani desc);   -- "şu aracın dünkü izi" sorgusu

-- ── View: konum + plaka + rota aracı + türetilmiş durum ──────────────────────
drop view if exists public.v_arac_konum_son;

create view public.v_arac_konum_son
with (security_invoker = true) as
select
    k.node,
    av.plaka,
    av.plaka_ham,
    av.surucu,
    av.arac_sinifi,
    av.arac_kod,
    a.ad                              as arac_adi,
    k.olcum_zamani,
    k.lat,
    k.lon,
    k.hiz_kmh,
    k.yon_derece,
    k.rakim_m,
    k.odometre_km,
    k.adres,
    k.bolge,
    k.cekildi_at,
    coalesce(k.hiz_kmh, 0) > 0        as hareket,
    k.olcum_zamani < now() - interval '10 minutes' as bayat,
    (extract(epoch from (now() - k.olcum_zamani)))::integer as yas_saniye
from public.arac_konum_son k
join public.arvento_araclar av on av.node = k.node
left join public.araclar a     on a.kod   = av.arac_kod;

comment on view public.v_arac_konum_son is
  'Canlı araç konumu — frontend YALNIZ bunu okur. hareket/bayat türetilmiş kolonlardır, uygulama kodunda tekrar hesaplanmaz (CLAUDE.md risk view''ı ilkesi). bayat eşiği 10 dk: mesai içi polling 1 dk, cihaz ~1 dk''da bir gönderiyor.';

grant select on public.v_arac_konum_son to anon, authenticated;

-- ── RLS + grant ──────────────────────────────────────────────────────────────
alter table public.arac_konum_son    enable row level security;
alter table public.arac_konum_gecmis enable row level security;

do $$ begin
  create policy "arac_konum_son_select_public"
    on public.arac_konum_son for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "arac_konum_gecmis_select_public"
    on public.arac_konum_gecmis for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

-- Yazma yalnız service_role'e (n8n) — iz geçmişi elle değiştirilmesin.
grant select on public.arac_konum_son    to anon, authenticated;
grant select on public.arac_konum_gecmis to anon, authenticated;
grant select, insert, update, delete on public.arac_konum_son    to service_role;
grant select, insert, delete         on public.arac_konum_gecmis to service_role;

do $$ begin
  grant select on public.arac_konum_son    to locus_agent_ro;
  grant select on public.arac_konum_gecmis to locus_agent_ro;
  grant select on public.v_arac_konum_son  to locus_agent_ro;

  drop policy if exists agent_ro_select on public.arac_konum_son;
  create policy agent_ro_select
    on public.arac_konum_son for select to locus_agent_ro using (true);

  drop policy if exists agent_ro_select on public.arac_konum_gecmis;
  create policy agent_ro_select
    on public.arac_konum_gecmis for select to locus_agent_ro using (true);
exception when undefined_object then null;
end $$;

-- ── Supabase Realtime ────────────────────────────────────────────────────────
-- supabase_realtime publication var ama bugüne kadar HİÇBİR tablo ekli değildi.
-- Canlı harita katmanı bu satır olmadan güncelleme almaz.
do $$ begin
  alter publication supabase_realtime add table public.arac_konum_son;
exception when duplicate_object then null;
end $$;

-- ── 90 günlük iz temizliği (pg_cron) ─────────────────────────────────────────
create or replace function public.purge_arac_konum_gecmis(
  p_retention interval default interval '90 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  delete from public.arac_konum_gecmis
   where olcum_zamani < now() - p_retention;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.purge_arac_konum_gecmis(interval)
  from public, anon, authenticated;

comment on function public.purge_arac_konum_gecmis(interval) is
  'Saklama penceresinden eski araç iz satırlarını siler. Varsayılan 90 gün ~= 600 bin satır.';

-- Idempotent zamanlama — bkz. sql/panorama_sync_stale_sweep.sql aynı desen.
select cron.unschedule('arac_konum_gecmis_purge')
where exists (select 1 from cron.job where jobname = 'arac_konum_gecmis_purge');

select cron.schedule(
  'arac_konum_gecmis_purge',
  '40 2 * * *',
  $$select public.purge_arac_konum_gecmis();$$
);
