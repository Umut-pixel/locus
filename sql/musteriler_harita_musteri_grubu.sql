-- musteriler_harita: musteri_grubu (petshop/veteriner stroke için)
-- Bağımlı view musteri_favoriler_liste yeniden oluşturulur.

drop view if exists public.musteri_favoriler_liste;
drop view if exists public.musteriler_harita;

create view public.musteriler_harita
with (security_invoker = true) as
select m.musteri_kodu, m.unvan, m.adres, m.sehir, m.ilce, m.lat, m.lon, m.rut_kod, m.rut_aciklama,
       m.ziyaret_sira, m.son_teslimat_tarihi, m.ilk_teslimat_tarihi, m.toplam_teslimat_sayisi,
       m.toplam_agirlik, m.toplam_tutar, m.son_teslimattan_gecen_gun,
       m.durum, m.musteri_grubu, m.geocode_hassasiyet, m.guncellendi,
       case
         when m.toplam_teslimat_sayisi = 0            then 'hic_teslimat_yok'
         when m.son_teslimattan_gecen_gun > 90        then 'riskli'
         when m.son_teslimattan_gecen_gun > 45        then 'izlenmeli'
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

create view public.musteri_favoriler_liste
with (security_invoker = true)
as
select
  f.id as favori_id,
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

revoke all on public.musteri_favoriler_liste from anon, authenticated;
