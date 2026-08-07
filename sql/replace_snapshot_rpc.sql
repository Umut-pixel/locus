-- Atomic snapshot replace for musteri_yaslandirma / musteri_belge_ozet.
-- DELETE + INSERT in one plpgsql function = one transaction.
-- pg_try_advisory_xact_lock: concurrent caller skips (no empty-table race).
-- Callable only as service_role via PostgREST rpc.

create or replace function public.replace_musteri_yaslandirma(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('replace_musteri_yaslandirma')) then
    raise notice 'replace_musteri_yaslandirma: already running, skipping';
    return 0;
  end if;

  if p_rows is not null and jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'replace_musteri_yaslandirma: p_rows must be a JSON array';
  end if;

  delete from public.musteri_yaslandirma
  where musteri_kodu is not null;

  if p_rows is null or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;

  insert into public.musteri_yaslandirma (
    musteri_kodu,
    st,
    hf_01_06,
    hf_07_13,
    hf_14_20,
    hf_21_27,
    hf_28_34,
    hf_35_41,
    hf_42_48,
    hf_49_55,
    hf_56_62,
    hf_63_69,
    hf_70_ustu,
    toplam,
    riskli_tutar,
    borc_riskli,
    guncellendi
  )
  select
    r.musteri_kodu,
    r.st,
    coalesce(r.hf_01_06, 0),
    coalesce(r.hf_07_13, 0),
    coalesce(r.hf_14_20, 0),
    coalesce(r.hf_21_27, 0),
    coalesce(r.hf_28_34, 0),
    coalesce(r.hf_35_41, 0),
    coalesce(r.hf_42_48, 0),
    coalesce(r.hf_49_55, 0),
    coalesce(r.hf_56_62, 0),
    coalesce(r.hf_63_69, 0),
    coalesce(r.hf_70_ustu, 0),
    coalesce(r.toplam, 0),
    coalesce(r.riskli_tutar, 0),
    coalesce(r.borc_riskli, false),
    now()
  from jsonb_to_recordset(p_rows) as r(
    musteri_kodu text,
    st text,
    hf_01_06 numeric,
    hf_07_13 numeric,
    hf_14_20 numeric,
    hf_21_27 numeric,
    hf_28_34 numeric,
    hf_35_41 numeric,
    hf_42_48 numeric,
    hf_49_55 numeric,
    hf_56_62 numeric,
    hf_63_69 numeric,
    hf_70_ustu numeric,
    toplam numeric,
    riskli_tutar numeric,
    borc_riskli boolean
  )
  where r.musteri_kodu is not null and btrim(r.musteri_kodu) <> '';

  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.replace_musteri_belge_ozet(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('replace_musteri_belge_ozet')) then
    raise notice 'replace_musteri_belge_ozet: already running, skipping';
    return 0;
  end if;

  if p_rows is not null and jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'replace_musteri_belge_ozet: p_rows must be a JSON array';
  end if;

  delete from public.musteri_belge_ozet
  where musteri_kodu is not null;

  if p_rows is null or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;

  insert into public.musteri_belge_ozet (
    musteri_kodu,
    donem_bas,
    donem_bit,
    satir_sayisi,
    siparis_sayisi,
    fatura_sayisi,
    net_ciro,
    brut_ciro,
    iskonto_toplam,
    promo_satir,
    iptal_satir,
    son_islem_tarihi,
    vade_gunu,
    top_urun_grup,
    son_urun_grup,
    top_urun,
    son_urun,
    st_adi,
    st_kodu,
    guncellendi
  )
  select
    r.musteri_kodu,
    r.donem_bas,
    r.donem_bit,
    coalesce(r.satir_sayisi, 0),
    coalesce(r.siparis_sayisi, 0),
    coalesce(r.fatura_sayisi, 0),
    coalesce(r.net_ciro, 0),
    coalesce(r.brut_ciro, 0),
    coalesce(r.iskonto_toplam, 0),
    coalesce(r.promo_satir, 0),
    coalesce(r.iptal_satir, 0),
    r.son_islem_tarihi,
    r.vade_gunu,
    r.top_urun_grup,
    r.son_urun_grup,
    r.top_urun,
    r.son_urun,
    r.st_adi,
    r.st_kodu,
    now()
  from jsonb_to_recordset(p_rows) as r(
    musteri_kodu text,
    donem_bas date,
    donem_bit date,
    satir_sayisi integer,
    siparis_sayisi integer,
    fatura_sayisi integer,
    net_ciro numeric,
    brut_ciro numeric,
    iskonto_toplam numeric,
    promo_satir integer,
    iptal_satir integer,
    son_islem_tarihi date,
    vade_gunu integer,
    top_urun_grup text,
    son_urun_grup text,
    top_urun text,
    son_urun text,
    st_adi text,
    st_kodu text
  )
  where r.musteri_kodu is not null and btrim(r.musteri_kodu) <> '';

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.replace_musteri_yaslandirma(jsonb) from public, anon, authenticated;
revoke all on function public.replace_musteri_belge_ozet(jsonb) from public, anon, authenticated;
grant execute on function public.replace_musteri_yaslandirma(jsonb) to service_role;
grant execute on function public.replace_musteri_belge_ozet(jsonb) to service_role;

comment on function public.replace_musteri_yaslandirma(jsonb) is
  'Atomic full-snapshot replace for musteri_yaslandirma (delete + insert, one txn). Concurrent callers skip via advisory xact lock.';
comment on function public.replace_musteri_belge_ozet(jsonb) is
  'Atomic full-snapshot replace for musteri_belge_ozet (delete + insert, one txn). Concurrent callers skip via advisory xact lock.';
