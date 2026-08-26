-- =============================================================================
-- rapor_bolge_disi_ozet: master'da kaydi olmayan belge cirosunun mutabakat satiri
-- =============================================================================
--
-- NEDEN
--   Panorama'nin BelgeDetayRaporu'su (5450) DistGrup'un TAMAMINI kapsiyor.
--   Musteri master'i da ayni kapsami yazar; bu view yalnizca 5450'de cirosu
--   olan ama `musteriler`'de henuz kaydi bulunmayan kodlari (yeni fatura,
--   landing gecikmesi vb.) sayar. 8-il skip kaldirildi.
--
--   Bu view kapsami DEGISTIRMEZ -- sadece farki gorunur kilar.
--
-- DEDUP
--   parseBelgeDetayRaporu ile AYNI anahtar kullanilir:
--   MusteriKod | (MatbuNo -> SiparisNo -> FaturaNo) | Sira | UrunKodu.
--   Boylece buradaki rakam ekrandakiyle ayni mantikla uretilir.
--
-- GUVENLIK
--   security_invoker BILEREK kapali (definer). Landing tablosu
--   (panorama_belge_detay_raporu) anon'a acik degil ve acilmamali; bu view
--   yalnizca IKI AGREGAT SAYI dondurur (musteri adedi + tutar), satir/PII yok.
--   Alternatif -- invoker yapip landing'i anon'a acmak -- cok daha genis bir
--   yuzey acardi.
-- =============================================================================

drop view if exists public.rapor_bolge_disi_ozet;

create view public.rapor_bolge_disi_ozet as
with kaynak as (
  select
    btrim(b.musteri_kod)                                        as musteri_kod,
    coalesce(nullif(btrim(b.matbu_no), ''),
             nullif(btrim(b.siparis_no), ''),
             nullif(btrim(b.fatura_no), ''))                    as belge,
    coalesce(btrim(b.sira), '')                                 as sira,
    coalesce(btrim(b.urun_kodu), '')                            as urun_kodu,
    nullif(btrim(b.brut_tutar), '')::numeric                    as brut,
    nullif(btrim(b.iskonto), '')::numeric                       as isk,
    b.id
  from public.panorama_belge_detay_raporu b
  left join public.musteriler m on m.musteri_kodu = btrim(b.musteri_kod)
  where m.musteri_kodu is null
    and coalesce(btrim(b.musteri_kod), '') <> ''
    and btrim(b.belge_tip) in ('Satış', 'Konsinye Satış', 'Satış - İade', 'Satış-İade')
),
-- Anahtar uretilemeyen satir (belge is null) dedup'a girmez -- parser de oyle.
numaralanmis as (
  select k.*,
         case
           when k.belge is null then 1
           else row_number() over (
                  partition by k.musteri_kod, k.belge, k.sira, k.urun_kodu
                  order by k.id)
         end as rn
  from kaynak k
)
select
  count(distinct musteri_kod)::integer            as musteri_sayisi,
  round(coalesce(sum(brut - isk), 0), 2)          as net_ciro
from numaralanmis
where rn = 1;

grant select on public.rapor_bolge_disi_ozet to anon, authenticated;

-- Dogrulama:
--   select * from public.rapor_bolge_disi_ozet;
--   -> musteri_sayisi + (select count(*) from musteri_belge_ozet)
--      = landing'deki essiz musteri sayisi olmali.
