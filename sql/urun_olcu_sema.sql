-- =============================================================================
-- urun_olcu — SKU başına paket ölçüsü (kg / koli içi adet / çuval eşdeğeri)
-- =============================================================================
--
-- Neden var: Panorama'da ürün master yok. Sipariş satırında yalnız `miktar` ve
-- `birim` (AD/KL) geliyor; kaç kg ve araçta ne kadar yer kapladığı bilinmiyor.
-- Araç doluluk hesabının tamamı bu tabloya dayanıyor.
--
-- Ad parse'ı canlı veride doğrulandı (2026-09-01, 1.967 belge): hesaplanan kg,
-- ERP'nin kendi SevkiyatRaporuKup.agirlik alanını %100,0 kapsıyor (965.568 /
-- 965.626 kg), medyan oran 1.000, belgelerin %97,4'ü ±%5 içinde. Mutabakat
-- sorgusu: sql/siparis_yuk_view.sql dosyasının sonunda.
--
-- Elle girilen satırlar (kaynak='manuel') yeniden seed'de KORUNUR. Melih'ten
-- cevap gelen SKU'ları 'manuel' olarak yaz; seed onları bir daha ezmez.
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- =============================================================================

create table if not exists public.urun_olcu (
    urun_kodu      text primary key,
    urun_adi       text,
    -- 1 ADEDİN kg'ı (koli değil). NULL = ölçü bilinmiyor, yük hesabına girmez.
    paket_kg       numeric(8,3),
    -- birim='KL' satırında miktar bu sayıyla çarpılır. Çuval ürünlerde 1
    -- (Panorama'da "KL" çuvalın kendisi — AD/KL birim fiyat oranı 1,00).
    koli_ici_adet  integer not null default 1,
    -- 1 adet kaç çuval yeri kaplar. Çuval=1,0; küçük paket ve kedi kumu
    -- ağırlık oranıyla yaklaşık (kumda hacmi abartır — Melih'in palet cevabı
    -- bekleniyor). NULL = hacmi hiç bilinmiyor.
    cuval_esdeger  numeric(6,3),
    hacim_sinifi   text not null default 'diger'
                   check (hacim_sinifi in ('cuval', 'koli', 'kum', 'diger')),
    kaynak         text not null default 'parse'
                   check (kaynak in ('parse', 'manuel')),
    guncellendi    timestamptz not null default now()
);

comment on table public.urun_olcu is
  'SKU paket ölçüsü — araç doluluk hesabının kaynağı. kaynak=manuel satırlar seed''de korunur.';
comment on column public.urun_olcu.paket_kg is
  '1 adedin kg''ı. NULL ise satır ölçüsüz sayılır (v_siparis_yuk.olcusuz_satir).';
comment on column public.urun_olcu.koli_ici_adet is
  'birim=KL çarpanı. Çuvallarda 1 — Panorama "KL"si çuvalın kendisi.';
comment on column public.urun_olcu.cuval_esdeger is
  '1 adedin çuval cinsinden hacmi. Ortalama çuval 14,56 kg (824 t / 56.594 çuval).';

create index if not exists urun_olcu_hacim_sinifi_idx
  on public.urun_olcu (hacim_sinifi);
create index if not exists urun_olcu_olcusuz_idx
  on public.urun_olcu (urun_kodu) where paket_kg is null;

alter table public.urun_olcu enable row level security;

do $$ begin
  create policy "urun_olcu_select_public"
    on public.urun_olcu for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

grant select, insert, update, delete on public.urun_olcu
  to anon, authenticated, service_role;

-- =============================================================================
-- Seed — ürün adından ölçü çıkarımı
-- =============================================================================
--
-- Kaynak: landing TABLOSU (view değil) — view yalnız son snapshot'ı gösterir,
-- daha önce görülmüş SKU'lar kaçar.
--
-- koli_ici_adet çıkarımı iki kademeli:
--   1. AD/KL birim fiyat oranı 1'e veya 24'e yakınsa onu kullan (canlı veride
--      bu iki değer nokta atışı çıkıyor: çuvallarda 1,00 — yaş mama/mini
--      pakette tam 24,00).
--   2. Aksi halde kg aralığından varsayılan. 2 kg → 8, 3 kg → 6 fiyat
--      oranından türetildi ama oran gürültülü (farklı iskonto kademeleri),
--      bu yüzden snap edilmiyor — Melih teyidi bekliyor.
-- =============================================================================

create or replace function public.urun_olcu_seed()
returns integer
language plpgsql
as $$
declare
  etkilenen integer;
begin
  with ham as (
    select
      d.urun_kodu,
      max(d.urun) as urun_adi,
      d.birim,
      avg(nullif(replace(d.birim_fiyat, ',', '.'), '')::numeric)
        filter (where nullif(replace(d.birim_fiyat, ',', '.'), '')::numeric > 0) as ort_fiyat
    from public.panorama_siparis_detay_raporu d
    where nullif(d.urun_kodu, '') is not null
    group by d.urun_kodu, d.birim
  ),
  urun as (
    select
      urun_kodu,
      max(urun_adi) as urun_adi,
      max(ort_fiyat) filter (where birim = 'AD') as ad_fiyat,
      max(ort_fiyat) filter (where birim = 'KL') as kl_fiyat
    from ham
    group by urun_kodu
  ),
  olcu as (
    select
      u.urun_kodu,
      u.urun_adi,
      -- "15kg" / "15 kg" / "0,5kg" — virgül ondalığa çevrilir
      (regexp_match(replace(u.urun_adi, ',', '.'),
                    '([0-9]+(?:\.[0-9]+)?)\s*[kK][gG]'))[1]::numeric as kg_ham,
      -- "400 g" / "85 g" — kg yakalanmadıysa bakılır, harf gelirse eşleşmez
      (regexp_match(replace(u.urun_adi, ',', '.'),
                    '([0-9]+(?:\.[0-9]+)?)\s*g(?![a-zA-Z])'))[1]::numeric as g_ham,
      -- "10 lt torba" — kedi kumu; kg'ı bilinmiyor
      (regexp_match(replace(u.urun_adi, ',', '.'),
                    '([0-9]+(?:\.[0-9]+)?)\s*lt'))[1]::numeric as lt_ham,
      case
        when u.ad_fiyat > 0 and u.kl_fiyat > 0 then u.kl_fiyat / u.ad_fiyat
      end as kl_ad_orani
    from urun u
  ),
  hesap as (
    select
      urun_kodu,
      urun_adi,
      -- Kedi kumu adında kg yok, litre var. Yoğunluk 0,87 kg/lt TAHMİN DEĞİL:
      -- mutabakattan geri çözüldü. Yalnız 10 lt içeren 140 belgede artık
      -- ağırlık / adet = 8,70; yalnız 6 lt içeren belgelerde 5,20 (= 8,70 × 6/10).
      -- İki bağımsız küme aynı yoğunluğu veriyor.
      coalesce(kg_ham, g_ham / 1000.0, lt_ham * 0.87) as paket_kg,
      coalesce(kg_ham, g_ham / 1000.0)                as gida_kg,
      lt_ham,
      kl_ad_orani
    from olcu
  ),
  son as (
    select
      urun_kodu,
      urun_adi,
      paket_kg,
      case
        when lt_ham is not null    then 'kum'
        when gida_kg >= 10         then 'cuval'
        when gida_kg is not null   then 'koli'
        else 'diger'
      end as hacim_sinifi,
      case
        -- Kedi kumu AD satılıyor; koli çarpanı devrede değil
        when lt_ham is not null then 1
        -- Oran tam sayıya oturuyorsa (±0,02) ona güven: canlı veride 1,00 /
        -- 12,00 / 24,00 nokta atışı çıkıyor. 8,70 veya 31,60 gibi gürültülü
        -- oranlar (farklı iskonto kademeleri) bu testten geçemez.
        when kl_ad_orani between 0.9 and 40
         and abs(kl_ad_orani - round(kl_ad_orani)) <= 0.02
             then greatest(round(kl_ad_orani)::integer, 1)
        -- Aksi halde kg aralığı (Melih teyidi bekleyen varsayımlar)
        when paket_kg >= 10                     then 1
        when paket_kg >= 2.5                    then 6
        when paket_kg >= 1.5                    then 8
        when paket_kg is not null               then 24
        else 1
      end as koli_ici_adet,
      -- Hacim, ağırlık oranıyla yaklaşık hesaplanıyor. Kuru mamada doğru
      -- (hepsi aynı yoğunlukta); KEDİ KUMUNDA hacmi ABARTIR — kum ağır ama
      -- küçük hacimli. Melih'in "palete kaç kum torbası dizilir" cevabı
      -- gelince kum satırları kaynak='manuel' ile düzeltilmeli.
      case
        when lt_ham is not null   then round(paket_kg / 14.56, 3)
        when paket_kg >= 10       then 1.0
        when paket_kg is not null then round(paket_kg / 14.56, 3)
        else null
      end as cuval_esdeger
    from hesap
  )
  insert into public.urun_olcu as t
      (urun_kodu, urun_adi, paket_kg, koli_ici_adet, cuval_esdeger, hacim_sinifi, kaynak)
  select urun_kodu, urun_adi, paket_kg, koli_ici_adet, cuval_esdeger, hacim_sinifi, 'parse'
    from son
  on conflict (urun_kodu) do update set
      urun_adi      = excluded.urun_adi,
      paket_kg      = excluded.paket_kg,
      koli_ici_adet = excluded.koli_ici_adet,
      cuval_esdeger = excluded.cuval_esdeger,
      hacim_sinifi  = excluded.hacim_sinifi,
      guncellendi   = now()
  -- Elle düzeltilmiş satır asla ezilmez
  where t.kaynak = 'parse';

  get diagnostics etkilenen = row_count;
  return etkilenen;
end;
$$;

comment on function public.urun_olcu_seed() is
  'Ürün adından ölçü çıkarır. kaynak=manuel satırları korur; her Panorama sync sonrası güvenle çağrılabilir.';

select public.urun_olcu_seed();

-- Agent salt-okunur erişimi (bkz. sql/agent_readonly_role.sql)
do $$ begin
  grant select on public.urun_olcu to locus_agent_ro;
  drop policy if exists agent_ro_select on public.urun_olcu;
  create policy agent_ro_select
    on public.urun_olcu for select to locus_agent_ro using (true);
exception when undefined_object then null;
end $$;

-- =============================================================================
-- Melih'ten cevap gelince — örnek manuel giriş (kaynak='manuel' seed'i bloklar)
-- =============================================================================
--
-- insert into public.urun_olcu
--     (urun_kodu, urun_adi, paket_kg, koli_ici_adet, cuval_esdeger, hacim_sinifi, kaynak)
-- values
--     ('10000007', 'Fresh Paty Kedi Kumu Classic 10 lt torba', 8.5, 1, 0.60, 'kum', 'manuel')
-- on conflict (urun_kodu) do update set
--     paket_kg = excluded.paket_kg, koli_ici_adet = excluded.koli_ici_adet,
--     cuval_esdeger = excluded.cuval_esdeger, hacim_sinifi = excluded.hacim_sinifi,
--     kaynak = 'manuel', guncellendi = now();
