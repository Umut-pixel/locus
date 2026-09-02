-- =============================================================================
-- Panorama landing tarihleri: text -> date normalizasyonu (2026-09-02)
-- =============================================================================
--
-- SORUN
--   Landing tablolarindaki TUM tarih kolonlari `text` ve format tablodan
--   tabloya farkli:
--
--     panorama_belge_detay_raporu    islem/olusturma/vade  YYYY.MM.DD
--     panorama_siparis_detay_raporu  islem/olusturma/vade  YYYY.MM.DD
--     panorama_siparis_durum_raporu  islem/sevk            YYYY.MM.DD
--     panorama_tahsilat_raporu       islem/vade            DD/MM/YYYY
--     panorama_sevkiyat_raporu_kup   belge/yukleme         DD.MM.YYYY
--
--   Bu yuzden sunucu tarafinda tarih araligi filtresi IMKANSIZ. '.' (0x2E)
--   ASCII'de '-' (0x2D) karakterinden buyuk oldugu icin ISO tire ile kiyas
--   sessizce yanlis sonuc veriyor:
--
--     '2026.08.30' >= '2026-09-01'  ->  true   (!)
--     '2026.01.05' >= '2026-12-31'  ->  true   (!)
--     '31/08/2026' >= '01/09/2026'  ->  true   (!)
--
--   Olculen etki (v_panorama_siparis_detay_raporu_guncel, 2026-09-02):
--     Agustos, dogru (to_date)          2.251 satir /  33.741.225 TL
--     Agustos, ISO tire kapali aralik       0 satir /  BOS EKRAN
--     Ay basi, ISO tire >=             16.524 satir / 240.175.269 TL (1.860x)
--
--   "Onceki ayin verileri gosterilmiyor" sikayetinin kok nedeni bu.
--
-- COZUM
--   Her tarih kolonunun yanina `<kolon>_d date` GENERATED ALWAYS ... STORED
--   kolonu. Uygulama artik bu kolondan filtreliyor.
--
--   Generated column secildi (trigger degil):
--     - n8n tarafinda HICBIR degisiklik gerekmiyor; ham metin aynen yaziliyor,
--       normalizasyon DB'de oluyor. CLAUDE.md'deki "ingestion katmanini
--       kaynak-agnostik tut" kisitina uygun; Aralik 2026 DB gecisinde tasinacak
--       tek sey bu dosya.
--     - Geri doldurma otomatik: ALTER sirasinda mevcut satirlar da hesaplaniyor,
--       ayri bir UPDATE gerekmiyor.
--     - Trigger'in aksine hicbir kosulda kaynak metinle tutarsiz kalamiyor.
--
--   Bedeli: ALTER tablo yeniden yaziyor (ACCESS EXCLUSIVE). En buyuk tablo
--   panorama_siparis_detay_raporu ~228k satir; birkac saniye. Sync penceresi
--   disinda calistirin (cron 07:00/13:00/19:00 TR).
--
-- HAM METIN KOLONLARI KALDIRILMADI
--   Mevcut tuketiciler (parseIslemTarihi cagiran her yer) calismaya devam
--   etsin diye. Gecis kademeli.
--
-- CAKISMA ANAHTARI DEGISMEDI
--   n8n panorama_belge_detay_raporu icin on_conflict=unified_doc,sira,
--   islem_tarihi kullaniyor ve islem_tarihi hala text. Anahtari _d kolonuna
--   tasimak AYRI bir is; burada bilincli olarak dokunulmadi.
--
-- Idempotent: fonksiyon CREATE OR REPLACE, kolonlar IF NOT EXISTS,
-- index'ler IF NOT EXISTS, view'lar CREATE OR REPLACE.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Format-agnostik parse fonksiyonu
-- -----------------------------------------------------------------------------
--
-- Maske parametresi ALMAZ, formati kendi tespit eder. Bilincli tercih:
-- sql/README.md ve n8n notlari format kaymasinin gercek oldugunu belgeliyor
-- (Panorama ayni alani farkli cekimlerde farkli formatta verebiliyor).
-- Sabit maske, kayma aninda tum sync'i kirardi.
--
-- Deneme sirasi frontend/lib/import/parse-belge-detay.ts:22-55 icindeki
-- parseIslemTarihi ile BIREBIR ayni tutuldu -- iki taraf ayni girdide ayni
-- sonucu vermeli.
--
-- to_date DEGIL make_date kullaniliyor: to_date musamahakar, '2026.02.31'
-- degerini sessizce 2026-03-03'e kaydirir. make_date gecersiz tarihte hata
-- firlatir, exception bloguyla null'a cevriliyor. Bu, TS tarafindaki
-- makeIso roundtrip dogrulamasinin (parse-belge-detay.ts:57-67) karsiligi.
create or replace function public.panorama_tarihe_cevir(p_deger text)
returns date
language plpgsql
immutable
returns null on null input
as $fn$
declare
  s text := btrim(p_deger);
  m text[];
begin
  if s = '' then
    return null;
  end if;

  -- YYYY.MM.DD  (belge detay, siparis detay, siparis durum)
  m := regexp_match(s, '^(\d{4})\.(\d{1,2})\.(\d{1,2})$');
  if m is not null then
    return make_date(m[1]::int, m[2]::int, m[3]::int);
  end if;

  -- DD.MM.YYYY  (sevkiyat kup)
  m := regexp_match(s, '^(\d{1,2})\.(\d{1,2})\.(\d{4})$');
  if m is not null then
    return make_date(m[3]::int, m[2]::int, m[1]::int);
  end if;

  -- YYYY-MM-DD  (ISO; zaman eki varsa yok sayilir)
  m := regexp_match(s, '^(\d{4})-(\d{2})-(\d{2})');
  if m is not null then
    return make_date(m[1]::int, m[2]::int, m[3]::int);
  end if;

  -- DD/MM/YYYY  (tahsilat)
  m := regexp_match(s, '^(\d{1,2})/(\d{1,2})/(\d{4})$');
  if m is not null then
    return make_date(m[3]::int, m[2]::int, m[1]::int);
  end if;

  -- YYYY/MM/DD
  m := regexp_match(s, '^(\d{4})/(\d{1,2})/(\d{1,2})$');
  if m is not null then
    return make_date(m[1]::int, m[2]::int, m[3]::int);
  end if;

  return null;
exception
  -- make_date gecersiz tarihte (31 Subat, 13. ay) hata firlatir.
  -- Bozuk TEK satir asla insert'i dusurmesin.
  when others then
    return null;
end;
$fn$;

comment on function public.panorama_tarihe_cevir(text) is
  'Panorama metin tarihini date tipine cevirir; format otomatik tespit edilir, taninmayan/gecersiz deger null doner. TS karsiligi: parseIslemTarihi.';


-- -----------------------------------------------------------------------------
-- 2. Turetilmis date kolonlari
-- -----------------------------------------------------------------------------

alter table public.panorama_belge_detay_raporu
  add column if not exists islem_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(islem_tarihi)) stored,
  add column if not exists olusturma_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(olusturma_tarihi)) stored,
  add column if not exists vade_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(vade_tarihi)) stored;

alter table public.panorama_siparis_detay_raporu
  add column if not exists islem_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(islem_tarihi)) stored,
  add column if not exists olusturma_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(olusturma_tarihi)) stored,
  add column if not exists vade_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(vade_tarihi)) stored;

alter table public.panorama_siparis_durum_raporu
  add column if not exists islem_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(islem_tarihi)) stored,
  add column if not exists sevk_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(sevk_tarihi)) stored;

alter table public.panorama_tahsilat_raporu
  add column if not exists islem_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(islem_tarihi)) stored,
  add column if not exists vade_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(vade_tarihi)) stored;

alter table public.panorama_sevkiyat_raporu_kup
  add column if not exists belge_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(belge_tarihi)) stored,
  add column if not exists yukleme_tarihi_d date
    generated always as (public.panorama_tarihe_cevir(yukleme_tarihi)) stored;


-- -----------------------------------------------------------------------------
-- 3. Index'ler
-- -----------------------------------------------------------------------------
--
-- Uygulama sorgusunun sekli daima ayni:
--   where sync_id = <son completed> and <tarih>_d >= bas and <tarih>_d < bitis
-- Bu yuzden bilesik (sync_id, tarih_d). Adlandirma sql/panorama_landing_index.sql
-- desenini izliyor. CONCURRENTLY yok -- ayni gerekce (Supabase SQL Editor tek
-- transaction).
create index if not exists idx_belge_detay_sync_islem_tarihi
  on public.panorama_belge_detay_raporu (sync_id, islem_tarihi_d);

create index if not exists idx_siparis_detay_sync_islem_tarihi
  on public.panorama_siparis_detay_raporu (sync_id, islem_tarihi_d);

create index if not exists idx_siparis_durum_sync_islem_tarihi
  on public.panorama_siparis_durum_raporu (sync_id, islem_tarihi_d);

create index if not exists idx_tahsilat_sync_islem_tarihi
  on public.panorama_tahsilat_raporu (sync_id, islem_tarihi_d);

create index if not exists idx_sevkiyat_kup_sync_belge_tarihi
  on public.panorama_sevkiyat_raporu_kup (sync_id, belge_tarihi_d);


-- -----------------------------------------------------------------------------
-- 4. View'lari yeni kolonlari yayinlayacak sekilde tazele
-- -----------------------------------------------------------------------------
--
-- Bes view'in de kolon SIRASI kaynak tablosuyla birebir ayni oldugu icin
-- (2026-09-02'de dogrulandi) acik kolon listesi yerine m.* kullanilabiliyor;
-- yeni _d kolonlari sona ekleniyor, mevcut kolon sirasi bozulmuyor.
--
-- DROP DEGIL CREATE OR REPLACE: v_siparis_satir_yuk,
-- v_panorama_siparis_detay_raporu_guncel'e bagimli. DROP onu da dusururdu.

create or replace view public.v_panorama_belge_detay_raporu_guncel as
  select m.*
  from public.panorama_belge_detay_raporu m
  where m.sync_id = (
    select r.id from public.panorama_sync_runs r
    where r.durum = 'completed' and r.report_id = 5450
    order by r.cekildi_at desc limit 1
  );

create or replace view public.v_panorama_siparis_detay_raporu_guncel as
  select m.*
  from public.panorama_siparis_detay_raporu m
  where m.sync_id = (
    select r.id from public.panorama_sync_runs r
    where r.durum = 'completed' and r.report_id = 5451
    order by r.cekildi_at desc limit 1
  );

create or replace view public.v_panorama_siparis_durum_raporu_guncel as
  select m.*
  from public.panorama_siparis_durum_raporu m
  where m.sync_id = (
    select r.id from public.panorama_sync_runs r
    where r.durum = 'completed' and r.report_id = 5140
    order by r.cekildi_at desc limit 1
  );

create or replace view public.v_panorama_tahsilat_raporu_guncel as
  select m.*
  from public.panorama_tahsilat_raporu m
  where m.sync_id = (
    select r.id from public.panorama_sync_runs r
    where r.durum = 'completed' and r.report_id = 5230
    order by r.cekildi_at desc limit 1
  );

create or replace view public.v_panorama_sevkiyat_raporu_kup_guncel as
  select m.*
  from public.panorama_sevkiyat_raporu_kup m
  where m.sync_id = (
    select r.id from public.panorama_sync_runs r
    where r.durum = 'completed' and r.report_id = 5130
    order by r.cekildi_at desc limit 1
  );


-- -----------------------------------------------------------------------------
-- 5. Dogrulama
-- -----------------------------------------------------------------------------
--
-- Parse kapsamasi: her satir cevrilebilmis olmali. Sifir DISI bir sonuc,
-- panorama_tarihe_cevir'de eksik bir format var demektir.
--
--   select 'belge_detay' t,
--          count(*) filter (where islem_tarihi is not null and islem_tarihi_d is null) cevrilemeyen
--     from public.panorama_belge_detay_raporu
--   union all select 'siparis_detay',
--          count(*) filter (where islem_tarihi is not null and islem_tarihi_d is null)
--     from public.panorama_siparis_detay_raporu
--   union all select 'siparis_durum',
--          count(*) filter (where islem_tarihi is not null and islem_tarihi_d is null)
--     from public.panorama_siparis_durum_raporu
--   union all select 'tahsilat',
--          count(*) filter (where islem_tarihi is not null and islem_tarihi_d is null)
--     from public.panorama_tahsilat_raporu
--   union all select 'sevkiyat_kup',
--          count(*) filter (where belge_tarihi is not null and belge_tarihi_d is null)
--     from public.panorama_sevkiyat_raporu_kup;
--
-- Bilinen dogru sonuclar (2026-09-02 olcumu):
--   v_panorama_siparis_detay_raporu_guncel, islem_tarihi_d 2026-08-01..08-31
--     -> 2.251 satir / sum(nettutar::numeric) = 33.741.225 TL
--   v_panorama_siparis_detay_raporu_guncel, islem_tarihi_d = 2026-08-30
--     -> 4 satir, hepsi siparis_no 26002 (FLOWER PET SHOP)
-- =============================================================================
