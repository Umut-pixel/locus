-- =============================================================================
-- arvento_araclar — Arvento GPS filo kaydı + rota aracı eşlemesi
-- =============================================================================
--
-- Kaynak: Arvento Service API
--   GET https://ws.arvento.com/api/v1/vehicle   (Authorization: sid {sessionId})
-- n8n workflow: backend/n8n/Arvento Arac Takibi.json (günde 1x, 05:07 TR).
--
-- Neden ayrı tablo: araclar tablosu FİLO TANIMI (kapasite, istiap, ehliyet
-- sınıfı — bkz. sql/araclar_sema.sql). Bu tablo ise CİHAZ KAYDI: Arvento'da
-- hangi GPS node'u hangi plakaya bağlı. İkisi bire bir örtüşmüyor (aşağıya bak),
-- bu yüzden birleştirilmiyor — arac_kod ile gevşek bağlanıyorlar.
--
-- Neden zorunlu: /v1/vehicle/lastEvents (konum ucu) YALNIZ Node döndürüyor,
-- plaka/sürücü döndürmüyor. lastEventsIgnition ve lastEventsV2 (plaka + sürücü
-- + kontak veren zengin uçlar) 2026-09-14 testinde "Bu servisi kullanmaya
-- yetkiniz yoktur" döndü — sözleşmemizde kapalı. Dolayısıyla konum satırını
-- plakayla eşleştirmenin TEK yolu bu tablo.
--
-- 2026-09-14 canlı Postman testinde doğrulanan 8 araç:
--   C11L00030370  34PDV735    GAMZE SAĞIR          OTOMOBIL
--   C11L00030371  34PDV731    TAMER ÇELİK          OTOMOBIL
--   C11L00030372  35ASM899    PATİGO SEVKİYAT 1    OTOMOBIL   <- sevkiyat
--   C11L00030373  34UBB75     PATİGO SEVKİYAT 2    KAMYON     <- sevkiyat
--   C11L00030374  34PDV732    DERYA YAYLA          OTOMOBIL
--   C11L00030375  42ENL50     PATİGO SEVKİYAT 3    KAMYON     <- sevkiyat
--   C11L00030376  34 PDV 736  ANIL BÖBEŞ           OTOMOBIL
--   C11L00030377  34PDV733    (sürücü atanmamış)   OTOMOBIL
--
-- AÇIK SORU (Melih'e): bizim araclar tablomuzda 4 rota aracı var (kangoo 800 kg
-- /B, transit 2.000 kg/B, npr10 6.600 kg/C, isuzu3d 8.800 kg/C), Arvento'da ise
-- 3 sevkiyat aracı (1 OTOMOBIL + 2 KAMYON). 4. rota aracında cihaz yok mu, yoksa
-- şahıs aracı görünen 5 araçtan biri mi sevkiyatta kullanılıyor?
--
-- arac_kod NULL BAŞLAR VE ELLE DOLDURULUR. Otomatik eşleme bilerek yapılmıyor:
-- API araç sınıfını yalnız "OTOMOBIL"/"KAMYON" olarak veriyor, hangi kamyonun
-- NPR 10 hangisinin 3D olduğunu bilmiyor. CLAUDE.md'deki "ilçe boşsa tahmin
-- etme — yanlış eşleşme riski yüksek" kuralının aynı mantığı.
--
-- plaka normalize: API tutarsız döndürüyor — 7 araç bitişik ("34PDV735"),
-- 1 araç boşluklu ("34 PDV 736"). n8n upper() + boşluk silerek yazıyor, orijinal
-- plaka_ham'da duruyor. plaka üzerinde UNIQUE var çünkü Node'un cihaz
-- değişiminde sabit kalıp kalmadığı Arvento'ya soruldu, cevap gelmedi — plaka
-- ikincil kimlik olarak korunuyor.
--
-- CompanyName / ChassisNumber şemada YOK: /v1/vehicle bu iki alanı swagger'da
-- tanımlı olmasına rağmen hiç döndürmüyor (2026-09-14 testi).
-- grup / ekip alanları API'de var ama 8 aracın hepsinde boş string geliyor.
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- =============================================================================

create table if not exists public.arvento_araclar (
    node         text primary key,
    plaka        text not null,
    plaka_ham    text,
    surucu       text,
    arac_sinifi  text,
    grup         text,
    ekip         text,
    arac_kod     text references public.araclar(kod) on delete set null,
    aktif        boolean not null default true,
    ilk_gorulme  timestamptz not null default now(),
    son_gorulme  timestamptz not null default now(),
    constraint arvento_araclar_plaka_key unique (plaka)
);

comment on table public.arvento_araclar is
  'Arvento GPS cihaz kaydı — bkz. sql/arvento_arac_sema.sql başlığı. Konum tabloları yalnız node tutar, plaka/sürücü buradan join edilir.';
comment on column public.arvento_araclar.node is
  'Arvento cihaz id''si (ör. "C11L00030372"). lastEvents yanıtındaki tek kimlik alanı. Cihaz değişiminde sabit kalıp kalmadığı Arvento''ya soruldu, teyit gelmedi.';
comment on column public.arvento_araclar.plaka is
  'Normalize plaka: büyük harf, boşluksuz ("34PDV736"). UNIQUE — Node değişirse aracı bundan yakalarız.';
comment on column public.arvento_araclar.plaka_ham is
  'API''nin döndürdüğü orijinal plaka ("34 PDV 736"). Normalize hatalıysa buradan geri dönülür.';
comment on column public.arvento_araclar.arac_kod is
  'araclar(kod) eşlemesi — ELLE doldurulur, otomatik tahmin YOK. NULL ise bu araç rota planına dahil değil, yalnız konumu izlenir.';
comment on column public.arvento_araclar.arac_sinifi is
  'API''nin VehicleClass alanı — yalnız "OTOMOBIL"/"KAMYON" ayrımı veriyor, model bilgisi yok.';
comment on column public.arvento_araclar.grup is
  'API''nin NodeGroup alanı. 2026-09-14 testinde 8 aracın hepsinde boş — /v1/vehicle/groups ucu da hesapta kapalı, gruplandırma yapılmamış.';
comment on column public.arvento_araclar.son_gorulme is
  'Aracın /v1/vehicle listesinde EN SON görüldüğü an. Listeden düşen araç aktif=false yapılmaz, bu alan bayatlar.';

create index if not exists arvento_araclar_arac_kod_idx
  on public.arvento_araclar (arac_kod)
  where arac_kod is not null;   -- v_arac_konum_son join'i ve rota sayfası bu yolu kullanır

alter table public.arvento_araclar enable row level security;

do $$ begin
  create policy "arvento_araclar_select_public"
    on public.arvento_araclar for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

-- arac_kod eşlemesi uygulamadan/Studio'dan elle yapılacağı için authenticated'a
-- UPDATE veriliyor; INSERT/DELETE yok — araç listesinin sahibi n8n.
do $$ begin
  create policy "arvento_araclar_update_authenticated"
    on public.arvento_araclar for update to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

grant select on public.arvento_araclar to anon, authenticated;
grant update (arac_kod, aktif) on public.arvento_araclar to authenticated;
grant select, insert, update on public.arvento_araclar to service_role;

do $$ begin
  grant select on public.arvento_araclar to locus_agent_ro;
  drop policy if exists agent_ro_select on public.arvento_araclar;
  create policy agent_ro_select
    on public.arvento_araclar for select to locus_agent_ro using (true);
exception when undefined_object then null;
end $$;
