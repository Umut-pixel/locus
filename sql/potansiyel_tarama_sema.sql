-- Haritadan il seçilerek başlatılan Google Places taramalarının koşu tablosu.
--
-- Akış: harita "Potansiyel müşteri ara" → POST /api/potansiyel/tarama
--       → route bu tabloya 'running' satır açar → n8n Webhook Potansiyel Tarama
--       → Summary → Complete Tarama node'u satırı 'completed' PATCH'ler
--       → tarayıcı satırı anon key ile poll eder (izleTarama).
--
-- Neden panorama_sync_runs'a eklenmiyor: o tablo report_id merkezli ve
-- panorama_sync_runs_completed_webhook trigger'ı her 'completed' satırda
-- transform'u tetikliyor (bkz. panorama_sync_webhook.sql). Buraya böyle bir
-- sunucu işi yok — tarayıcı kendi katmanını tazeliyor, o yüzden pg_net
-- trigger'ı da YOK. Bir vault sırrı + bir trigger + bir hata modu eksilmiş oluyor.

create table if not exists public.potansiyel_taramalari (
  id                       uuid primary key default gen_random_uuid(),

  il                       text        not null,   -- 'İzmir' — ilce_merkezleri.il ile birebir
  plaka                    smallint    not null check (plaka between 1 and 81),
  kaynak                   text        not null default 'manuel'
                             check (kaynak in ('manuel', 'cron')),
  -- Supabase Auth yok (HMAC cookie, tek kullanıcı) → user_id tutulamaz.
  -- readSessionUsername() string'i saklanıyor. bkz. frontend/lib/auth.ts
  tetikleyen               text,

  durum                    text        not null default 'running'
                             check (durum in ('running', 'completed', 'failed')),

  -- KOTA ANAHTARI (günde 2 tarama, Europe/Istanbul gece yarısı sıfırlanır).
  -- Generated column OLAMAZ: `at time zone 'Europe/Istanbul'` STABLE, IMMUTABLE
  -- değil; generated ifadede kullanılamaz. Sunucu frontend/lib/donem.ts
  -- istanbulIsoGun() ile yazar — projede zaten tek kaynak olan takvim ilkeli.
  istanbul_gunu            date        not null,

  baslatildi_at            timestamptz not null default now(),
  tamamlandi_at            timestamptz,

  -- Tetikleme anında sunucunun hesapladığı plan (onay kartında gösterilen
  -- değerlerin aynısı). Sonradan "kullanıcıya ne vaat edilmişti" sorusunu
  -- yanıtlar; tahmin ile gerçekleşen arasındaki sapma buradan ölçülür.
  planlanan_ilce_sayisi    integer,
  taze_ilce_sayisi         integer,
  koordinatsiz_ilce_sayisi integer,
  tahmini_cagri_alt        integer,
  tahmini_cagri_ust        integer,

  -- Sonuç: n8n Summary node çıktısının TAMAMI + sık okunan iki alanın kopyası.
  ozet                     jsonb,
  yeni_potansiyel_sayisi   integer,
  taranan_ilce_sayisi      integer,
  hata                     text
);

-- Kota sorgusu: count(*) where istanbul_gunu = $1
create index if not exists potansiyel_taramalari_gun_idx
  on public.potansiyel_taramalari (istanbul_gunu);

-- In-flight kilidi: durum = 'running' var mı
create index if not exists potansiyel_taramalari_durum_idx
  on public.potansiyel_taramalari (durum, baslatildi_at desc);

-- Önizlemedeki "son taramalar" listesi
create index if not exists potansiyel_taramalari_baslatildi_idx
  on public.potansiyel_taramalari (baslatildi_at desc);

-- Tarayıcı satırı anon key ile POLL ediyor (izleRaporCekimi deseni,
-- frontend/lib/panorama-manual-sync.ts). Bu yüzden select açık, yazma kapalı.
-- Yazan yalnız service-role: API route (insert/delete) ve n8n (PATCH).
alter table public.potansiyel_taramalari enable row level security;

drop policy if exists potansiyel_taramalari_select on public.potansiyel_taramalari;
create policy potansiyel_taramalari_select
  on public.potansiyel_taramalari
  for select
  using (true);

grant select on public.potansiyel_taramalari to anon, authenticated;
revoke insert, update, delete on public.potansiyel_taramalari from anon, authenticated;

comment on table public.potansiyel_taramalari is
  'Haritadan il seçilerek başlatılan Google Places taramaları. Günlük kota anahtarı istanbul_gunu; in-flight kilidi durum=running. Süpürücü: potansiyel_tarama_stale_sweep.sql';

comment on column public.potansiyel_taramalari.istanbul_gunu is
  'Kota günü (Europe/Istanbul). Sunucu istanbulIsoGun() ile yazar — generated column olamaz, timezone dönüşümü IMMUTABLE değil.';

comment on column public.potansiyel_taramalari.ozet is
  'n8n Summary node çıktısının tamamı: placeTotal, newPlaceCount, nearbyHttp429, clippedDistricts, atlananIlceSayisi, ilFiltresi vb.';
