-- =============================================================================
-- urun_skt — depo fiziksel sayım kaynağı (2026-09-07)
-- =============================================================================
--
-- NEDEN
--   `urun_skt` tek kaynağa göre kurulmuştu: fabrika (ARMA İlaç) alış raporu.
--   Depo tarafı ayrıca "PATİGO DEPO SKT BİLGİSİ.xlsx" gönderiyor ve o föy
--   fabrika dosyasının imzasını (SKT* + Ürün) taşıdığı için 2026-09-06'da
--   FABRİKA parser'ına düştü. Sonuç canlıda ölçüldü:
--     · 144 kayıt / 92 ürün yazıldı, ama satir_miktar 0 satırda dolu,
--       islem_tarihi 0 satırda dolu, matbu_no 0 satırda dolu.
--     · Föyün asıl verisi olan DEPO STOK ve 3 adet SAYIM kolonu hiç okunmadı.
--     · islem_tarihi boş kaldığı için stok sayfasındaki SKT kapsam rozeti
--       (donemBit yoksa render etmiyor) sessizce kayboldu.
--
--   Tespit artık ayrı bir tip döndürüyor (DepoSktSayimRaporu) ve bu iki
--   kaynağın alan doluluğu farklı olduğu için kayıtta işaretlenmesi gerekiyor.
--
-- ALAN DOLULUĞU
--   kaynak='fabrika'    → islem_tarihi / matbu_no / satir_miktar dolu,
--                         depo_stok / parti_miktar BOŞ.
--   kaynak='depo_sayim' → depo_stok / parti_miktar dolu,
--                         islem_tarihi / matbu_no / satir_miktar BOŞ
--                         (föyde alış tarihi ya da matbu no yok).
--
-- DEPO STOK ≠ SAYIM — BİLEREK ÜZERİNE YAZILMIYOR
--   depo_stok, Panorama'nın (5430) rakamı; parti_miktar fiziksel sayım.
--   2026-09-07 föyünde 92 üründen 71'i tutmuyor, net +3.344 adet (%11,5).
--   Hangisinin doğru olduğu bizim kararımız değil — ikisi de saklanıp fark
--   stok sayfasında mutabakat olarak gösteriliyor.
--
-- TAM DEĞİŞTİRME UYARISI
--   replace_urun_skt tabloyu KAYNAK AYIRMADAN tamamen değiştiriyor; yani bir
--   fabrika dosyası yüklemek sayım föyünü siler, tersi de geçerli. Snapshot
--   semantiği (sql/urun_skt_sema.sql) korunuyor: en güncel dosya doğru olan.
-- =============================================================================

alter table public.urun_skt
  add column if not exists kaynak       text not null default 'fabrika',
  add column if not exists depo_stok    numeric(14,2),
  add column if not exists parti_miktar numeric(14,2);

alter table public.urun_skt drop constraint if exists urun_skt_kaynak_check;
alter table public.urun_skt
  add constraint urun_skt_kaynak_check check (kaynak in ('fabrika', 'depo_sayim'));

comment on column public.urun_skt.kaynak is
  'fabrika = ARMA İlaç alış raporu; depo_sayim = depo fiziksel sayım föyü.';
comment on column public.urun_skt.depo_stok is
  'Sayım föyündeki ERP (Panorama 5430) stok rakamı. Ürünün tüm satırlarında aynı.';
comment on column public.urun_skt.parti_miktar is
  'Bu partide fiziksel olarak sayılan adet. Fabrika kaynağında yok.';

-- ---------------------------------------------------------------------------
-- RPC yeni kolonları da taşısın. jsonb_to_recordset sessizce alan atlar —
-- imza güncellenmezse sayım adetleri hiç yazılmaz.
-- ---------------------------------------------------------------------------
create or replace function public.replace_urun_skt(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  -- WHERE zorunlu: Supabase'de pg_safeupdate açık (bkz. sql/urun_skt_sema.sql).
  delete from public.urun_skt where id is not null;

  insert into public.urun_skt (
    urun_kodu, urun_adi, matbu_no, islem_tarihi,
    satir_miktar, parti_no, skt_tarihi, durum, tek_parti,
    kaynak, depo_stok, parti_miktar
  )
  select
    r.urun_kodu, r.urun_adi, r.matbu_no, r.islem_tarihi,
    r.satir_miktar, r.parti_no, r.skt_tarihi, r.durum, r.tek_parti,
    coalesce(r.kaynak, 'fabrika'), r.depo_stok, r.parti_miktar
  from jsonb_to_recordset(p_rows) as r(
    urun_kodu    text,
    urun_adi     text,
    matbu_no     text,
    islem_tarihi date,
    satir_miktar numeric,
    parti_no     text,
    skt_tarihi   date,
    durum        text,
    tek_parti    boolean,
    kaynak       text,
    depo_stok    numeric,
    parti_miktar numeric
  );

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.replace_urun_skt(jsonb) from public, anon, authenticated;

-- Doğrulama:
--   select kaynak, count(*), count(parti_miktar) miktarli, sum(parti_miktar) sayim
--     from public.urun_skt group by 1;
--   -- ERP ile sayımı tutmayan ürünler:
--   select urun_kodu, urun_adi, max(depo_stok) depo, sum(parti_miktar) sayim
--     from public.urun_skt where kaynak = 'depo_sayim'
--    group by 1, 2 having max(depo_stok) is distinct from sum(parti_miktar)
--    order by abs(coalesce(sum(parti_miktar), 0) - max(depo_stok)) desc;
