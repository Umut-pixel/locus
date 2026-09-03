-- =============================================================================
-- panorama_rapor_ozeti — çekim sonrası "ne geldi" özeti
-- =============================================================================
--
-- Rapor çekildikten sonra sohbette ve ana sayfada içerik özeti gösteriliyor.
-- Özet MODELDEN GEÇMİYOR: rakamlar doğrudan buradan okunuyor, böylece hem
-- token harcanmıyor hem de asistanın sayı uydurma ihtimali sıfır.
--
-- Her rapor için üç şey döner:
--   1. Son çekimin durumu (satır sayısı, bitiş zamanı, hata)
--   2. Bir önceki tamamlanmış çekimin satır sayısı — "+37 satır" farkı için
--   3. O raporun içeriğine dair 1–2 başlık metriği
--
-- Landing view'larında sayısal alanlar TEXT tutuluyor (Panorama XLSX'ten
-- ham geliyor). Bozuk hücre toplamı patlatmasın diye her cast regex ile
-- korunuyor: sayıya benzemeyen değer 0 sayılır.
--
-- Bağımlılık: panorama_sync_runs + v_panorama_*_guncel view'ları
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- =============================================================================

create or replace function public.panorama_rapor_ozeti(p_report_ids integer[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  sonuc   jsonb := '[]'::jsonb;
  rid     integer;
  son     record;
  onceki  integer;
  metrik  jsonb;
  -- Sayıya benzeyen metin: isteğe bağlı eksi, rakamlar, isteğe bağlı ondalık.
  re      text := '^-?[0-9]+(\.[0-9]+)?$';
begin
  foreach rid in array coalesce(p_report_ids, '{}')
  loop
    select r.durum, r.satir_sayisi, r.tamamlandi_at, r.cekildi_at, r.hata
      into son
      from public.panorama_sync_runs r
     where r.report_id = rid
     order by r.cekildi_at desc nulls last
     limit 1;

    -- Bir öncekinin satır sayısı — fark göstermek için.
    select r.satir_sayisi
      into onceki
      from public.panorama_sync_runs r
     where r.report_id = rid
       and r.durum = 'completed'
       and r.cekildi_at < coalesce(son.cekildi_at, now())
     order by r.cekildi_at desc
     limit 1;

    metrik := '[]'::jsonb;

    if rid = 5020 then
      -- Müşteri zinciri üç raporu birlikte çekiyor; özet de üçünü kapsar.
      select jsonb_build_array(
               jsonb_build_object('etiket', 'Müşteri kartı', 'deger', count(*), 'tip', 'adet'),
               jsonb_build_object('etiket', 'Aktif müşteri',
                                  'deger', count(*) filter (where durum = 'Aktif'), 'tip', 'adet')
             )
        into metrik
        from public.v_panorama_musteri_listesi_guncel;

      metrik := metrik || (
        select jsonb_build_array(
                 jsonb_build_object('etiket', 'Sevkiyat belgesi',
                                    'deger', count(distinct matbu_no), 'tip', 'adet')
               )
          from public.v_panorama_sevkiyat_raporu_kup_guncel
      );

    elsif rid = 5530 then
      select jsonb_build_array(
               jsonb_build_object('etiket', 'Açık bakiye',
                                  'deger', round(sum(case when kalan_tutar ~ re then kalan_tutar::numeric else 0 end)),
                                  'tip', 'para'),
               jsonb_build_object('etiket', 'Borçlu müşteri',
                                  'deger', count(distinct musteri_kod), 'tip', 'adet')
             )
        into metrik
        from public.v_panorama_acik_fatura_vade_kup_guncel;

    elsif rid = 5450 then
      select jsonb_build_array(
               jsonb_build_object('etiket', 'Fatura belgesi',
                                  'deger', count(distinct matbu_no), 'tip', 'adet'),
               jsonb_build_object('etiket', 'Toplam tutar (KDV dahil)',
                                  'deger', round(sum(case when nettutar ~ re then nettutar::numeric else 0 end)),
                                  'tip', 'para')
             )
        into metrik
        from public.v_panorama_belge_detay_raporu_guncel;

    elsif rid = 5140 then
      -- Bu view'da matbu_no boş geliyor; belge kimliği belge_kod'da.
      select jsonb_build_array(
               jsonb_build_object('etiket', 'Sipariş belgesi',
                                  'deger', count(distinct belge_kod), 'tip', 'adet'),
               jsonb_build_object('etiket', 'Müşteri', 'deger', count(distinct musteri_kod), 'tip', 'adet')
             )
        into metrik
        from public.v_panorama_siparis_durum_raporu_guncel;

    elsif rid = 5430 then
      select jsonb_build_array(
               jsonb_build_object('etiket', 'Ürün', 'deger', count(distinct urun_kodu), 'tip', 'adet'),
               jsonb_build_object('etiket', 'Stok değeri',
                                  'deger', round(sum(case when brut_tutar ~ re then brut_tutar::numeric else 0 end)),
                                  'tip', 'para')
             )
        into metrik
        from public.v_panorama_detayli_stok_raporu_guncel;

    elsif rid = 5230 then
      select jsonb_build_array(
               jsonb_build_object('etiket', 'Tahsilat',
                                  'deger', round(sum(case when tutar ~ re then tutar::numeric else 0 end)),
                                  'tip', 'para'),
               jsonb_build_object('etiket', 'Ödeyen müşteri',
                                  'deger', count(distinct musteri_kod), 'tip', 'adet')
             )
        into metrik
        from public.v_panorama_tahsilat_raporu_guncel;

    elsif rid = 5451 then
      select jsonb_build_array(
               jsonb_build_object('etiket', 'Bekleyen sipariş belgesi',
                                  'deger', count(distinct matbu_no), 'tip', 'adet'),
               jsonb_build_object('etiket', 'Toplam tutar (KDV dahil)',
                                  'deger', round(sum(case when nettutar ~ re then nettutar::numeric else 0 end)),
                                  'tip', 'para')
             )
        into metrik
        from public.v_panorama_siparis_detay_raporu_guncel;
    end if;

    sonuc := sonuc || jsonb_build_array(jsonb_build_object(
      'report_id',     rid,
      'durum',         son.durum,
      'satir_sayisi',  son.satir_sayisi,
      'tamamlandi_at', son.tamamlandi_at,
      'hata',          son.hata,
      'onceki_satir',  onceki,
      'metrikler',     coalesce(metrik, '[]'::jsonb)
    ));
  end loop;

  return sonuc;
end;
$fn$;

comment on function public.panorama_rapor_ozeti(integer[]) is
  'Çekim sonrası rapor özeti: son çalıştırma durumu, önceki satır sayısı ve içerik metrikleri.';

revoke all on function public.panorama_rapor_ozeti(integer[]) from public;
grant execute on function public.panorama_rapor_ozeti(integer[]) to service_role;

do $$ begin
  grant execute on function public.panorama_rapor_ozeti(integer[]) to locus_agent_ro;
exception when undefined_object then null;
end $$;
