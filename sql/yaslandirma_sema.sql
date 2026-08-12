-- Delta: ST yaşlandırma tablosu + harita view genişletmesi
-- Uygula: Supabase SQL Editor veya `python apply_yaslandirma_sema.py` (yoksa manuel)

create table if not exists public.musteri_yaslandirma (
    musteri_kodu   text primary key references public.musteriler (musteri_kodu) on delete cascade,
    st             text,
    hf_01_06       numeric(16,2) not null default 0,
    hf_07_13       numeric(16,2) not null default 0,
    hf_14_20       numeric(16,2) not null default 0,
    hf_21_27       numeric(16,2) not null default 0,
    hf_28_34       numeric(16,2) not null default 0,
    hf_35_41       numeric(16,2) not null default 0,
    hf_42_48       numeric(16,2) not null default 0,
    hf_49_55       numeric(16,2) not null default 0,
    hf_56_62       numeric(16,2) not null default 0,
    hf_63_69       numeric(16,2) not null default 0,
    hf_70_ustu     numeric(16,2) not null default 0,
    toplam         numeric(16,2) not null default 0,
    riskli_tutar   numeric(16,2) not null default 0,
    borc_riskli    boolean not null default false,
    guncellendi    timestamptz not null default now(),
    inserted_at    timestamptz not null default now()
);

create index if not exists musteri_yaslandirma_risk_idx
  on public.musteri_yaslandirma (borc_riskli)
  where borc_riskli = true;

alter table public.musteri_yaslandirma enable row level security;

do $$ begin
  create policy "musteri_yaslandirma_select_public"
    on public.musteri_yaslandirma
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
