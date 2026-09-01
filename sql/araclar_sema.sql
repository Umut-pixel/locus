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
--
-- max_kg TAHMİNİ — ruhsat istiap haddi henüz teyit edilmedi. Kritik, çünkü
-- ortalama çuval 14,56 kg: 60 çuval = 874 kg, Kangoo bunu taşıyamaz. Yani
-- küçük araçlarda hacim dolmadan AĞIRLIK doluyor. max_kg_teyitli=false olan
-- satır UI'da sarı "tahmini" rozetiyle gösterilir.
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

comment on table public.araclar is
  'Filo tanımı. ERP''de araç verisi olmadığı için tek kaynak burası — bkz. sql/araclar_sema.sql başlığı.';
comment on column public.araclar.cuval_kapasite is
  'Hacim kapasitesi, çuval cinsinden. 1 palet = 60 çuval (Melih).';
comment on column public.araclar.max_kg is
  'Ruhsat istiap haddi. max_kg_teyitli=false ise TAHMİN — planlama uyarı ile gösterir.';

alter table public.araclar enable row level security;

do $$ begin
  create policy "araclar_select_public"
    on public.araclar for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

grant select, insert, update, delete on public.araclar
  to anon, authenticated, service_role;

-- Seed — mevcut satır KORUNUR (kapasite/istiap elle düzeltilmiş olabilir)
insert into public.araclar
    (kod, ad, cuval_kapasite, palet_kapasite, max_kg, max_kg_teyitli, sira, not_metni)
values
    ('kangoo',  'Renault Kangoo',  60, 1,  800.0, false, 1,
     'Tahmini istiap. 60 çuval × 14,56 kg = 874 kg — ağırlık hacimden önce doluyor.'),
    ('transit', 'Ford Transit',   180, 3, 1500.0, false, 2,
     'Tahmini istiap. 180 çuval = 2.621 kg, istiap haddinin çok üstünde.'),
    ('npr10',   'Isuzu NPR 10',   360, 6, 5000.0, false, 3,
     'Tahmini istiap. 6 palet × 60 çuval.'),
    ('isuzu3d', 'Isuzu 3D',       480, 8, 7000.0, false, 4,
     'Tahmini istiap. 8 palet × 60 çuval.')
on conflict (kod) do nothing;

do $$ begin
  grant select on public.araclar to locus_agent_ro;
  drop policy if exists agent_ro_select on public.araclar;
  create policy agent_ro_select
    on public.araclar for select to locus_agent_ro using (true);
exception when undefined_object then null;
end $$;

-- =============================================================================
-- Melih ruhsat bilgilerini verince
-- =============================================================================
--
-- update public.araclar set max_kg = 750, max_kg_teyitli = true,
--        not_metni = null, guncellendi = now()
--  where kod = 'kangoo';
