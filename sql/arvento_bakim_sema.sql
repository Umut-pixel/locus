-- =============================================================================
-- arac_bakim — Arvento filo bakım/servis kayıtları
-- =============================================================================
--
-- Kaynak: Arvento Service API
--   POST https://ws.arvento.com/api/v1/FleetReport/Maintenance
-- n8n workflow: backend/n8n/Arvento Arac Takibi.json (günde 1x, 05:07 TR).
--
-- ⚠ BU TABLO BUGÜN BOŞ ÇALIŞACAK. 2026-09-14 canlı testinde Maintenance ucu
-- HTTP 200 dönüyor ama her sorguda List: [] — Arvento'ya hiç bakım kaydı
-- girilmemiş. Boru hattı bilerek şimdiden kuruluyor ki veri girildiği gün
-- kendiliğinden dolsun.
--
-- ⚠ ALAN FORMATLARI DOĞRULANMADI. Kayıt olmadığı için şunların hiçbiri canlı
-- veriyle teyit edilemedi:
--   - RecordNo global unique mi, yoksa araç bazında mı tekrar ediyor?
--   - Km / PlannedKm / Amount string dönüyor — ondalık ayırıcı virgül mü nokta
--     mı? Amount içinde "TL"/"₺" geçiyor mu?
--   - StartDate/EndDate/PlannedDate yanıtta hangi formatta (istekteki gibi
--     yyyyMMddHHmmss mi, "13.09.2026" mi)?
--   - Type alanının alabildiği değerler neler?
--   - Planlanmış (henüz yapılmamış) bakımlar da dönüyor mu?
-- Bu yüzden ham_kayit jsonb NOT NULL: API'nin döndürdüğü satır olduğu gibi
-- saklanıyor. İlk gerçek kayıt geldiğinde parse mantığı düzeltilip tablo
-- ham_kayit üzerinden VERİ KAYBI OLMADAN yeniden üretilebilir.
--
-- kayit_no = RecordNo birincil anahtar varsayımı. Global unique olmadığı
-- ortaya çıkarsa PK (plaka, kayit_no) bileşiğine çevrilecek — o güne kadar
-- upsert anahtarı olarak bu kullanılıyor.
--
-- İstek/yanıt alan adı tutarsızlığı (swagger + canlı test): İSTEKTE
-- "LicencePlate" (c ile), YANITTA "LicensePlate" (s ile). n8n normalize
-- katmanı ikisini de biliyor.
--
-- Tarih aralığı kısıtı: {"StartDate":"20250101000000","EndDate":"20261231000000"}
-- (1,5 yıl) -> Status 1012 "InvalidDateInterval". 3 aylık pencere kabul ediliyor.
-- n8n son 24 ayı 3'er aylık 8 pencereye bölüp sırayla çekiyor.
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- =============================================================================

create table if not exists public.arac_bakim (
    kayit_no           integer primary key,
    plaka              text,
    node               text,
    tip                text,
    firma              text,
    not_metni          text,
    baslangic_tarihi   date,
    bitis_tarihi       date,
    planlanan_tarih    date,
    km                 numeric(12,3),
    planlanan_km       numeric(12,3),
    tutar              numeric(14,2),
    ham_kayit          jsonb not null,
    guncellendi        timestamptz not null default now()
);

comment on table public.arac_bakim is
  'Arvento filo bakım kayıtları — bkz. sql/arvento_bakim_sema.sql başlığı. 2026-09-14 itibarıyla Arvento''da hiç kayıt yok, tablo boş çalışıyor. Alan formatları doğrulanmamıştır.';
comment on column public.arac_bakim.kayit_no is
  'API''nin RecordNo alanı, upsert anahtarı. GLOBAL UNIQUE OLDUĞU DOĞRULANMADI — araç bazında tekrar ediyorsa PK (plaka, kayit_no) yapılmalı.';
comment on column public.arac_bakim.ham_kayit is
  'API''nin döndürdüğü satırın TAMAMI. Parse edilen kolonlar (km/tutar/tarihler) doğrulanmamış varsayımlara dayandığı için orijinal burada tutuluyor — yanlış çıkarsa buradan yeniden üretilir.';
comment on column public.arac_bakim.tutar is
  'Amount alanının sayıya çevrilmiş hali. API string döndürüyor; ondalık ayırıcı ve para birimi eki DOĞRULANMADI, ham_kayit''e bakılmalı.';
comment on column public.arac_bakim.km is
  'Km alanının sayıya çevrilmiş hali. Aynı belirsizlik tutar için geçerli — bkz. ham_kayit.';
comment on column public.arac_bakim.plaka is
  'Yanıttaki LicensePlate (s ile), normalize edilmiş (upper + boşluksuz). İstekteki alan adı LicencePlate (c ile) — API tutarsızlığı.';
comment on column public.arac_bakim.node is
  'arvento_araclar''dan plaka üzerinden çözülen cihaz id''si. Plaka eşleşmezse null kalır — FK yok, bakım kaydı araçtan bağımsız yaşayabilmeli.';

create index if not exists arac_bakim_plaka_idx
  on public.arac_bakim (plaka);
create index if not exists arac_bakim_planlanan_tarih_idx
  on public.arac_bakim (planlanan_tarih)
  where planlanan_tarih is not null;   -- "yaklaşan bakımlar" sorgusu

alter table public.arac_bakim enable row level security;

do $$ begin
  create policy "arac_bakim_select_public"
    on public.arac_bakim for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

grant select on public.arac_bakim to anon, authenticated;
grant select, insert, update on public.arac_bakim to service_role;

do $$ begin
  grant select on public.arac_bakim to locus_agent_ro;
  drop policy if exists agent_ro_select on public.arac_bakim;
  create policy agent_ro_select
    on public.arac_bakim for select to locus_agent_ro using (true);
exception when undefined_object then null;
end $$;
