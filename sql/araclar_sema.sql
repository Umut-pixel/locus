-- =============================================================================
-- araclar — filo tanımı
-- =============================================================================
--
-- Neden kendi tablomuz: Panorama'da araç verisi YOK. SevkiyatRaporuKup'taki
-- 1.979 belgenin hepsi aynı sahte kayıtta (plaka '35AAA3535', arac '100',
-- dagitici 'DAĞITICI'). Hangi yükün hangi araçla gittiği ERP'den çıkarılamaz.
-- Filo bilgisi müşteriden (Melih Sarıcaoğulu) sözlü geldi.
--
-- Kapasiteler Melih'in verdiği hacim rakamları: Kangoo 60 çuval, Ford Transit
-- 180 çuval, Isuzu NPR 10 = 6 palet, Isuzu 3D = 8 palet, 1 palet = 60 çuval.
-- (Melih 2026-09-02: 60 çuval/palet yalnız 15 kg için teyitli. 10 ve 12 kg
-- çuvallar da 1 çuval yeri sayılıyor — güvenli taraf, bkz. urun_olcu_sema.sql.)
--
-- max_kg artık TEYİTLİ (Melih 2026-09-02, ruhsat istiap haddi):
--   Kangoo 800 · Transit 2.000 · NPR 10 6.600 · Isuzu 3D 8.800
--
-- Ortalama çuval 14,56 kg olduğu için iki KÜÇÜK araçta ağırlık hacimden önce
-- doluyor — sistemin en değerli uyarısı bu:
--
--   Araç      Hacim   İstiap   Hacmi dolusu  Ağırlığı dolusu  Bağlayıcı
--   Kangoo     60 ç.    800 kg      874 kg        55 çuval     AĞIRLIK (%92)
--   Transit   180 ç.  2.000 kg    2.621 kg       137 çuval     AĞIRLIK (%76)
--   NPR 10    360 ç.  6.600 kg    5.242 kg       453 çuval     HACİM
--   Isuzu 3D  480 ç.  8.800 kg    6.989 kg       604 çuval     HACİM
--
-- Transit'in nominal kapasitesinin dörtte biri kâğıt üstünde: 137 çuvaldan
-- fazla 15 kg'lık mama yüklenirse ruhsat aşılıyor.
--
-- ehliyet_sinifi / takograf: günlük filo şoförle sınırlı — bkz. sql/soforler_sema.sql.
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent (seed on conflict do nothing).
-- =============================================================================

create table if not exists public.araclar (
    kod             text primary key,
    ad              text not null,
    -- Hacim kapasitesi — çuval cinsinden (1 palet = 60 çuval)
    cuval_kapasite  integer not null,
    palet_kapasite  integer,
    -- Ruhsat istiap haddi (kg). NULL ise ağırlık kısıtı hesaplanmaz.
    max_kg          numeric(8,1),
    max_kg_teyitli  boolean not null default false,
    aktif           boolean not null default true,
    sira            integer not null default 0,
    not_metni       text,
    guncellendi     timestamptz not null default now()
);

-- Şoför eşleşmesi ve takograf — tablo daha önce yaratılmışsa da eklenir.
alter table public.araclar
  add column if not exists ehliyet_sinifi text not null default 'C',
  add column if not exists takograf       boolean not null default false;

do $$ begin
  alter table public.araclar
    add constraint araclar_ehliyet_sinifi_check
    check (ehliyet_sinifi in ('B', 'C'));
exception when duplicate_object then null;
end $$;

comment on table public.araclar is
  'Filo tanımı. ERP''de araç verisi olmadığı için tek kaynak burası — bkz. sql/araclar_sema.sql başlığı.';
comment on column public.araclar.cuval_kapasite is
  'Hacim kapasitesi, çuval cinsinden. 1 palet = 60 çuval (Melih).';
comment on column public.araclar.max_kg is
  'Ruhsat istiap haddi. max_kg_teyitli=false ise TAHMİN — planlama uyarı ile gösterir.';
comment on column public.araclar.ehliyet_sinifi is
  'Aracı sürebilecek şoför sınıfı. B → Kangoo/Transit, C → Isuzu. Bkz. public.soforler.';
comment on column public.araclar.takograf is
  'Takograf cihazı var mı. Varsa 4,5 sa kesintisiz sürüşten sonra 30 dk mola zorunlu.';

alter table public.araclar enable row level security;

do $$ begin
  create policy "araclar_select_public"
    on public.araclar for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

grant select, insert, update, delete on public.araclar
  to anon, authenticated, service_role;

-- Seed — mevcut satır KORUNUR (kapasite elle düzeltilmiş olabilir)
insert into public.araclar
    (kod, ad, cuval_kapasite, palet_kapasite, max_kg, max_kg_teyitli,
     ehliyet_sinifi, takograf, sira, not_metni)
values
    ('kangoo',  'Renault Kangoo',  60, 1,  800.0, true, 'B', false, 1, null),
    ('transit', 'Ford Transit',   180, 3, 2000.0, true, 'B', false, 2, null),
    ('npr10',   'Isuzu NPR 10',   360, 6, 6600.0, true, 'C', true,  3, null),
    ('isuzu3d', 'Isuzu 3D',       480, 8, 8800.0, true, 'C', true,  4, null)
on conflict (kod) do nothing;

-- -----------------------------------------------------------------------------
-- Melih'in ruhsat teyidi (2026-09-02) — seed'in do-nothing'i eski tahminleri
-- bıraktığı için açıkça yazılır. İstiap ve ehliyet sınıfı ezilir; kapasite ve
-- ad elle düzeltilmiş olabilir, onlara dokunulmaz.
-- -----------------------------------------------------------------------------
update public.araclar set
    max_kg = v.max_kg, max_kg_teyitli = true,
    ehliyet_sinifi = v.ehliyet_sinifi, takograf = v.takograf,
    not_metni = v.not_metni, guncellendi = now()
from (values
    ('kangoo',   800.0, 'B', false,
     'Ağırlık bağlayıcı: 55 çuvaldan sonra 800 kg ruhsat sınırı doluyor (hacim 60).'),
    ('transit', 2000.0, 'B', false,
     'Ağırlık bağlayıcı: 137 çuvaldan sonra 2.000 kg ruhsat sınırı doluyor (hacim 180).'),
    ('npr10',   6600.0, 'C', true,
     'Hacim bağlayıcı: 360 çuval = 5.242 kg, istiap haddinin altında. Takograflı.'),
    ('isuzu3d', 8800.0, 'C', true,
     'Hacim bağlayıcı: 480 çuval = 6.989 kg, istiap haddinin altında. Takograflı.')
) as v(kod, max_kg, ehliyet_sinifi, takograf, not_metni)
where public.araclar.kod = v.kod;

do $$ begin
  grant select on public.araclar to locus_agent_ro;
  drop policy if exists agent_ro_select on public.araclar;
  create policy agent_ro_select
    on public.araclar for select to locus_agent_ro using (true);
exception when undefined_object then null;
end $$;

-- =============================================================================
-- Filo değişirse
-- =============================================================================
--
-- Yeni araç: ehliyet_sinifi ve takograf'ı MUTLAKA doldur — planlayıcı şoför
-- eşleşmesini bu iki alandan kuruyor. Yeni bir şoför gerekiyorsa
-- sql/soforler_sema.sql'e de satır ekle, yoksa araç plana hiç girmez.
--
-- insert into public.araclar
--     (kod, ad, cuval_kapasite, palet_kapasite, max_kg, max_kg_teyitli,
--      ehliyet_sinifi, takograf, sira)
-- values ('yeni', 'Yeni Araç', 240, 4, 3500.0, true, 'C', true, 5);
