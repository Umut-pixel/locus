-- Yetim potansiyel_taramalari kilidi süpürücüsü (pg_cron)
--
-- Sorun: /api/potansiyel/tarama önce 'running' satır açıyor, n8n bitince
-- Complete Tarama node'u 'completed' PATCH'liyor. Arada error branch yok ve
-- workflow'da errorWorkflow tanımlı değil — koşu ortada çökerse satır sonsuza
-- kadar 'running' kalır ve buton kalıcı olarak 409 döner.
--
-- EŞİK GEREKÇESİ — panorama_sync_stale_sweep.sql'den BİLİNÇLİ SAPMA:
-- Orada in-flight kilidi (15 dk) süpürücüden (30 dk) KISA tutulmuş, buton
-- süpürücüden önce açılsın diye. Burada tam tersi gerekiyor:
-- $getWorkflowStaticData('global') n8n'de workflow başına, execution başına
-- DEĞİL. İki eşzamanlı tarama birbirinin placesById / scannedDistricts /
-- clippedDistricts'ini ezer ve yanlış ilçelere son_tarama yazar (o ilçeler
-- 25 gün boyunca sonuçsuz kilitlenir). Bu yüzden:
--   * API in-flight kontrolü zaman kesiti KULLANMAZ (durum='running' yeter).
--   * Ölüye karar veren tek merci bu süpürücü.
-- Sonuç: eşzamanlılık imkânsız, en kötü senaryo 40+10 = 50 dk takılı buton.
--
-- 40 dk nereden: Split Nearby Batches batchSize=1 ile 5 node'luk döngü döner;
-- ~800 hücrelik (ilk kez taranan büyükşehir) bir koşu ~7-14 dk sürüyor.
-- ~3x pay. maxCells=600 sigortası da üst sınırı bunun altında tutuyor
-- (bkz. Build Nearby Cells node'u).
--
-- KOTA NOTU: süpürülen satır da günlük hakkı yakar — bilerek. Satır yalnız
-- n8n tetiği kabul ettiyse var; süpürülmüş koşu Google'da para harcamış
-- olandır. Aksi hâlde çırpınan bir workflow sınırsız harcama vektörü olur.
-- Hiç harcamayan tek durum "satır açıldı, n8n POST'u patladı" — orada route
-- satırı siler (flag koymaz), hak yanmaz.

create or replace function public.sweep_stale_potansiyel_taramalari(
  p_threshold interval default interval '40 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.potansiyel_taramalari
     set durum = 'failed',
         hata = coalesce(
           hata,
           format('Otomatik süpürücü: %s içinde tamamlanmadı (n8n koşusu yarım kaldı).', p_threshold)
         ),
         tamamlandi_at = coalesce(tamamlandi_at, now())
   where durum = 'running'
     and baslatildi_at < now() - p_threshold;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.sweep_stale_potansiyel_taramalari(interval)
  from public, anon, authenticated;

comment on function public.sweep_stale_potansiyel_taramalari(interval) is
  'Eşikten eski running potansiyel_taramalari satırlarını failed işaretler. Harita "Potansiyel müşteri ara" butonunun yetim kilitle bloke olmasını engeller.';

-- pg_cron 10 dakikada bir (UTC — ifade saatten bağımsız).
-- Bu kadans frontend/lib/potansiyel-tarama.ts TARAMA_DEADLINE_MS ile birlikte
-- düşünülmeli: tarayıcı 40 dk sonra vazgeçiyor, süpürücü en geç 50 dk'da
-- satırı 'failed' yapıyor → toast "zaman aşımı" derken satır hâlâ 'running'
-- görünebilir, bu beklenen durumdur.
select cron.unschedule('potansiyel_tarama_stale_sweep')
where exists (select 1 from cron.job where jobname = 'potansiyel_tarama_stale_sweep');

select cron.schedule(
  'potansiyel_tarama_stale_sweep',
  '*/10 * * * *',
  $$select public.sweep_stale_potansiyel_taramalari();$$
);
