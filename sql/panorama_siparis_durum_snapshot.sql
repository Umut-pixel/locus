-- =============================================================================
-- 5140 Sipariş Durum — snapshot (5451 deseni)
-- =============================================================================
--
-- Önceki hali upsert + UNIQUE(belge_kod, kalem_sira) + guncel view = tüm tablo.
-- Panorama'dan düşen siparişler "Bekleyen" olarak kalıyordu (11 belge / ~₺1.3M
-- brüt, 2026-08-31 audit). Ham Excel ile son sync birebir; bozulan katman
-- okuma/yazma sözleşmesiydi.
--
-- Yeni sözleşme:
--   * UNIQUE(sync_id, belge_kod, kalem_sira) — aynı kalem her çekimde yeni satır
--   * n8n insert (on_conflict YOK), guncel view = son completed 5140
--   * Bekleyen tutar = BrutTutar (iskonto ve KDV hariç)
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- =============================================================================

alter table public.panorama_siparis_durum_raporu
  drop constraint if exists panorama_siparis_durum_raporu_belge_kalem_key;

drop index if exists public.panorama_siparis_durum_raporu_belge_kalem_key;

create unique index if not exists panorama_siparis_durum_raporu_sync_belge_kalem_key
  on public.panorama_siparis_durum_raporu (sync_id, belge_kod, kalem_sira);

create index if not exists idx_siparis_durum_sync
  on public.panorama_siparis_durum_raporu (sync_id);

create index if not exists idx_siparis_durum_bekleyen
  on public.panorama_siparis_durum_raporu (bekleyen_siparis);

drop view if exists public.v_panorama_siparis_durum_raporu_guncel;

create view public.v_panorama_siparis_durum_raporu_guncel
with (security_invoker = true) as
select *
  from public.panorama_siparis_durum_raporu m
 where m.sync_id = (
   select r.id
     from public.panorama_sync_runs r
    where r.durum = 'completed'
      and r.report_id = 5140
    order by r.cekildi_at desc
    limit 1
 );

grant select on public.v_panorama_siparis_durum_raporu_guncel
  to anon, authenticated, service_role, locus_agent_ro;

comment on table public.panorama_siparis_durum_raporu is
  'Sipariş Durum Raporu (Panorama 5140). Tam snapshot; unique (sync_id, belge_kod, kalem_sira).';

comment on view public.v_panorama_siparis_durum_raporu_guncel is
  'Son completed 5140. Bekleyen tutar = BrutTutar (iskonto ve KDV hariç). İptal/sevk olan satırlar yeni çekimde yoksa düşer.';
