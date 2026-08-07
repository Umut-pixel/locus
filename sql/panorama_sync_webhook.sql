-- Panorama sync_runs → Locus transform webhook (pg_net)
-- Fires when durum transitions to 'completed'.
-- Core reports (5020/5500/5130): POST only if all three completed within 5 minutes.
-- Independent reports (5450/5530): POST immediately.
-- URL + Authorization live in vault:
--   panorama_transform_url  = https://locus-two-delta.vercel.app/api/sync/panorama
--   panorama_transform_auth = Bearer <CRON_SECRET>

create extension if not exists pg_net;

create or replace function public.notify_panorama_sync_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  endpoint text;
  auth_header text;
  payload jsonb;
  request_id bigint;
  ts_5020 timestamptz;
  ts_5500 timestamptz;
  ts_5130 timestamptz;
  window_interval interval := interval '5 minutes';
begin
  if NEW.report_id in (5020, 5500, 5130) then
    select tamamlandi_at into ts_5020
    from public.panorama_sync_runs
    where report_id = 5020 and durum = 'completed'
    order by cekildi_at desc nulls last
    limit 1;

    select tamamlandi_at into ts_5500
    from public.panorama_sync_runs
    where report_id = 5500 and durum = 'completed'
    order by cekildi_at desc nulls last
    limit 1;

    select tamamlandi_at into ts_5130
    from public.panorama_sync_runs
    where report_id = 5130 and durum = 'completed'
    order by cekildi_at desc nulls last
    limit 1;

    if ts_5020 is null or ts_5500 is null or ts_5130 is null then
      return NEW;
    end if;

    if ts_5020 < now() - window_interval
       or ts_5500 < now() - window_interval
       or ts_5130 < now() - window_interval then
      return NEW;
    end if;
  end if;

  select ds.decrypted_secret into endpoint
  from vault.decrypted_secrets ds
  where ds.name = 'panorama_transform_url'
  limit 1;

  select ds.decrypted_secret into auth_header
  from vault.decrypted_secrets ds
  where ds.name = 'panorama_transform_auth'
  limit 1;

  if endpoint is null or btrim(endpoint) = '' then
    raise warning 'notify_panorama_sync_completed: vault secret panorama_transform_url missing';
    return NEW;
  end if;

  if auth_header is null or btrim(auth_header) = '' then
    raise warning 'notify_panorama_sync_completed: vault secret panorama_transform_auth missing';
    return NEW;
  end if;

  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', to_jsonb(NEW),
    'old_record', to_jsonb(OLD)
  );

  request_id := net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', auth_header
    ),
    body := payload,
    timeout_milliseconds := 290000
  );

  return NEW;
end;
$$;

drop trigger if exists panorama_sync_runs_completed_webhook on public.panorama_sync_runs;

create trigger panorama_sync_runs_completed_webhook
after update on public.panorama_sync_runs
for each row
when (NEW.durum = 'completed' and OLD.durum is distinct from 'completed')
execute function public.notify_panorama_sync_completed();

revoke all on function public.notify_panorama_sync_completed() from public, anon, authenticated;

comment on function public.notify_panorama_sync_completed() is
  'After panorama_sync_runs becomes completed, POST to Locus /api/sync/panorama (pg_net). Core trio gated to 5-minute freshness.';
