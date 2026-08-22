-- =============================================================================
-- RLS kapali tablolar — anon key ile disariya acik
-- =============================================================================
-- 2026-08-22 denetimi. Agent'tan BAGIMSIZ, uygulama seviyesinde bir sorun.
-- Supabase advisor bunlari ERROR seviyesinde isaretliyor.
--
-- SORUN
--   public.potansiyel_musteriler  (3.794 satir)  RLS KAPALI
--   public.ilce_merkezleri        (134 satir)    RLS KAPALI
--
--   Bu tablolar PostgREST'e acik. NEXT_PUBLIC_SUPABASE_ANON_KEY tarayici
--   bundle'inda oldugu icin herkesin elinde. RLS kapaliyken bu anahtarla
--   /rest/v1/potansiyel_musteriler adresine giden herkes TUM satirlari
--   okuyabilir ve tablo grant'lari izin veriyorsa yazabilir.
--
-- NEDEN GUVENLE KAPATILABILIR (kod denetimi yapildi)
--   - potansiyel_musteriler'e giden tum uygulama erisimi
--     frontend/lib/gizle-store.ts icinde `admin` (service_role) uzerinden.
--     service_role RLS'i BAYPAS eder -> etkilenmez.
--   - Tarayicinin okudugu potansiyel_musteriler_harita view'i
--     SECURITY DEFINER (security_invoker=false) -> postgres yetkisiyle
--     calisir, taban tablodaki RLS'ten etkilenmez.
--   - ilce_merkezleri'ne hicbir kod / view / fonksiyon bagimliligi yok
--     (repo grep + pg_depend + pg_proc tarandi, 0 sonuc).
--
--   Yani: RLS'i politikasiz acmak mevcut akislarin HICBIRINI kirmaz,
--   yalnizca anon key ile dogrudan tablo erisimini kapatir.
-- =============================================================================

alter table public.potansiyel_musteriler enable row level security;
alter table public.ilce_merkezleri       enable row level security;

-- Bilerek POLITIKA EKLENMIYOR: politikasiz RLS = "deny by default".
-- service_role ve SECURITY DEFINER view'lar bundan etkilenmez.


-- ── DOGRULAMA ──────────────────────────────────────────────────────────────
select c.relname as tablo,
       c.relrowsecurity as rls_acik,
       count(p.polname) as politika_sayisi
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in ('potansiyel_musteriler','ilce_merkezleri')
group by c.relname, c.relrowsecurity;
-- BEKLENEN: iki satir da rls_acik = true, politika_sayisi = 0.

-- Uygulama tarafi: bu ikisi calismaya devam etmeli (haritada potansiyel
-- katmanini ac, "Gizle" akisini dene).


-- =============================================================================
-- AYRI KONU — anon'un cagirabildigi SECURITY DEFINER fonksiyonlar
-- =============================================================================
-- Advisor iki fonksiyonu WARN olarak isaretliyor:
--   public.snapshot_musteri_metrik_gecmis()
--   public.snapshot_urun_stok_gecmis()
--
-- Ikisi de SECURITY DEFINER ve anon rolu /rest/v1/rpc/... uzerinden
-- cagirabiliyor. Yani anon key'i olan herkes snapshot yazdirabilir
-- (musteri_metrik_gecmis'te 17.421, urun_stok_gecmis'te 1.376 satir var —
-- tekrarli cagri ile sisirilebilir).
--
-- KIM CAGIRIYOR (dogrulandi)
--   Yalnizca pg_cron, her gun 05:15'te:
--     daily_musteri_metrik_snapshot -> SELECT snapshot_musteri_metrik_gecmis();
--     daily_urun_stok_snapshot      -> SELECT snapshot_urun_stok_gecmis();
--   cron.job komutlari isin sahibi rolle (postgres) calisir, anon ile DEGIL.
--   Frontend kodunda hicbir rpc() cagrisi yok (grep: 0 sonuc).
--   Dolayisiyla anon/authenticated EXECUTE'u geri almak cron'u KIRMAZ.

revoke execute on function public.snapshot_musteri_metrik_gecmis() from anon, authenticated;
revoke execute on function public.snapshot_urun_stok_gecmis()      from anon, authenticated;

-- Dogrulama: iki satir da false donmeli.
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_cagirabilir,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_cagirabilir
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('snapshot_musteri_metrik_gecmis','snapshot_urun_stok_gecmis');

-- Ertesi gun kontrolu (cron gercekten calisti mi):
--   select jobname, status, return_message, start_time
--   from cron.job_run_details order by start_time desc limit 5;
-- =============================================================================
