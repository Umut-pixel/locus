-- Yetim panorama_sync_runs kilidi süpürücüsü (pg_cron)
--
-- Sorun: n8n her zincirde önce durum='running' satırı açıyor (Create Sync Run),
-- insert batch'leri bitince 'completed'a çekiyor (Complete Sync Run). Arada
-- hiçbir error branch yok, workflow'da errorWorkflow tanımlı değil ve n8n
-- hiçbir yerde 'failed' yazmıyor. Zincir ortada çökerse satır sonsuza kadar
-- 'running' kalıyor.
--
-- Etkisi: /api/sync/panorama/manual in-flight kontrolünde bu satırı görüp
-- 409 "Bir sync zaten çalışıyor" döndürüyor — ana sayfadaki "Şimdi çek"
-- butonu kalıcı olarak kilitleniyor. 2026-08-28'de 5451 ve 5230 böyle takıldı.
--
-- Eşik gerekçesi: Create -> Complete arası gerçek en uzun pencere ölçümde
-- 108 sn (rapor 5450). Aradaki 5 node'un hiçbiri Wait değil. 30 dk ~16x pay.
--
-- 'failed' yazmak transform'u tetiklemez: panorama_sync_runs_completed_webhook
-- yalnız NEW.durum='completed' ile ateşliyor (bkz. panorama_sync_webhook.sql).
-- Geç biten gerçek bir run sonradan 'completed' PATCH'lerse trigger yine
-- çalışır — istenen davranış.

create or replace function public.sweep_stale_panorama_sync_runs(
  p_threshold interval default interval '30 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.panorama_sync_runs
     set durum = 'failed',
         hata = coalesce(
           hata,
           format('Otomatik süpürücü: %s içinde tamamlanmadı (n8n zinciri yarım kaldı).', p_threshold)
         ),
         tamamlandi_at = coalesce(tamamlandi_at, now())
   where durum in ('running', 'pending', 'in_progress')
     and cekildi_at < now() - p_threshold;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.sweep_stale_panorama_sync_runs(interval)
  from public, anon, authenticated;

comment on function public.sweep_stale_panorama_sync_runs(interval) is
  'Eşikten eski running/pending/in_progress panorama_sync_runs satırlarını failed işaretler. Manuel sync butonunun yetim kilitle bloke olmasını engeller.';

-- pg_cron 15 dakikada bir (UTC — ifade saatten bağımsız).
select cron.unschedule('panorama_sync_stale_sweep')
where exists (select 1 from cron.job where jobname = 'panorama_sync_stale_sweep');

select cron.schedule(
  'panorama_sync_stale_sweep',
  '*/15 * * * *',
  $$select public.sweep_stale_panorama_sync_runs();$$
);
