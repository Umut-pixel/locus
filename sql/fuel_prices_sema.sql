-- =============================================================================
-- fuel_prices — EPDK günlük akaryakıt fiyat geçmişi
-- =============================================================================
--
-- Kaynak: EPDK "Petrol Piyasası Bayi Satış Fiyatı Bülteni" REST API
--   GET https://apigateway.epdk.gov.tr/petrolBayiSatisFiyatBulten
-- n8n workflow: backend/n8n/EPDK Yakit Fiyat Otomasyonu.json (günde 1x, 06:00 TR).
--
-- Amaç: rota sisteminin yakıt maliyeti hesabı (distance_km * L/100km * fiyat) için
-- güvenilir, tarihsel bir fiyat kaynağı. Bu tablo yalnız EPDK'nın gerçekten
-- döndürdüğü alanları taşır — il/bayi/istasyon YOK, EPDK bu bültende vermiyor.
--
-- 2026-09-13 doğrulanan gerçek davranış (bkz. workflow'daki sticky note):
--   - Aynı tarih için birden fazla ürün satırı dönüyor (test günü: 6 satır).
--   - Bu bültende yalnız Kurşunsuz Benzin 95 Oktan + Motorin bizim filoyla
--     ilgili; kalan 4 satır endüstriyel/ısınma yakıtı (fuel oil, kalorifer,
--     gazyağı) — workflow bunları normalize etmeden atlıyor.
--   - LPG/Otogaz bu endpoint'te hiç görülmedi — muhtemelen ayrı bir EPDK LPG
--     bülteni var, doğrulanmadı. fuel_type check'i lpg'yi kabul ediyor (workflow
--     ileride eşleştirirse şema değişmesin diye) ama bugün hiç satır gelmiyor.
--   - price numeric(10,5): EPDK 5 ondalık basamakla veriyor (örn. 80.20625).
--
-- Upsert hedefi: UNIQUE (price_date, fuel_type). n8n Supabase node'unda upsert
-- operasyonu yok (kaynaktan doğrulandı) — workflow HTTP Request node ile
-- PostgREST'e ?on_conflict=price_date,fuel_type ile yazıyor. Bu constraint
-- olmadan o upsert Postgres hatasıyla düşer.
--
-- price_date ≠ fetched_at: price_date EPDK'nın verdiği fiyatın ait olduğu gün
-- (yanıttaki "Tarih" alanından), fetched_at workflow'un çalıştığı an. Eski
-- satırların üzerine yazılmıyor — yalnız aynı (price_date, fuel_type) upsert'i
-- güncelleniyor, geçmiş günler korunuyor.
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- =============================================================================

create table if not exists public.fuel_prices (
    id          bigint generated always as identity primary key,
    price_date  date not null,
    fuel_type   text not null,
    fuel_name   text not null,
    unit        text not null,
    price       numeric(10,5) not null,
    source      text not null default 'EPDK',
    fetched_at  timestamptz not null default now(),
    constraint fuel_prices_fuel_type_check check (fuel_type in ('gasoline', 'diesel', 'lpg')),
    constraint fuel_prices_price_check check (price > 0),
    constraint fuel_prices_price_date_fuel_type_key unique (price_date, fuel_type)
);

comment on table public.fuel_prices is
  'EPDK günlük yakıt fiyatı bülteni — bkz. sql/fuel_prices_sema.sql başlığı. Rota sisteminin yakıt maliyeti hesabı bu tablonun en güncel (price_date, fuel_type) satırını okur.';
comment on column public.fuel_prices.price_date is
  'Fiyatın ait olduğu tarih (EPDK yanıtındaki Tarih alanı) — istek tarihi değil, fallback günü olabilir.';
comment on column public.fuel_prices.fetched_at is
  'Workflow''un veriyi çektiği an. price_date ile karıştırılmamalı.';
comment on column public.fuel_prices.fuel_name is
  'EPDK''nın orijinal yakıt adı (ör. "Kurşunsuz Benzin 95 Oktan") — denetim/debug için, normalize edilmemiş.';

create index if not exists fuel_prices_fuel_type_date_idx
  on public.fuel_prices (fuel_type, price_date desc);

alter table public.fuel_prices enable row level security;

do $$ begin
  create policy "fuel_prices_select_public"
    on public.fuel_prices for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

-- Yazma yalnız service_role'e (n8n) — fiyat geçmişi elle silinmesin/değişmesin.
grant select on public.fuel_prices to anon, authenticated;
grant select, insert, update on public.fuel_prices to service_role;

do $$ begin
  grant select on public.fuel_prices to locus_agent_ro;
  drop policy if exists agent_ro_select on public.fuel_prices;
  create policy agent_ro_select
    on public.fuel_prices for select to locus_agent_ro using (true);
exception when undefined_object then null;
end $$;
