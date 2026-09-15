-- FAZ 5 — DÖNÜŞÜ ZOR. Yeni frontend prod'da doğrulanmadan UYGULAMAYIN
-- (bkz. plan: eski frontend hiç Supabase Auth login yapmadığı için anon
-- olarak sorgular, bu migration sonrası anon'un erişimi kalmıyor).
--
-- musteriler_rapor'u borç/ciro/risk kolonlarını `musteri_finansal_detay`
-- izni olmayan roller (satis_temsilcisi) için NULL'a maskeler. Kolon
-- adı/sırası BİREBİR korunuyor — musteriler_harita bu view'ın üzerine kurulu
-- ve gövdesi hiç değişmiyor (CLAUDE.md: risk hesaplama tek yerde kalmalı).
--
-- İki mekanizma:
-- 1) Satır seviyesi (otomatik NULL): musteri_yaslandirma + musteri_tahsilat_ozet
--    TÜMÜYLE finansal — bu iki tabloya musteri_finansal_detay şartlı SELECT
--    politikası veriliyor; LEFT JOIN izinsiz kullanıcı için hiç satır
--    bulamayınca y.*/t.* kolonları kendiliğinden NULL gelir.
-- 2) Sütun seviyesi (CASE WHEN): musteriler + musteri_belge_ozet'te aynı
--    satırda hem maskelenecek hem kalacak kolon var — bu iki tablo satır
--    seviyesinde geniş (OR) politika alır, maskeleme view'daki CASE'e kalır.

drop policy if exists "musteriler_select_public" on public.musteriler;
create policy "musteriler_select_authenticated" on public.musteriler
  for select to authenticated
  using (
    public.has_izin('harita')
    or public.has_izin('finansal_raporlar')
    or public.has_izin('tahsilat_raporlari')
    or public.has_izin('sevkiyat_raporlari')
    or public.has_izin('musteri_raporlama')
    or public.has_izin('rota_planlama')
  );

drop policy if exists "musteri_belge_ozet_select_public" on public.musteri_belge_ozet;
create policy "musteri_belge_ozet_select_authenticated" on public.musteri_belge_ozet
  for select to authenticated
  using (
    public.has_izin('harita')
    or public.has_izin('finansal_raporlar')
    or public.has_izin('tahsilat_raporlari')
    or public.has_izin('sevkiyat_raporlari')
    or public.has_izin('musteri_raporlama')
    or public.has_izin('rota_planlama')
  );

drop policy if exists "musteri_yaslandirma_select_public" on public.musteri_yaslandirma;
create policy "musteri_yaslandirma_select_authenticated" on public.musteri_yaslandirma
  for select to authenticated
  using (public.has_izin('musteri_finansal_detay'));

drop policy if exists "musteri_tahsilat_ozet_select_public" on public.musteri_tahsilat_ozet;
create policy "musteri_tahsilat_ozet_select_authenticated" on public.musteri_tahsilat_ozet
  for select to authenticated
  using (public.has_izin('musteri_finansal_detay'));

create or replace view public.musteriler_rapor
with (security_invoker = true) as
select
  m.musteri_kodu,
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
  case when public.has_izin('musteri_finansal_detay')
       then m.toplam_tutar else null end::numeric(16,2) as toplam_tutar,
  case
    when m.son_teslimat_tarihi is null then m.son_teslimattan_gecen_gun
    else current_date - m.son_teslimat_tarihi
  end as son_teslimattan_gecen_gun,
  m.durum,
  m.musteri_grubu,
  m.geocode_hassasiyet,
  m.guncellendi,
  case when public.has_izin('musteri_finansal_detay') then
    case
      when m.toplam_teslimat_sayisi = 0 then 'hic_teslimat_yok'::text
      when m.son_teslimat_tarihi is null then 'hic_teslimat_yok'::text
      when (current_date - m.son_teslimat_tarihi) > 90 then 'riskli'::text
      when (current_date - m.son_teslimat_tarihi) > 45 then 'izlenmeli'::text
      else 'saglikli'::text
    end
  else null end::text as risk_durumu,
  -- y.* — CASE YOK: musteri_yaslandirma'daki satır-seviyesi RLS izinsiz
  -- kullanıcı için LEFT JOIN'i boş bırakır, kolonlar otomatik NULL gelir.
  y.st as yas_st,
  y.hf_01_06, y.hf_07_13, y.hf_14_20, y.hf_21_27, y.hf_28_34, y.hf_35_41,
  y.hf_42_48, y.hf_49_55, y.hf_56_62, y.hf_63_69, y.hf_70_ustu,
  y.toplam as yas_toplam,
  y.riskli_tutar as yas_riskli_tutar,
  y.borc_riskli,
  y.inserted_at as yas_inserted_at,
  case when public.has_izin('musteri_finansal_detay') then b.donem_bas end::date as belge_donem_bas,
  case when public.has_izin('musteri_finansal_detay') then b.donem_bit end::date as belge_donem_bit,
  case when public.has_izin('musteri_finansal_detay') then b.satir_sayisi end::integer as belge_satir_sayisi,
  case when public.has_izin('musteri_finansal_detay') then b.siparis_sayisi end::integer as belge_siparis_sayisi,
  case when public.has_izin('musteri_finansal_detay') then b.fatura_sayisi end::integer as belge_fatura_sayisi,
  case when public.has_izin('musteri_finansal_detay')
       then round(b.brut_ciro - b.iskonto_toplam, 2) end::numeric(16,2) as belge_net_ciro,
  case when public.has_izin('musteri_finansal_detay') then b.brut_ciro end::numeric(16,2) as belge_brut_ciro,
  case when public.has_izin('musteri_finansal_detay') then b.iskonto_toplam end::numeric(16,2) as belge_iskonto_toplam,
  case when public.has_izin('musteri_finansal_detay') then b.promo_satir end::integer as belge_promo_satir,
  case when public.has_izin('musteri_finansal_detay') then b.iptal_satir end::integer as belge_iptal_satir,
  case when public.has_izin('musteri_finansal_detay') then b.son_islem_tarihi end::date as belge_son_islem_tarihi,
  case when public.has_izin('musteri_finansal_detay') then b.vade_gunu end::integer as belge_vade_gunu,
  b.top_urun_grup as belge_top_urun_grup,
  b.son_urun_grup as belge_son_urun_grup,
  b.top_urun as belge_top_urun,
  b.son_urun as belge_son_urun,
  b.st_adi as belge_st_adi,
  b.st_kodu as belge_st_kodu,
  case when public.has_izin('musteri_finansal_detay') then b.net_ciro end::numeric(16,2) as belge_net_ciro_kdv_dahil,
  -- t.* — CASE YOK, y.* ile aynı gerekçe (musteri_tahsilat_ozet satır-seviyesi).
  t.son_tahsilat_tarihi,
  t.tahsilat_7g,
  t.tahsilat_30g,
  t.tahsilat_ytd,
  t.odenmemis_tutar,
  t.odenmemis_adet
from musteriler m
left join musteri_yaslandirma y on y.musteri_kodu = m.musteri_kodu
left join musteri_belge_ozet b on b.musteri_kodu = m.musteri_kodu
left join musteri_tahsilat_ozet t on t.musteri_kodu = m.musteri_kodu;
