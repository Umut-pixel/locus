-- =============================================================================
-- rota_taslaklari — sohbetten kurulan, henüz onaylanmamış plan taslakları
-- =============================================================================
--
-- Neden ayrı bir tablo:
--
-- Asistan "rota oluştur" dendiğinde planı kurar ve sohbette gösterir, ama
-- KAYDETMEZ — kaydetme sil-sonra-yaz (bkz. /api/rota/plan), yani o günün
-- mevcut planını ezer. Onay kullanıcıdan gelmeli.
--
-- Onay ile kurulum arasında planın aynen durması gerekiyor. Kaydetme anında
-- yeniden hesaplasaydık Google Routes farklı bir sıra döndürebilir, bekleyen
-- sipariş havuzu değişmiş olabilirdi: kullanıcının onayladığı plan ile yazılan
-- plan ayrışırdı. Bu yüzden taslak olduğu gibi saklanır, onaydan sonra aynen
-- yazılır.
--
-- Kısa ömürlü. Onaylanan taslak sevkiyat_planlari'na geçer; onaylanmayan
-- birkaç gün sonra çöpe gider (aşağıdaki temizlik fonksiyonu).
--
-- Bağımlılık: yok (payload serbest JSON)
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- =============================================================================

create table if not exists public.rota_taslaklari (
    id           uuid primary key default gen_random_uuid(),
    plan_tarihi  date not null default current_date,
    -- lib/rota/orkestrasyon.ts → RotaTaslagi. Şema burada bilerek gevşek:
    -- taslak geçici bir ara ürün, alan eklendiğinde migration gerekmesin.
    payload      jsonb not null,
    -- Sohbette gösterilen özet (durak sayısı, araç sayısı, toplam kg).
    ozet         jsonb,
    kaynak       text not null default 'agent',
    -- Onaylanıp sevkiyat_planlari'na yazıldığı an. NULL = hâlâ bekliyor.
    kaydedildi   timestamptz,
    olusturuldu  timestamptz not null default now()
);

create index if not exists rota_taslaklari_olusturuldu_idx
  on public.rota_taslaklari (olusturuldu desc);

comment on table public.rota_taslaklari is
  'Sohbetten kurulan, onay bekleyen plan taslakları. Onaylanınca sevkiyat_planlari''na yazılır.';
comment on column public.rota_taslaklari.payload is
  'RotaTaslagi (lib/rota/orkestrasyon.ts). Onaydan sonra AYNEN yazılır — yeniden hesaplanmaz.';
comment on column public.rota_taslaklari.kaydedildi is
  'Onaylanıp kaydedildiği an. NULL ise taslak hâlâ bekliyor.';

alter table public.rota_taslaklari enable row level security;

-- Taslak geçici bir ara ürün ve yalnızca API route'ları (service_role)
-- tarafından yazılıp okunuyor. anon/authenticated'a politika AÇILMADI:
-- tarayıcının taslağı doğrudan okumasına gerek yok.
grant select, insert, update, delete on public.rota_taslaklari to service_role;

-- ---------------------------------------------------------------------------
-- Temizlik — onaylanmamış taslaklar birikmesin
-- ---------------------------------------------------------------------------
-- panorama_sync_stale_sweep.sql ile aynı desen: pg_cron ile günde bir çağır.
--   select cron.schedule('rota-taslak-temizlik', '0 4 * * *',
--                        $$select public.rota_taslagi_temizle()$$);
create or replace function public.rota_taslagi_temizle(p_gun integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  silinen integer;
begin
  delete from public.rota_taslaklari
   where olusturuldu < now() - make_interval(days => p_gun)
     and kaydedildi is null;
  get diagnostics silinen = row_count;
  return silinen;
end;
$fn$;

comment on function public.rota_taslagi_temizle(integer) is
  'p_gun günden eski, onaylanmamış taslakları siler. Kaydedilenlere dokunmaz.';

revoke all on function public.rota_taslagi_temizle(integer) from public;
grant execute on function public.rota_taslagi_temizle(integer) to service_role;
