-- =============================================================================
-- musteriler_harita: belge_net_ciro'yu KDV haric net satisa cevir (2026-08-13 audit'i)
-- =============================================================================
--
-- SORUN
--   Panorama'nin BelgeDetayRaporu'ndaki "Nettutar" alani -- view'da
--   `belge_net_ciro` olarak sunulan ve raporlama ekraninin her yerinde
--   ("Net Ciro" kolonu, alt ozet cubugu, xlsx export, harita musteri paneli,
--   14 gunluk sparkline trendi) "net ciro" diye gosterilen deger -- aslinda
--   NET DEGIL, KDV DAHIL tutar.
--
--   Supabase'de dogrulandi (467 dolu musteri_belge_ozet kaydinin TAMAMINDA,
--   istisnasiz):
--       net_ciro / (brut_ciro - iskonto_toplam) = 1.2000
--   yani  Nettutar = (BrutTutar - Iskonto) * 1.20  (%20 KDV dahil edilmis).
--
--   Gercek net satis geliri (KDV haric, muhasebe anlaminda "net ciro"):
--       brut_ciro - iskonto_toplam
--   Bu alan zaten musteri_belge_ozet'te var, Panorama'dan yeni bir sey
--   cekmeye gerek yok.
--
-- YAKLASIM
--   `belge_net_ciro` kolonunun ANLAMI degistiriliyor: artik brut - iskonto
--   (KDV haric net satis). Eski KDV dahil deger, ihtiyaci olan biri cikarsa
--   diye `belge_net_ciro_kdv_dahil` adiyla ayrica korunuyor.
--
--   Bu, ETL/parse katmanina (frontend/lib/import/parse-belge-detay.ts) veya
--   musteri_belge_ozet tablosuna DOKUNMUYOR -- net_ciro/brut_ciro/iskonto_toplam
--   ham kolonlari oldugu gibi kaliyor. Duzeltme sadece view projeksiyonunda.
--
--   `musteri_metrik_gecmis` (sparkline kaynagi) `musteriler_harita`'dan
--   `belge_net_ciro` okuyan pg_cron isiyle (`snapshot_musteri_metrik_gecmis`,
--   05:15 UTC / 08:15 TR, bkz. sql/metrik_gecmis_sema.sql) besleniyor --
--   view duzeldikten sonra bir SONRAKI cron calismasinda otomatik duzelir.
--   Bugunku satir (varsa) bu dosyanin altindaki UPDATE ile elle senkronize
--   edilir. GECMIS gunlerin (9-12 Agustos) satirlari donemsel oldugundan
--   geriye donuk duzeltilemez -- bilinen, kucuk ve kendi kendine 14 gunluk
--   pencereden dusecek bir sapma.
--
-- GERI ALMA
--   Bu dosyadan once calisan surumu (risk_durumu_current_date.sql) yeniden
--   calistirmak yeterli -- tablo/veri degismiyor, sadece view projeksiyonu.
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
       -- KDV haric gercek net satis geliri (bkz. dosya basindaki aciklama).
       round(b.brut_ciro - b.iskonto_toplam, 2) as belge_net_ciro,
       -- Eski davranis: Panorama'nin "Nettutar"i, aslinda KDV DAHIL tutar.
       b.net_ciro as belge_net_ciro_kdv_dahil,
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

-- Bugunku pg_cron snapshot'ini (varsa) duzeltilmis view'a senkronize et.
-- Gecmis gunlere DOKUNMAZ (donemsel veri, geriye donuk yeniden hesaplanamaz).
update public.musteri_metrik_gecmis mg
set net_ciro = h.belge_net_ciro
from public.musteriler_harita h
where h.musteri_kodu = mg.musteri_kodu
  and mg.snapshot_tarihi = current_date
  and h.belge_net_ciro is distinct from mg.net_ciro;

-- Uygulama sonrasi dogrulama:
--   select sum(belge_net_ciro), sum(belge_net_ciro_kdv_dahil), sum(belge_brut_ciro)
--   from public.musteriler_harita;
