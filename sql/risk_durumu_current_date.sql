-- =============================================================================
-- musteriler_harita: risk_durumu'nu takvime bagla (2026-08-11 audit'i, K2)
-- =============================================================================
--
-- SORUN
--   `musteriler.son_teslimattan_gecen_gun` ETL sirasinda hesaplaniyor ve
--   referansi "dosyadaki EN YENI sevkiyat tarihi" (lib/import/parse-sevkiyat.ts
--   ve etl_musteri.py). Yani sabit bir tamsayi olarak saklaniyor.
--   View de bu sabit sayiyi okuyup 45/90 esikleriyle risk_durumu uretiyordu.
--
--   Iki sonucu var:
--     (a) Sync/transform durursa yaslandirma TAMAMEN donuyor — gunler gecse de
--         kimse "riskli" banda gecmiyor. 2026-08-06'da yasandi (tech-debt.md).
--     (b) En son sevkiyat alan musteri tanimi geregi hep 0. gun; dagilim
--         takvimle degil, dosyanin kendisiyle kayiyor.
--
-- OLCUM (11 Agu 2026, 1.203 musteri)
--   Uygulama anindaki etki KUCUK — referans o gun sadece 1 gun geriydi:
--     Saglikli  199 -> 196   (-3)
--     Izlenmeli  81 ->  84   (+3)
--     Riskli    161 -> 161   ( 0)
--     Teslimatsiz 762 -> 762 ( 0)
--   Yalnizca 3 musteri band degistirir (Saglikli -> Izlenmeli).
--
--   Asil kazanc sync duraklamasinda ortaya cikiyor (gozden kacan RISKLI):
--     1 gun -> 2 | 3 gun -> 10 | 7 gun -> 19 | 14 gun -> 30 | 30 gun -> 57
--   90 gun sinirinin hemen altinda 10 musteri birikmis durumda.
--
-- YAKLASIM
--   Yazma tarafi (ETL) DEGISMIYOR; m.son_teslimattan_gecen_gun kolonu yerinde
--   kaliyor. Sadece view artik onu current_date'ten turetiyor. Boylece hicbir
--   veri kaybi/geri donusu olmadan gorunum kendi kendini duzeltir hale geliyor.
--   son_teslimat_tarihi null olan (hic teslimat gormemis) kayitlar icin eski
--   davranis korunuyor.
--
-- GERI ALMA
--   sema.sql'in bu commit oncesi surumundeki view tanimini yeniden calistirmak
--   yeterli — tablo/veri degismiyor.
--
-- UYGULAMA
--   Supabase SQL Editor'de bu dosyayi calistir. Idempotent (drop + create).
--   sema.sql da ayni tanimla guncellendi; iki dosya birbiriyle tutarli olmali.
-- =============================================================================

drop view if exists public.musteriler_harita;
create view public.musteriler_harita
with (security_invoker = true) as
select m.musteri_kodu, m.unvan, m.adres, m.sehir, m.ilce, m.lat, m.lon, m.rut_kod, m.rut_aciklama,
       m.ziyaret_sira, m.son_teslimat_tarihi, m.ilk_teslimat_tarihi, m.toplam_teslimat_sayisi,
       m.toplam_agirlik, m.toplam_tutar,
       -- takvime gore; bkz. dosya basindaki aciklama
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

-- Uygulama sonrasi dogrulama: dagilim beklenen yone kaydi mi?
--   select risk_durumu, count(*) from public.musteriler_harita group by 1 order by 1;
