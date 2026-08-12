-- Delta: BelgeDetayRaporu müşteri aggregate + harita view genişletmesi
-- Uygula: Supabase SQL Editor veya MCP apply_migration

create table if not exists public.musteri_belge_ozet (
    musteri_kodu      text primary key references public.musteriler (musteri_kodu) on delete cascade,
    donem_bas         date,
    donem_bit         date,
    satir_sayisi      integer not null default 0,
    siparis_sayisi    integer not null default 0,
    fatura_sayisi     integer not null default 0,
    net_ciro          numeric(16,2) not null default 0,
    brut_ciro         numeric(16,2) not null default 0,
    iskonto_toplam    numeric(16,2) not null default 0,
    promo_satir       integer not null default 0,
    iptal_satir       integer not null default 0,
    son_islem_tarihi  date,
    vade_gunu         integer,
    top_urun_grup     text,
    son_urun_grup     text,
    top_urun          text,
    son_urun          text,
    st_adi            text,
    st_kodu           text,
    guncellendi       timestamptz not null default now()
);

alter table public.musteri_belge_ozet enable row level security;

do $$ begin
  create policy "musteri_belge_ozet_select_public"
    on public.musteri_belge_ozet
    for select
    to anon, authenticated
    using (true);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- musteriler_harita VIEW tanimi BILEREK BURADAN KALDIRILDI (2026-08-11, K7).
--
-- Bu dosya daha once view'in tam bir kopyasini icierdi. Ayni tanimin 4 ayri
-- kopyasi vardi (sema.sql, sql/yaslandirma_sema.sql, sql/belge_ozet_sema.sql,
-- supabase_yukle.py) ve migration sirasi olmadigi icin "en son calistirilan"
-- prod'u tanimliyordu. Pratikte bu, sema.sql'de yapilan bir duzeltmenin bu
-- dosyanin yeniden calistirilmasiyla sessizce geri alinmasi demekti.
--
-- TEK KAYNAK:  sema.sql  (ve son degisiklik: sql/risk_durumu_current_date.sql)
--
-- Bu dosyadaki tablo/policy degisikliklerini uyguladiktan SONRA view'i
-- tazelemek icin sunu calistir:
--     \i sql/risk_durumu_current_date.sql
-- (view kolon eklendiginde CREATE OR REPLACE yetmez; o dosya drop + create yapar)
-- ---------------------------------------------------------------------------
