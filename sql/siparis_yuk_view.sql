-- =============================================================================
-- Sipariş yükü — satır bazlı kg / çuval eşdeğeri, müşteri bazlı bekleyen yük
-- =============================================================================
--
-- Hacim ve ağırlık matematiği BURADA. Risk hesabında olduğu gibi, uygulama
-- kodunda tekrarlanmaz — planlayıcı `v_musteri_bekleyen_yuk`'ü okur, kendi
-- kg/çuval hesabını yapmaz.
--
-- Bağımlılık: public.urun_olcu (bkz. sql/urun_olcu_sema.sql)
-- Uygula: MCP apply_migration / SQL Editor. Idempotent (drop + create).
-- =============================================================================

drop view if exists public.v_musteri_bekleyen_yuk;
drop view if exists public.v_siparis_satir_yuk;

-- ---------------------------------------------------------------------------
-- Satır bazlı yük — 5451 snapshot × urun_olcu
-- ---------------------------------------------------------------------------
-- Metin→sayı dönüşümleri regex ile korumalı: bozuk bir hücre view'ın tamamını
-- patlatmasın, o satır NULL'a düşsün (ve olcusuz olarak sayılsın).
create view public.v_siparis_satir_yuk
with (security_invoker = true) as
select
    d.siparis_no,
    d.musteri_kod,
    d.musteri_unvan,
    d.islem_tarihi,
    d.bekleyen_siparis,
    d.belge_tip,
    d.iptal_neden,
    d.fatura_no,
    d.irsaliye_no,
    d.urun_kodu,
    d.urun,
    d.birim,
    m.miktar,
    -- birim='KL' ise miktar koli sayısıdır; adede çevrilir. Çuval ürünlerinde
    -- koli_ici_adet=1 (Panorama'nın "KL"si çuvalın kendisi).
    m.miktar * case when d.birim = 'KL' then coalesce(o.koli_ici_adet, 1) else 1 end
        as adet,
    m.miktar * case when d.birim = 'KL' then coalesce(o.koli_ici_adet, 1) else 1 end
        * o.paket_kg as kg,
    m.miktar * case when d.birim = 'KL' then coalesce(o.koli_ici_adet, 1) else 1 end
        * o.cuval_esdeger as cuval_esdeger,
    t.brut_tutar,
    o.hacim_sinifi,
    -- Ölçüsü bilinmeyen satır: yük toplamına girmez, ekranda uyarı olarak sayılır
    (o.paket_kg is null) as olcusuz
from public.v_panorama_siparis_detay_raporu_guncel d
left join public.urun_olcu o
       on o.urun_kodu = d.urun_kodu
cross join lateral (
    select case
             when d.miktar ~ '^-?[0-9]+(\.[0-9]+)?$' then d.miktar::numeric
           end as miktar
) m
cross join lateral (
    select case
             when replace(d.brut_tutar, ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$'
               then replace(d.brut_tutar, ',', '.')::numeric
           end as brut_tutar
) t;

comment on view public.v_siparis_satir_yuk is
  'Sipariş satırı × urun_olcu — adet/kg/çuval eşdeğeri. olcusuz=true satırlar yük toplamına girmez.';

-- ---------------------------------------------------------------------------
-- Müşteri bazlı bekleyen yük — planlayıcının tek kaynağı
-- ---------------------------------------------------------------------------
-- Filtre `BekleyenSiparislerPanel` ile BİREBİR aynı (hooks/useSevkiyatRaporu.ts
-- → KEEP_BELGE_TIP). Ayrışırsa iki ekran farklı rakam gösterir.
--
-- Müşteri kaynağı `musteriler_rapor` — koordinat filtresi YOK. Koordinatsız
-- müşteri sessizce düşmez, lat/lon NULL gelir ve UI "plana giremez" uyarısı
-- verir. (Koordinat filtresinin sessizce ciro düşürdüğü daha önce yaşandı.)
--
-- RUT ALANLARI YOK. Melih (2026-09-02): "şuan bu veriyi dikkate almayalım, o
-- öylesine yapılmış bir rut, düzenlenecek." Zaten ölçülmüştü: gün tutarlılığı
-- %10-36, ziyaret_sira'yı takip eden yol TSP alt sınırının 4,5-37 katı. Rut
-- satış temsilcisi portföyü, sevkiyat rotası değil. `musteriler_rapor`'daki
-- rut_kod duruyor — Sevkiyat Raporları sayfası onu kullanmaya devam ediyor.
create view public.v_musteri_bekleyen_yuk
with (security_invoker = true) as
select
    r.musteri_kodu,
    r.unvan,
    r.ilce,
    r.sehir,
    r.lat,
    r.lon,
    r.risk_durumu,
    count(distinct y.siparis_no)                    as siparis_sayisi,
    count(*)                                        as satir_sayisi,
    count(*) filter (where y.olcusuz)               as olcusuz_satir,
    round(coalesce(sum(y.kg), 0), 1)                as kg,
    round(coalesce(sum(y.cuval_esdeger), 0), 2)     as cuval_esdeger,
    round(coalesce(sum(y.brut_tutar), 0), 2)        as brut_tutar,
    min(y.islem_tarihi)                             as en_eski_siparis_tarihi
from public.v_siparis_satir_yuk y
join public.musteriler_rapor r
  on r.musteri_kodu = y.musteri_kod
where y.bekleyen_siparis = 'Bekleyen Sipariş'
  and y.belge_tip in ('Satış', 'Konsinye Satış', 'Satış - İade', 'Satış-İade')
  and y.iptal_neden is null
group by
    r.musteri_kodu, r.unvan, r.ilce, r.sehir, r.lat, r.lon, r.risk_durumu;

comment on view public.v_musteri_bekleyen_yuk is
  'Bekleyen siparişi olan müşteriler + kg/çuval yükü. Koordinatsız müşteri lat/lon NULL ile gelir, düşmez.';

grant select on public.v_siparis_satir_yuk    to anon, authenticated, service_role;
grant select on public.v_musteri_bekleyen_yuk to anon, authenticated, service_role;

do $$ begin
  grant select on public.v_siparis_satir_yuk    to locus_agent_ro;
  grant select on public.v_musteri_bekleyen_yuk to locus_agent_ro;
exception when undefined_object then null;
end $$;

-- =============================================================================
-- MUTABAKAT SORGUSU — ölçü modeli doğrulaması
-- =============================================================================
--
-- urun_olcu her değiştiğinde çalıştır. Hesaplanan kg'ı ERP'nin kendi
-- SevkiyatRaporuKup.agirlik alanına karşı ölçer (join: fatura_no = belge_kod).
--
-- Hedef: kapsama ≥ %99, medyan oran 1.000.
-- Referans (2026-09-01, kum yoğunluğu seed'e girdikten sonra):
--   1.967 belge · kapsama %100,0 · medyan 1.000 · ±%5 içinde %97,4
-- Kapsama %95'in altına düşerse yeni bir ölçüsüz SKU girmiş demektir:
--   select * from public.urun_olcu where paket_kg is null;
--
-- with hesap as (
--   select d.fatura_no as belge_kod,
--          sum(m.miktar
--              * case when d.birim = 'KL' then coalesce(o.koli_ici_adet, 1) else 1 end
--              * coalesce(o.paket_kg, 0)) as hesap_kg
--     from public.v_panorama_siparis_detay_raporu_guncel d
--     left join public.urun_olcu o on o.urun_kodu = d.urun_kodu
--     cross join lateral (
--       select case when d.miktar ~ '^-?[0-9]+(\.[0-9]+)?$'
--                   then d.miktar::numeric else 0 end as miktar
--     ) m
--    where d.fatura_no is not null
--      and d.belge_tip in ('Satış', 'Konsinye Satış')
--    group by d.fatura_no
-- ), gercek as (
--   select belge_kod, sum(nullif(agirlik, '')::numeric) / 1000.0 as gercek_kg
--     from public.v_panorama_sevkiyat_raporu_kup_guncel
--    group by belge_kod
-- )
-- select count(*)                                             as belge,
--        round(sum(h.hesap_kg))                               as hesap_kg,
--        round(sum(g.gercek_kg))                              as gercek_kg,
--        round(sum(h.hesap_kg) / nullif(sum(g.gercek_kg), 0) * 100, 1) as kapsama_yuzde,
--        round(percentile_cont(0.5) within group
--              (order by h.hesap_kg / nullif(g.gercek_kg, 0))::numeric, 3) as medyan_oran,
--        count(*) filter (where abs(h.hesap_kg / nullif(g.gercek_kg, 0) - 1) <= 0.05)
--                                                             as sapma_5_alti
--   from hesap h join gercek g using (belge_kod)
--  where g.gercek_kg > 0;

-- ---------------------------------------------------------------------------
-- Tarih penceresi parametreli hâl — planlayıcı bunu çağırır
-- ---------------------------------------------------------------------------
-- View'da tarih filtresi YOK; Panorama'nın "Bekleyen Sipariş" dediği her şey
-- gelir ve raporun kendi penceresi 9 ay (2025.12 – 2026.09 ölçüldü). Aylardır
-- bekleyen "zombi" sipariş her plana girmesin diye ekranda ayarlanabilir
-- pencere var; matematik yine burada, uygulamada tekrarlanmıyor.
--
-- TARİH TUZAĞI: `islem_tarihi` 'YYYY.MM.DD' (5451). SevkiyatRaporuKup 5130 ise
-- 'DD.MM.YYYY' kullanıyor — aynı sanıp yanlış parse etme.
create or replace function public.musteri_bekleyen_yuk(p_gun integer default null)
returns table (
    musteri_kodu           text,
    unvan                  text,
    ilce                   text,
    sehir                  text,
    lat                    double precision,
    lon                    double precision,
    risk_durumu            text,
    siparis_sayisi         bigint,
    satir_sayisi           bigint,
    olcusuz_satir          bigint,
    kg                     numeric,
    cuval_esdeger          numeric,
    brut_tutar             numeric,
    en_eski_siparis_tarihi date,
    en_yeni_siparis_tarihi date
)
language sql
stable
security invoker
set search_path = public
as $$
    select
        r.musteri_kodu, r.unvan, r.ilce, r.sehir, r.lat, r.lon, r.risk_durumu,
        count(distinct y.siparis_no)                as siparis_sayisi,
        count(*)                                    as satir_sayisi,
        count(*) filter (where y.olcusuz)           as olcusuz_satir,
        round(coalesce(sum(y.kg), 0), 1)            as kg,
        round(coalesce(sum(y.cuval_esdeger), 0), 2) as cuval_esdeger,
        round(coalesce(sum(y.brut_tutar), 0), 2)    as brut_tutar,
        min(t.tarih)                                as en_eski_siparis_tarihi,
        max(t.tarih)                                as en_yeni_siparis_tarihi
    from public.v_siparis_satir_yuk y
    join public.musteriler_rapor r
      on r.musteri_kodu = y.musteri_kod
    cross join lateral (
        select case
                 when y.islem_tarihi ~ '^\d{4}\.\d{2}\.\d{2}$'
                   then to_date(y.islem_tarihi, 'YYYY.MM.DD')
               end as tarih
    ) t
    where y.bekleyen_siparis = 'Bekleyen Sipariş'
      and y.belge_tip in ('Satış', 'Konsinye Satış', 'Satış - İade', 'Satış-İade')
      and y.iptal_neden is null
      -- Tarihi okunamayan satır pencereye takılmaz, hep içeride kalır:
      -- sessizce yük düşürmektense fazladan göstermek yeğ.
      and (p_gun is null or t.tarih is null or t.tarih >= current_date - p_gun)
    group by
        r.musteri_kodu, r.unvan, r.ilce, r.sehir, r.lat, r.lon, r.risk_durumu;
$$;

comment on function public.musteri_bekleyen_yuk(integer) is
  'Bekleyen yük, p_gun günlük pencereyle (null = hepsi). v_musteri_bekleyen_yuk ile aynı matematik + en_yeni_siparis_tarihi.';

grant execute on function public.musteri_bekleyen_yuk(integer)
  to anon, authenticated, service_role;

do $$ begin
  grant execute on function public.musteri_bekleyen_yuk(integer) to locus_agent_ro;
exception when undefined_object then null;
end $$;
