-- =============================================================================
-- TANI — locus_agent_ro rolu dogru kurulmus mu?
-- =============================================================================
-- Salt okunur. Hicbir sey degistirmez. Supabase SQL Editor'de calistir,
-- ciktilari paylas.
-- =============================================================================

-- 1) Rol ve kullanici var mi? Kullanici role uye mi? -------------------------
select 'rol/kullanici' as kontrol,
       r.rolname,
       r.rolcanlogin as giris_yapabilir,
       coalesce(
         (select string_agg(g.rolname, ', ')
          from pg_auth_members m
          join pg_roles g on g.oid = m.roleid
          where m.member = r.oid),
         '(uyesi oldugu rol yok)'
       ) as uye_oldugu_roller
from pg_roles r
where r.rolname in ('locus_agent_ro', 'locus_agent')
order by r.rolname;
-- BEKLENEN: iki satir. locus_agent_ro (giris yapamaz),
--           locus_agent (giris yapabilir, locus_agent_ro uyesi)

-- 2) Rol ayarlari uygulanmis mi? --------------------------------------------
select 'rol ayarlari' as kontrol, rolname, unnest(rolconfig) as ayar
from pg_roles
where rolname = 'locus_agent_ro';
-- BEKLENEN: default_transaction_read_only=on, statement_timeout=10s,
--           search_path=public, idle_in_transaction_session_timeout=30s

-- 3) Hangi nesnelere SELECT verilmis? ---------------------------------------
select 'grantlar' as kontrol,
       table_schema || '.' || table_name as nesne,
       privilege_type
from information_schema.role_table_grants
where grantee = 'locus_agent_ro'
order by table_schema, table_name;
-- BEKLENEN: yalnizca SELECT. INSERT/UPDATE/DELETE GORUNMEMELI.

-- 4) Agent'in gordugu view'lar security_invoker mi? -------------------------
--    ONEMLI: security_invoker=true ise, view'i sorgulayan rol ALTTAKI
--    TABLOLARA da erisebilmeli VE o tablolarin RLS politikalari o rolu
--    kapsamali. Aksi halde ya "permission denied" ya da SESSIZCE 0 satir.
select 'view guvenlik modu' as kontrol,
       c.relname as view_adi,
       coalesce(
         (select option_value
          from pg_options_to_table(c.reloptions)
          where option_name = 'security_invoker'),
         'false (definer)'
       ) as security_invoker,
       pg_get_userbyid(c.relowner) as sahibi
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname in (
    'musteriler_rapor', 'musteriler_harita', 'rapor_bolge_disi_ozet',
    'v_panorama_belge_detay_raporu_guncel',
    'v_panorama_sevkiyat_raporu_kup_guncel',
    'v_panorama_acik_fatura_vade_kup_guncel',
    'v_panorama_detayli_stok_raporu_guncel',
    'v_panorama_siparis_durum_raporu_guncel',
    'v_panorama_siparis_detay_raporu_guncel'
  )
order by c.relname;

-- 5) RLS acik olan tablolar ve politikalarin kapsadigi roller ---------------
--    locus_agent_ro hicbir politikada gecmiyorsa -> 0 satir doner (sessiz hata)
select 'rls politikalari' as kontrol,
       c.relname as tablo,
       c.relrowsecurity as rls_acik,
       coalesce(p.polname, '(politika yok)') as politika,
       coalesce(
         (select string_agg(pg_get_userbyid(role_oid), ', ')
          from unnest(p.polroles) as role_oid
          where role_oid <> 0),
         'PUBLIC (herkes)'
       ) as kapsanan_roller
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'musteriler', 'musteri_yaslandirma', 'musteri_belge_ozet',
    'urun_skt', 'musteri_metrik_gecmis'
  )
order by c.relname, p.polname;
-- BEKLENEN (duzeltmeden ONCE): kapsanan_roller = "anon, authenticated"
--   -> locus_agent_ro YOK -> BU SORUN.

-- 6) v_panorama_* view'lari neye dayaniyor? ---------------------------------
--    Bu view'lar repoda tanimli degil; tanimlarini gorelim.
select 'panorama view tanimi' as kontrol,
       c.relname as view_adi,
       left(pg_get_viewdef(c.oid, true), 400) as tanim_ilk_400_karakter
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname like 'v_panorama_%'
order by c.relname;

-- 7) Panorama landing tablolarinda RLS var mi? ------------------------------
select 'landing rls' as kontrol,
       c.relname as tablo,
       c.relrowsecurity as rls_acik,
       count(p.polname) as politika_sayisi
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname like 'panorama_%'
group by c.relname, c.relrowsecurity
order by c.relname;
