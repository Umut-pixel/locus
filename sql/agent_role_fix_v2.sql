-- =============================================================================
-- locus_agent_ro / locus_agent — DUZELTME (v2, revize 2026-08-22)
-- =============================================================================
-- Bu dosya BIR ONCEKI SURUMUN kazara calistirilmis halini de onarir.
--
-- MEVCUT DURUM (canli olcum, 2026-08-22):
--   locus_agent   : VAR, giris yapabiliyor, parola = dosyadaki placeholder,
--                   locus_agent_ro UYESI DEGIL, rol ayarlari YOK,
--                   hicbir tabloyu okuyamiyor  <- veri sizintisi yok, ama duzelt
--   locus_agent_ro: VAR, ayarlari dogru, view grantlari var,
--                   ham tablo grantlari YOK, agent_ro_select politikalari YOK
--
-- Yani onceki calistirmada yalnizca `create user` tuttu; sonrasi uygulanmadi.
--
-- ⚠️  KAZA KORUMASI
--   Asagidaki 0. bolum, parolayi degistirmeden calistirirsan HATA verir ve
--   hicbir sey degismez. Once parola uret:
--
--     LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 40; echo
--
--   Ciktiyi 0. bolumdeki 'BURAYA_YAPISTIR' yerine yaz. Ayni degeri .env
--   icindeki AGENT_DB_URL'e de koy. Sadece harf+rakam uretiliyor, boylece
--   URL'de percent-encode gerekmiyor.
-- =============================================================================


-- ── 0) Parola + kullanici durumu ───────────────────────────────────────────
do $$
declare
  yeni_parola text := 'BURAYA_YAPISTIR';
begin
  if yeni_parola = 'BURAYA_YAPISTIR' or length(yeni_parola) < 24 then
    raise exception
      'DUR: parola degistirilmemis (veya 24 karakterden kisa). Hicbir sey yapilmadi. Once parola uret ve yapistir.';
  end if;

  if exists (select 1 from pg_roles where rolname = 'locus_agent') then
    execute format('alter user locus_agent with login password %L', yeni_parola);
    raise notice 'locus_agent parolasi degistirildi.';
  else
    execute format('create user locus_agent with password %L', yeni_parola);
    raise notice 'locus_agent olusturuldu.';
  end if;
end
$$;

-- Uyelik: onceki calistirmada UYGULANMAMIS.
grant locus_agent_ro to locus_agent;

-- Rol ayarlari uyelik uzerinden MIRAS ALINMAZ — giris yapan kullaniciya da ver.
-- Yazma korumasinin asil kaynagi bu satir: default_transaction_read_only.
-- Bu satirlar olmadan agent, grant aldigi an yazabilir hale gelir.
alter role locus_agent set default_transaction_read_only = on;
alter role locus_agent set statement_timeout = '10s';
alter role locus_agent set idle_in_transaction_session_timeout = '30s';
alter role locus_agent set search_path = 'public';


-- ── 1) security_invoker zinciri: musteriler_rapor / musteriler_harita ──────
-- musteriler_rapor (invoker=true) bu ucunden besleniyor; musteriler_harita da
-- musteriler_rapor uzerinden ayni zincire bagli. GRANT olmadan iki view de
-- "permission denied for table musteriler" verir.
grant select on public.musteriler           to locus_agent_ro;
grant select on public.musteri_yaslandirma  to locus_agent_ro;
grant select on public.musteri_belge_ozet   to locus_agent_ro;


-- ── 2) v_panorama_acik_fatura_vade_kup_guncel zinciri ──────────────────────
-- Diger 4 panorama view'i SECURITY DEFINER (postgres yetkisiyle calisir);
-- bu tek view invoker, o yuzden taban tablolarina SELECT gerekiyor.
--
-- panorama_sync_runs = ice aktarma calisma kaydi (dosya adi, satir sayisi,
-- durum, zaman damgasi). Musteri verisi ICERMEZ. View'in "en son basarili
-- sync" alt sorgusu icin zorunlu. Katman 2 (sql_guard.py) adini zaten
-- reddediyor, yani agent ona dogrudan SQL yazamaz.
grant select on public.panorama_acik_fatura_vade_kup to locus_agent_ro;
grant select on public.panorama_sync_runs            to locus_agent_ro;


-- ── 3) RLS politikalari — locus_agent_ro'yu kapsat ────────────────────────
-- Mevcut politikalar yalnizca anon/authenticated hedefliyor. RLS acikken
-- kapsayan politika yoksa Postgres "deny by default" uygular: sorgu BASARILI
-- olur, 0 SATIR doner. Hata mesaji yok.
--
-- En sinsi ornek urun_skt: grant'i zaten VAR, tabloda 685 satir VAR, ama
-- politika agent'i kapsamadigi icin agent "SKT verisi yok" gorur.
do $$
declare
  t text;
begin
  foreach t in array array[
    'musteriler', 'musteri_yaslandirma', 'musteri_belge_ozet', 'urun_skt'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tablo yok, atlaniyor: %', t;
      continue;
    end if;
    execute format('drop policy if exists agent_ro_select on public.%I', t);
    execute format(
      'create policy agent_ro_select on public.%I for select to locus_agent_ro using (true)',
      t
    );
    raise notice 'Politika olusturuldu: %', t;
  end loop;
end
$$;

-- NOT: musteri_metrik_gecmis, panorama_acik_fatura_vade_kup ve
-- panorama_sync_runs politikalari zaten PUBLIC hedefli (herkesi kapsar),
-- locus_agent_ro dahil. Ek politika gerekmiyor.


-- ── 4) Yazma yetkisi olmadigini garanti et (savunma derinligi) ────────────
revoke insert, update, delete, truncate on all tables in schema public
  from locus_agent_ro;
revoke insert, update, delete, truncate on all tables in schema public
  from locus_agent;


-- =============================================================================
-- DOGRULAMA — yukaridaki blok basariyla bittikten SONRA calistir.
-- Katalogdan kesin olcum yapar; rol degistirmeye gerek yok.
-- =============================================================================
with hedef(nesne, beklenen) as (
  values
    ('musteriler_rapor','ERISEBILMELI'),
    ('musteriler_harita','ERISEBILMELI'),
    ('urun_skt','ERISEBILMELI'),
    ('musteri_metrik_gecmis','ERISEBILMELI'),
    ('v_panorama_belge_detay_raporu_guncel','ERISEBILMELI'),
    ('v_panorama_sevkiyat_raporu_kup_guncel','ERISEBILMELI'),
    ('v_panorama_acik_fatura_vade_kup_guncel','ERISEBILMELI'),
    ('v_panorama_detayli_stok_raporu_guncel','ERISEBILMELI'),
    ('v_panorama_siparis_durum_raporu_guncel','ERISEBILMELI'),
    ('v_panorama_siparis_detay_raporu_guncel','ERISEBILMELI'),
    ('v_panorama_tahsilat_raporu_guncel','ERISEBILMELI'),
    ('rapor_bolge_disi_ozet','ERISEBILMELI'),
    ('entity_notlar','ERISEMEMELI'),
    ('musteri_favoriler','ERISEMEMELI'),
    ('yukleme_loglari','ERISEMEMELI'),
    ('potansiyel_musteriler','ERISEMEMELI'),
    ('musteri_snapshotlari','ERISEMEMELI')
)
select h.nesne,
       h.beklenen,
       has_table_privilege('locus_agent','public.'||h.nesne,'SELECT') as select_var,
       case
         when h.beklenen = 'ERISEBILMELI'
              and has_table_privilege('locus_agent','public.'||h.nesne,'SELECT')
              and (not c.relrowsecurity or exists (
                    select 1 from pg_policy p
                    where p.polrelid = c.oid
                      and (p.polroles = '{0}' or 'locus_agent_ro'::regrole::oid = any(p.polroles))))
           then 'GECTI'
         when h.beklenen = 'ERISEMEMELI'
              and not has_table_privilege('locus_agent','public.'||h.nesne,'SELECT')
           then 'GECTI'
         else 'KALDI'
       end as sonuc
from hedef h
join pg_class c on c.oid = ('public.'||h.nesne)::regclass
order by sonuc desc, h.nesne;
-- BEKLENEN: 15 satirin HEPSI 'GECTI'.
-- (Bu sefer locus_agent uzerinden olculuyor — uyelik gercekten tuttu mu da
--  ayni sorguda test edilmis oluyor.)


-- Kullanici durumu + read-only korumasi
select rolname,
       rolcanlogin as giris_yapabilir,
       coalesce((select string_agg(g.rolname,', ') from pg_auth_members m
                 join pg_roles g on g.oid=m.roleid where m.member=r.oid),'(YOK!)') as uyelik,
       coalesce(array_to_string(rolconfig,' | '),'(AYAR YOK!)') as ayarlar
from pg_roles r
where rolname in ('locus_agent','locus_agent_ro')
order by rolname;
-- BEKLENEN: locus_agent -> giris=true, uyelik='locus_agent_ro',
--           ayarlar icinde default_transaction_read_only=on OLMALI.


-- Yazma yetkisi sizmis mi?
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('locus_agent','locus_agent_ro') and privilege_type <> 'SELECT';
-- BEKLENEN: 0 satir.


-- =============================================================================
-- SON ADIM — locus_agent olarak BAGLANIP calistir (SQL Editor degil).
-- Yazma korumasi ancak boyle test edilir: default_transaction_read_only
-- oturum acilirken uygulanir, SQL Editor'de postgres olarak baglisin.
-- =============================================================================
--   psql "postgresql://locus_agent:PAROLA@db.pzepnmzxrwnlhixdrgzm.supabase.co:5432/postgres"
--
--   select current_user;                            -- locus_agent
--   select count(*) from musteriler_rapor;          -- >0
--   select count(*) from urun_skt;                  -- 685 civari (0 ise RLS eksik)
--   insert into urun_skt (urun_kodu) values ('x');  -- HATA vermeli (read-only)
--   select * from entity_notlar limit 1;            -- permission denied vermeli
-- =============================================================================
