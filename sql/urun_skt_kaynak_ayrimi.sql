-- =============================================================================
-- urun_skt — iki kaynak birlikte dursun (2026-09-07)
-- =============================================================================
--
-- NEDEN
--   `replace_urun_skt` tabloyu KAYNAK AYIRMADAN siliyordu: fabrika alış dosyası
--   yüklemek depo sayım föyünü, föy yüklemek fabrika kayıtlarını siliyordu.
--   İki dosya birbirini tamamlıyor, biri diğerinin yerine geçmiyor:
--     · Depo sayım föyü  → 92 üründe parti bazlı FİZİKSEL adet + SKT
--     · Fabrika alış     → föyde hiç geçmeyen ürünlerin SKT'si (bugün 10 ürün)
--   Tek snapshot kuralı artık KAYNAK BAŞINA geçerli: bir kaynağın yeni dosyası
--   yalnız o kaynağın satırlarını değiştirir.
--
-- İMZA DEĞİŞİYOR
--   Tek argümanlı sürüm DROP ediliyor. `p_kaynak text default null` ile iki
--   argümanlı bir overload bırakmak Postgres'te tek argümanlı çağrıyı
--   AMBIGUOUS yapardı (iki aday da eşleşir) — o yüzden eski sürüm kalmıyor.
--   Çağıran: frontend/lib/sync/write-urun-skt.ts → replaceUrunSkt(admin, rows, kaynak)
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- Önce sql/urun_skt_sema.sql ve sql/urun_skt_depo_sayim.sql çalıştırılmış olmalı.
-- =============================================================================

drop function if exists public.replace_urun_skt(jsonb);

create or replace function public.replace_urun_skt(p_rows jsonb, p_kaynak text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  if p_kaynak is null or p_kaynak not in ('fabrika', 'depo_sayim') then
    raise exception 'replace_urun_skt: gecersiz kaynak %', p_kaynak;
  end if;

  -- Yalnız bu kaynağın satırları. WHERE zaten var; pg_safeupdate'i de
  -- karşılıyor (bkz. sql/urun_skt_sema.sql).
  delete from public.urun_skt where kaynak = p_kaynak;

  insert into public.urun_skt (
    urun_kodu, urun_adi, matbu_no, islem_tarihi,
    satir_miktar, parti_no, skt_tarihi, durum, tek_parti,
    kaynak, depo_stok, parti_miktar
  )
  select
    r.urun_kodu, r.urun_adi, r.matbu_no, r.islem_tarihi,
    r.satir_miktar, r.parti_no, r.skt_tarihi, r.durum, r.tek_parti,
    -- Satırdaki kaynak değil p_kaynak yazılır: silinen küme ile yazılan küme
    -- aynı olmalı, yoksa bir kaynak sessizce iki kez temsil edilir.
    p_kaynak, r.depo_stok, r.parti_miktar
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
    depo_stok    numeric,
    parti_miktar numeric
  );

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.replace_urun_skt(jsonb, text) is
  'Yalnız p_kaynak satırlarını değiştirir; diğer kaynağa dokunmaz.';

revoke all on function public.replace_urun_skt(jsonb, text) from public, anon, authenticated;

-- Doğrulama — fabrika dosyası yüklendiğinde depo_sayim satırları DEĞİŞMEMELİ:
--   select kaynak, count(*) kayit, count(distinct urun_kodu) urun,
--          max(yuklendi_at) son
--     from public.urun_skt group by 1 order by 1;
