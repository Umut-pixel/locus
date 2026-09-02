-- =============================================================================
-- soforler — şoför kadrosu ve ehliyet sınıfı
-- =============================================================================
--
-- Neden var: günlük filo araç sayısıyla değil, ŞOFÖR sayısıyla sınırlı.
-- Melih (2026-09-02) 3 şoför bildirdi; kadro 2026-09-02'de isimlendirildi:
--
--   Mehmet Baylav      C  → tüm araçlar
--   Muzaffer Günüşen   C  → tüm araçlar
--   Ramazan Türkkan    B  → yalnız Kangoo ve Transit
--
-- EHLİYET SINIFI KAPSAYICIDIR: C ehliyeti B'yi de kapsar. Yani C şoförü
-- gerektiğinde Kangoo/Transit'e de biner, B şoförü Isuzu'ya binemez. (İlk
-- kurulumda sınıflar birbirine kapalı modellenmişti; isimler gelince
-- düzeltildi — Mehmet ve Muzaffer "tüm araçları" kullanıyor.)
--
-- Planlamaya etkisi:
--   * Günde en fazla 3 araç (3 şoför).
--   * En fazla 2 Isuzu — yalnız Mehmet ve Muzaffer sürebiliyor.
--   * Kangoo ile Transit AYNI GÜN çıkabilir (biri Ramazan'a, biri C şoförüne).
--
-- Bu kısıt olmadan planlayıcı 4 aracı da doldurur; üretilen plan kâğıtta
-- geçerli, sahada uygulanamaz olur.
--
-- Takograf: Isuzu'larda cihaz var — kesintisiz 4,5 saat sürüşten sonra en az
-- yarım saat mola. Araç bazlı bilgi `araclar.takograf` kolonunda.
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent (seed on conflict do nothing).
-- =============================================================================

create table if not exists public.soforler (
    kod            text primary key,
    ad             text not null,
    -- Sürebildiği EN ÜST sınıf. 'C' → tüm araçlar (B'yi kapsar),
    -- 'B' → yalnız Kangoo/Transit.
    ehliyet_sinifi text not null check (ehliyet_sinifi in ('B', 'C')),
    aktif          boolean not null default true,
    sira           integer not null default 0,
    not_metni      text,
    guncellendi    timestamptz not null default now()
);

comment on table public.soforler is
  'Şoför kadrosu. Günlük araç sayısını bu tablo sınırlar — sınıf başına aktif şoför kadar araç planlanabilir.';
comment on column public.soforler.ehliyet_sinifi is
  'Sürebildiği en üst sınıf. C tüm araçları kapsar (B dahil); B yalnız Kangoo/Transit.';

create index if not exists soforler_aktif_sinif_idx
  on public.soforler (ehliyet_sinifi) where aktif;

alter table public.soforler enable row level security;

do $$ begin
  create policy "soforler_select_public"
    on public.soforler for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

grant select, insert, update, delete on public.soforler
  to anon, authenticated, service_role;

-- Seed — mevcut satır KORUNUR
insert into public.soforler (kod, ad, ehliyet_sinifi, sira, not_metni)
values
    ('mehmet-baylav',    'Mehmet Baylav',    'C', 1, 'Tüm araçlar.'),
    ('muzaffer-gunusen', 'Muzaffer Günüşen', 'C', 2, 'Tüm araçlar.'),
    ('ramazan-turkkan',  'Ramazan Türkkan',  'B', 3, 'Yalnız Kangoo ve Transit.')
on conflict (kod) do nothing;

-- İlk kurulumdaki isimsiz yer tutucular (varsa) temizlenir.
delete from public.soforler where kod in ('sofor-b1', 'sofor-c1', 'sofor-c2');

do $$ begin
  grant select on public.soforler to locus_agent_ro;
  drop policy if exists agent_ro_select on public.soforler;
  create policy agent_ro_select
    on public.soforler for select to locus_agent_ro using (true);
exception when undefined_object then null;
end $$;
