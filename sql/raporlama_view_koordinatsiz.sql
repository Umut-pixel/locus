-- =============================================================================
-- musteriler_rapor: raporlama icin koordinat filtresiz tam kume (2026-08-18)
-- =============================================================================
--
-- SORUN
--   /raporlar ekrani `musteriler_harita` view'ini okuyor. O view harita icin
--   yazilmis ve `where lat is not null and lon is not null` kosulu tasiyor.
--   Rapor ekrani bu kosulu istemeden miras aliyordu: belge ozeti OLAN ama
--   koordinati OLMAYAN 12 musteri toplam net ciroya hic girmiyordu.
--
--   Olculen (2026-08-18):
--     musteri_belge_ozet toplam belge_net_ciro : 47.575.726,09
--     musteriler_harita  toplam belge_net_ciro : 47.335.100,01
--     fark (koordinatsiz 12 musteri)           :     240.626,08  <-- kayip
--
--   Koordinat filtresi HARITA icin dogru (noktasi olmayan musteri haritaya
--   cizilemez), RAPOR icin yanlis (cirosu olan musteri rapordan dusmemeli).
--
-- YAKLASIM
--   Gercek govde `musteriler_rapor`a tasiniyor (filtresiz). `musteriler_harita`
--   onun uzerine ince bir filtre katmani oluyor:
--
--       musteriler_rapor   -- tum musteriler (rapor, ozet, export)
--         └─ musteriler_harita = musteriler_rapor WHERE lat/lon dolu  (harita)
--
--   Risk ve net ciro mantigi TEK yerde kaliyor (musteriler_rapor) -- CLAUDE.md'
--   deki "risk hesaplama SQL view'da, tek kaynak" kisiti korunuyor. Harita
--   ve rapor ayni risk/ciro tanimini paylasmaya devam ediyor.
--
--   musteri_favoriler_liste `musteriler_harita`ya bagimli oldugu icin drop
--   sirasinda dusuyor; asagida AYNEN geri kuruluyor (harita'ya bagli kaliyor --
--   favoriler harita ozelligi, koordinat sartini korumasi dogru).
--
-- GERI ALMA
--   sql/net_ciro_kdv_haric.sql'i yeniden calistir (musteriler_harita'yi tek
--   basina, filtreli haliyle kurar) + asagidaki favoriler blogunu tekrarla.
--   Sonra frontend'i MUSTERILER_HARITA_VIEW'a geri al.
--
-- UYGULAMA
--   Supabase SQL Editor / apply_migration. Idempotent (drop + create).
-- =============================================================================

drop view if exists public.musteri_favoriler_liste;
drop view if exists public.musteriler_harita;
drop view if exists public.musteriler_rapor;

-- --------------------------------------------------------------------------
-- 1) Gercek govde -- koordinat filtresi YOK. Risk + net ciro burada hesaplanir.
-- --------------------------------------------------------------------------
create view public.musteriler_rapor
with (security_invoker = true) as
select m.musteri_kodu,
       m.unvan,
       m.adres,
       m.sehir,
       m.ilce,
       m.lat,
       m.lon,
       m.rut_kod,
       m.rut_aciklama,
       m.ziyaret_sira,
       m.son_teslimat_tarihi,
       m.ilk_teslimat_tarihi,
       m.toplam_teslimat_sayisi,
       m.toplam_agirlik,
       m.toplam_tutar,
       case
         when m.son_teslimat_tarihi is null then m.son_teslimattan_gecen_gun
         else current_date - m.son_teslimat_tarihi
       end as son_teslimattan_gecen_gun,
       m.durum,
       m.musteri_grubu,
       m.geocode_hassasiyet,
       m.guncellendi,
       case
         when m.toplam_teslimat_sayisi = 0                then 'hic_teslimat_yok'::text
         when m.son_teslimat_tarihi is null               then 'hic_teslimat_yok'::text
         when (current_date - m.son_teslimat_tarihi) > 90 then 'riskli'::text
         when (current_date - m.son_teslimat_tarihi) > 45 then 'izlenmeli'::text
         else 'saglikli'::text
       end as risk_durumu,
       y.st as yas_st,
       y.hf_01_06, y.hf_07_13, y.hf_14_20, y.hf_21_27, y.hf_28_34,
       y.hf_35_41, y.hf_42_48, y.hf_49_55, y.hf_56_62, y.hf_63_69, y.hf_70_ustu,
       y.toplam       as yas_toplam,
       y.riskli_tutar as yas_riskli_tutar,
       y.borc_riskli,
       y.inserted_at  as yas_inserted_at,
       b.donem_bas      as belge_donem_bas,
       b.donem_bit      as belge_donem_bit,
       b.satir_sayisi   as belge_satir_sayisi,
       b.siparis_sayisi as belge_siparis_sayisi,
       b.fatura_sayisi  as belge_fatura_sayisi,
       -- KDV haric gercek net satis geliri (bkz. sql/net_ciro_kdv_haric.sql).
       round(b.brut_ciro - b.iskonto_toplam, 2)::numeric(16,2) as belge_net_ciro,
       b.brut_ciro       as belge_brut_ciro,
       b.iskonto_toplam  as belge_iskonto_toplam,
       b.promo_satir     as belge_promo_satir,
       b.iptal_satir     as belge_iptal_satir,
       b.son_islem_tarihi as belge_son_islem_tarihi,
       b.vade_gunu       as belge_vade_gunu,
       b.top_urun_grup   as belge_top_urun_grup,
       b.son_urun_grup   as belge_son_urun_grup,
       b.top_urun        as belge_top_urun,
       b.son_urun        as belge_son_urun,
       b.st_adi          as belge_st_adi,
       b.st_kodu         as belge_st_kodu,
       -- Panorama "Nettutar" -- KDV DAHIL tutar, referans icin.
       b.net_ciro        as belge_net_ciro_kdv_dahil
from public.musteriler m
  left join public.musteri_yaslandirma y on y.musteri_kodu = m.musteri_kodu
  left join public.musteri_belge_ozet  b on b.musteri_kodu = m.musteri_kodu;

-- --------------------------------------------------------------------------
-- 2) Harita katmani -- ayni govde, sadece koordinati olanlar.
-- --------------------------------------------------------------------------
create view public.musteriler_harita
with (security_invoker = true) as
select * from public.musteriler_rapor
where lat is not null and lon is not null;

-- --------------------------------------------------------------------------
-- 3) Favoriler -- degismedi, harita'ya bagli kalir (koordinat sarti korunur).
-- --------------------------------------------------------------------------
create view public.musteri_favoriler_liste
with (security_invoker = true) as
select f.id as favori_id,
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

grant select on public.musteriler_rapor  to anon, authenticated;
grant select on public.musteriler_harita to anon, authenticated;
grant select on public.musteri_favoriler_liste to service_role;

-- Dogrulama:
--   select
--     (select round(sum(belge_net_ciro),2) from public.musteriler_rapor)  as rapor,
--     (select round(sum(belge_net_ciro),2) from public.musteriler_harita) as harita,
--     (select round(sum(brut_ciro - iskonto_toplam),2) from public.musteri_belge_ozet) as tablo;
--   -> rapor == tablo olmali; harita, rapor'dan koordinatsizlar kadar dusuk.
