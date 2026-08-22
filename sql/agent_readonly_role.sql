-- =============================================================================
-- locus_agent_ro — AI agent'in salt-okunur veritabani rolu
-- =============================================================================
--
-- NEDEN
--   Agent, LLM'in urettigi SQL'i calistiriyor. Prompt ve uygulama katmanindaki
--   dogrulama (agent/tools/sql_guard.py) teorik olarak atlatilabilir; bu yuzden
--   ASIL sinir veritabaninin kendisinde olmali.
--
-- ⚠️  BU DOSYANIN 1. SURUMU HATALIYDI. Neden onemli:
--
--   `musteriler_rapor` ve `musteriler_harita` view'lari
--   `with (security_invoker = true)` ile tanimli (bkz.
--   sql/raporlama_view_koordinatsiz.sql). Bu, view'i SORGULAYAN rolun:
--     (a) alttaki TABLOLARA da SELECT hakkina sahip olmasini,
--     (b) o tablolarin RLS politikalari tarafindan KAPSANMASINI
--   gerektirir.
--
--   Mevcut RLS politikalari yalnizca `anon, authenticated` rollerini kapsiyor.
--   `locus_agent_ro` bunlarin hicbiri degil. Sonuc:
--     - Tablo grant'i yoksa  -> "permission denied for table musteriler"
--     - Grant var ama politika yoksa -> SESSIZCE 0 SATIR
--
--   Ikincisi daha tehlikeli: sorgu basarili gorunur, agent "veri yok" der,
--   kullanici veriyi kayip sanir. Asagidaki 4. ve 5. bolumler bunu cozuyor.
--
-- KABUL EDILEN TAKAS
--   security_invoker zinciri yuzunden `locus_agent_ro`'ya ham tablolara da
--   (musteriler, musteri_yaslandirma, musteri_belge_ozet) SELECT vermek
--   gerekiyor. Bu, veritabani seviyesinde ham tablo erisimi demek.
--   Kabul edilebilir cunku:
--     - Ayni veri zaten view uzerinden gorunuyor, ek ifsa yok
--     - agent/tools/sql_guard.py ham tablo adlarini reddediyor (test edildi:
--       raw-table-musteriler, join-to-raw, subquery-raw, lateral-raw)
--     - Listede OLMAYAN tablolar erisilemez kalir: entity_notlar,
--       musteri_favoriler, potansiyel_*, yukleme_loglari, panorama_sync_runs
--
-- ONEMLI
--   Bolum 6'daki view listesi agent/tools/sql_guard.py:ALLOWED_RELATIONS ile
--   AYNI olmali. Biri degisirse digeri de degismeli.
--
-- UYGULAMA
--   1. Once  sql/agent_role_diagnostic.sql  calistir, mevcut durumu gor.
--   2. Bu dosyayi Supabase SQL Editor'de calistir (idempotent).
--   3. Sonra en alttaki DOGRULAMA sorgularini locus_agent kullanicisiyla dene.
-- =============================================================================


-- 1) Rol ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'locus_agent_ro') then
    create role locus_agent_ro nologin;
  end if;
end
$$;


-- 2) Giris yapabilen kullanici ------------------------------------------------
-- Supabase panelinde "kullaniciyi role bagla" arayuzu yok; SQL ile yapiyoruz.
-- ⚠️  PAROLAYI DEGISTIR. Bu parola agent/.env icindeki AGENT_DB_URL'e girecek.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'locus_agent') then
    create user locus_agent with password 'BURAYA_GUCLU_PAROLA_YAZ';
  end if;
end
$$;

grant locus_agent_ro to locus_agent;


-- 3) Oturum kisitlari ---------------------------------------------------------
-- Islem seviyesinde read-only: yazma denemesi rol seviyesinde hata verir.
alter role locus_agent_ro set default_transaction_read_only = on;
alter role locus_agent_ro set statement_timeout = '10s';
alter role locus_agent_ro set idle_in_transaction_session_timeout = '30s';
alter role locus_agent_ro set search_path = 'public';

-- Ayni kisitlar giris yapan kullaniciya da uygulanmali: rol ayarlari
-- (rolconfig) uyelik uzerinden MIRAS ALINMAZ.
alter role locus_agent set default_transaction_read_only = on;
alter role locus_agent set statement_timeout = '10s';
alter role locus_agent set idle_in_transaction_session_timeout = '30s';
alter role locus_agent set search_path = 'public';


-- 4) Varsayilan olarak HICBIR SEY ---------------------------------------------
-- Once her seyi geri al, sonra tek tek ver. Yeni bir tablo eklendiginde agent
-- otomatik erisim KAZANMAZ.
revoke all on all tables in schema public from locus_agent_ro;
revoke all on all sequences in schema public from locus_agent_ro;
revoke all on all functions in schema public from locus_agent_ro;
revoke all on schema public from locus_agent_ro;

grant usage on schema public to locus_agent_ro;


-- 5) security_invoker zinciri: alttaki tablolara SELECT ------------------------
-- musteriler_rapor / musteriler_harita bunlardan besleniyor.
-- Bunlar OLMADAN view sorgusu "permission denied" verir.
grant select on public.musteriler           to locus_agent_ro;
grant select on public.musteri_yaslandirma  to locus_agent_ro;
grant select on public.musteri_belge_ozet   to locus_agent_ro;


-- 6) RLS politikalari — locus_agent_ro'yu kapsayacak sekilde ------------------
-- Mevcut politikalar yalnizca anon/authenticated'i kapsiyor. Bunlar olmadan
-- sorgu basarili olur ama 0 SATIR doner (sessiz hata).
--
-- `using (true)` mevcut politikalarla ayni: bu tablolarda satir bazli
-- filtreleme zaten yok, politika sadece rol kapisi gorevinde.
do $$
declare
  t text;
begin
  foreach t in array array[
    'musteriler', 'musteri_yaslandirma', 'musteri_belge_ozet',
    'urun_skt', 'musteri_metrik_gecmis'
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
  end loop;
end
$$;


-- 7) Agent'in gorebilecegi view'lar -------------------------------------------
-- agent/tools/sql_guard.py:ALLOWED_RELATIONS ile AYNI liste olmali.
grant select on public.musteriler_rapor                          to locus_agent_ro;
grant select on public.musteriler_harita                         to locus_agent_ro;
grant select on public.v_panorama_belge_detay_raporu_guncel      to locus_agent_ro;
grant select on public.v_panorama_sevkiyat_raporu_kup_guncel     to locus_agent_ro;
grant select on public.v_panorama_acik_fatura_vade_kup_guncel    to locus_agent_ro;
grant select on public.v_panorama_detayli_stok_raporu_guncel     to locus_agent_ro;
grant select on public.v_panorama_siparis_durum_raporu_guncel    to locus_agent_ro;
grant select on public.urun_skt                                  to locus_agent_ro;
grant select on public.musteri_metrik_gecmis                     to locus_agent_ro;
grant select on public.rapor_bolge_disi_ozet                     to locus_agent_ro;


-- 8) v_panorama_* icin ek adim GEREKEBILIR ------------------------------------
-- Bu view'lar repoda tanimli degil (Supabase'de dogrudan olusturulmus).
-- Eger security_invoker=true iseler ve panorama_* landing tablolarinda RLS
-- acikssa, asagidaki dogrulama 0 satir dondurur. O durumda landing tablolari
-- icin de ayni islem gerekir:
--
--   grant select on public.panorama_belge_detay_raporu to locus_agent_ro;
--   create policy agent_ro_select on public.panorama_belge_detay_raporu
--     for select to locus_agent_ro using (true);
--   -- (digerleri icin de ayni)
--
-- Once sql/agent_role_diagnostic.sql bolum 4/6/7 ciktisina bak.


-- 9) Gelecekteki nesneler icin otomatik grant YOK ------------------------------
-- alter default privileges BILEREK kullanilmiyor.


-- =============================================================================
-- DOGRULAMA — locus_agent kullanicisiyla baglanip calistir
-- =============================================================================
--   select current_user;                            -- locus_agent
--
--   -- Bunlar CALISMALI ve >0 satir dondurmeli:
--   select count(*) from musteriler_rapor;
--   select count(*) from musteriler_harita;
--   select count(*) from urun_skt;
--   select count(*) from musteri_metrik_gecmis;
--   select count(*) from v_panorama_belge_detay_raporu_guncel;
--   select count(*) from v_panorama_sevkiyat_raporu_kup_guncel;
--   select count(*) from v_panorama_acik_fatura_vade_kup_guncel;
--   select count(*) from v_panorama_detayli_stok_raporu_guncel;
--   select count(*) from v_panorama_siparis_durum_raporu_guncel;
--   select count(*) from rapor_bolge_disi_ozet;
--
--   ⚠️  0 satir donerse RLS politikasi eksik demektir (bolum 6/8'e bak).
--       "permission denied" alirsan grant eksik.
--
--   -- Bunlar HATA VERMELI:
--   insert into urun_skt (urun_kodu) values ('x');   -- read-only transaction
--   update musteriler set unvan = 'x';               -- read-only transaction
--   delete from musteriler;                          -- read-only transaction
--   drop table musteriler;                           -- read-only / yetki
--   select * from entity_notlar;                     -- permission denied
--   select * from musteri_favoriler;                 -- permission denied
--   select * from yukleme_loglari;                   -- permission denied
--   select * from panorama_sync_runs;                -- permission denied
-- =============================================================================
