-- Bildirim sistemi — tablolar, kontrol fonksiyonları, orkestratörler, cron.
-- Canlıda pzepnmzxrwnlhixdrgzm'e apply_migration ile uygulandı (2026-09-12);
-- bu dosya o durumun git'teki kaydı, tekrar oynatılabilir referans.
--
-- Mimari: iki jenerik pg_cron job'ı (tip başına ayrı cron/trigger YOK).
-- Hangi tipin anlık mı özet mi gideceği yalnız bildirim_ayarlari.teslim_modu'na
-- bağlı — Ayarlar sayfasından herhangi bir tip ikisi arasında taşınabilir.
--
-- URL + Authorization aynı vault deseni (bkz. sql/panorama_sync_webhook.sql):
-- locus_notifications_url (bu dosyada oluşturulur) + panorama_transform_auth
-- (mevcut, CRON_SECRET — iki iç çağrı arasında paylaşılıyor, "Locus'a geri
-- yazan güvenilir iç çağrı" kimliği olarak).
--
-- ⚠️ cron.schedule saatleri UTC'dir, Europe/Istanbul DEĞİL — bu proje pg_cron
-- kurulumunda doğrulandı (mevcut daily_musteri_metrik_snapshot '15 5 * * *'
-- olarak yazılmış ama gerçekte 05:15 UTC = 08:15 Istanbul'da çalışıyor, aynı
-- kafa karışıklığı ilk sürümde bu dosyada da vardı: '30 7 * * *' 07:30
-- Istanbul sanılarak yazılmış, gerçekte 10:30 Istanbul'a denk geldiği için
-- 2026-09-13'te '0 5 * * *'e düzeltildi — 08:00 Istanbul, Türkiye DST
-- kullanmadığı için yıl boyu sabit).

create table if not exists bildirim_ayarlari (
  anahtar text primary key,
  aktif boolean not null default true,
  teslim_modu text not null default 'ozet' check (teslim_modu in ('anlik','ozet')),
  esik_deger numeric,
  guncellenme_tarihi timestamptz not null default now()
);
comment on table bildirim_ayarlari is 'Bildirim tipi başına açık/kapalı, teslim modu (anlik/ozet) ve eşik değeri. Tek satır = tek tip. Kişiye özel değil: uygulamada kullanıcı bazlı oturum yok (bkz. frontend/lib/auth.ts), paylaşımlı tek ayar paneli.';

create table if not exists bildirim_gecmisi (
  id bigint generated always as identity primary key,
  anahtar text not null references bildirim_ayarlari(anahtar),
  ilgili_kayit text,
  ozet text not null,
  gonderildi_at timestamptz not null default now()
);
comment on table bildirim_gecmisi is 'Gönderilen her bildirimin günlüğü — hem "bugün zaten gönderildi mi" kontrolü hem denetim izi için.';
create index if not exists bildirim_gecmisi_anahtar_tarih_idx on bildirim_gecmisi (anahtar, gonderildi_at desc);

alter table bildirim_ayarlari enable row level security;
alter table bildirim_gecmisi enable row level security;

insert into bildirim_ayarlari (anahtar, aktif, teslim_modu, esik_deger) values
  ('panorama_sync_hata', true, 'anlik', null),
  ('ciro_degisim',       true, 'ozet',  15),
  ('musteri_riskli',     true, 'ozet',  null),
  ('borc_esigi',         true, 'ozet',  56),
  ('yeni_siparis',       true, 'ozet',  null),
  ('buyuk_siparis',      true, 'ozet',  50000),
  ('skt_yaklasan',       true, 'ozet',  30),
  ('sabah_raporu',       true, 'ozet',  null)
on conflict (anahtar) do nothing;

-- ── Tip başına kontrol fonksiyonu ───────────────────────────────────────────
-- Hepsi aynı sözleşme: sıfır ya da daha fazla (mesaj, ilgili_kayit) satırı
-- döner. `ilgili_kayit` dedup anahtarı — aggregate/günlük tipler için tipik
-- olarak bugünün tarihi (aynı gün tekrar tetiklenmesin), olay-bazlı tipler
-- için o olayın kendi kimliği.

create or replace function public.bildirim_kontrol_panorama_sync_hata()
returns table(mesaj text, ilgili_kayit text)
language sql stable set search_path = public as $$
  select
    format('⚠️ Panorama senkronu başarısız: rapor %s — %s', r.report_id, coalesce(nullif(r.hata,''), 'bilinmeyen hata')),
    r.id::text
  from panorama_sync_runs r
  where r.durum = 'failed'
  order by r.cekildi_at desc
  limit 5;
$$;

create or replace function public.bildirim_kontrol_ciro_degisim(p_esik numeric)
returns table(mesaj text, ilgili_kayit text)
language plpgsql stable set search_path = public as $$
declare
  v_gun date := current_date;
  v_ciro numeric;
  v_ciro_onceki numeric;
  v_degisim numeric;
begin
  select sum(net_ciro) into v_ciro from musteri_metrik_gecmis where snapshot_tarihi = v_gun;
  select sum(net_ciro) into v_ciro_onceki from musteri_metrik_gecmis where snapshot_tarihi = v_gun - 1;

  if v_ciro is null or v_ciro_onceki is null or v_ciro_onceki = 0 then
    return;
  end if;

  v_degisim := round(((v_ciro - v_ciro_onceki) / v_ciro_onceki) * 100, 1);

  if abs(v_degisim) >= coalesce(p_esik, 15) then
    return query select
      format('%s Ciro %s: %%%s (bugün ₺%s, dün ₺%s)',
        case when v_degisim > 0 then '📈' else '📉' end,
        case when v_degisim > 0 then 'arttı' else 'azaldı' end,
        abs(v_degisim),
        to_char(v_ciro, 'FM999G999G999'),
        to_char(v_ciro_onceki, 'FM999G999G999')),
      v_gun::text;
  end if;
end;
$$;

-- Yalnız GEÇİŞ anını yakalar (dün 'riskli' değilken bugün 'riskli') — her gün
-- aynı müşteri için tekrar tekrar bildirim gitmesin diye. `musteri_metrik_gecmis`
-- günlük snapshot tuttuğu için bu karşılaştırma mümkün (bkz. daily_musteri_metrik_snapshot).
create or replace function public.bildirim_kontrol_musteri_riskli()
returns table(mesaj text, ilgili_kayit text)
language sql stable set search_path = public as $$
  select
    format('🔴 %s riskli duruma geçti (90+ gün sevkiyat yok)', bugun.musteri_kodu),
    bugun.musteri_kodu || ':' || bugun.snapshot_tarihi::text
  from musteri_metrik_gecmis bugun
  join musteri_metrik_gecmis dun
    on dun.musteri_kodu = bugun.musteri_kodu
    and dun.snapshot_tarihi = bugun.snapshot_tarihi - 1
  where bugun.snapshot_tarihi = current_date
    and bugun.risk_durumu = 'riskli'
    and dun.risk_durumu is distinct from 'riskli'
  limit 20;
$$;

-- musteri_yaslandirma sabit 7 günlük bantlar taşıyor (hf_01_06 .. hf_70_ustu),
-- tarihsel snapshot'u yok (her sync'te üzerine yazılıyor) — bu yüzden
-- "geçiş anı" değil, "şu an eşik üstü olan" listesi döner (borç orada durduğu
-- sürece her gün tekrar görünür, bu tip için kabul edilen davranış).
-- Eşik, en yakın banda yuvarlanır: 56 gün girilirse hf_56_62+üstü toplanır.
create or replace function public.bildirim_kontrol_borc_esigi(p_esik_gun numeric)
returns table(mesaj text, ilgili_kayit text)
language plpgsql stable set search_path = public as $$
declare
  v_esik numeric := coalesce(p_esik_gun, 56);
begin
  return query
  select
    format('💰 %s — %s+ gün gecikmiş ₺%s', hesap.musteri_kodu, v_esik::int, to_char(hesap.tutar, 'FM999G999G999')),
    hesap.musteri_kodu
  from (
    select musteri_kodu,
      (case
        when v_esik <= 7  then hf_01_06+hf_07_13+hf_14_20+hf_21_27+hf_28_34+hf_35_41+hf_42_48+hf_49_55+hf_56_62+hf_63_69+hf_70_ustu
        when v_esik <= 14 then hf_07_13+hf_14_20+hf_21_27+hf_28_34+hf_35_41+hf_42_48+hf_49_55+hf_56_62+hf_63_69+hf_70_ustu
        when v_esik <= 21 then hf_14_20+hf_21_27+hf_28_34+hf_35_41+hf_42_48+hf_49_55+hf_56_62+hf_63_69+hf_70_ustu
        when v_esik <= 28 then hf_21_27+hf_28_34+hf_35_41+hf_42_48+hf_49_55+hf_56_62+hf_63_69+hf_70_ustu
        when v_esik <= 35 then hf_28_34+hf_35_41+hf_42_48+hf_49_55+hf_56_62+hf_63_69+hf_70_ustu
        when v_esik <= 42 then hf_35_41+hf_42_48+hf_49_55+hf_56_62+hf_63_69+hf_70_ustu
        when v_esik <= 49 then hf_42_48+hf_49_55+hf_56_62+hf_63_69+hf_70_ustu
        when v_esik <= 56 then hf_49_55+hf_56_62+hf_63_69+hf_70_ustu
        when v_esik <= 63 then hf_56_62+hf_63_69+hf_70_ustu
        when v_esik <= 70 then hf_63_69+hf_70_ustu
        else hf_70_ustu
      end) as tutar
    from musteri_yaslandirma
  ) hesap
  where hesap.tutar > 0
  order by hesap.tutar desc
  limit 10;
end;
$$;

-- panorama_siparis_durum_raporu "tam snapshot": HER sync'in satırları kalıcı
-- kalıyor (sync_id de benzersizlik anahtarının parçası). Bu yüzden en son
-- tamamlanmış sync'e filtrelemeden sayı/tutar sorgusu YANLIŞ sonuç verir
-- (ilk denemede medyan sipariş tutarını ~40x şişirmişti).
create or replace function public.bildirim_kontrol_yeni_siparis()
returns table(mesaj text, ilgili_kayit text)
language plpgsql stable set search_path = public as $$
declare
  v_son_sync uuid;
  v_onceki_sync uuid;
  v_yeni_sayisi int;
begin
  select id into v_son_sync from panorama_sync_runs where report_id = 5140 and durum = 'completed' order by cekildi_at desc limit 1;
  select id into v_onceki_sync from panorama_sync_runs where report_id = 5140 and durum = 'completed' order by cekildi_at desc offset 1 limit 1;

  if v_son_sync is null or v_onceki_sync is null then
    return;
  end if;

  select count(distinct belge_kod) into v_yeni_sayisi
  from panorama_siparis_durum_raporu
  where sync_id = v_son_sync
    and belge_kod not in (select belge_kod from panorama_siparis_durum_raporu where sync_id = v_onceki_sync);

  if v_yeni_sayisi > 0 then
    return query select format('🧾 %s yeni sipariş belgesi geldi', v_yeni_sayisi), v_son_sync::text;
  end if;
end;
$$;

create or replace function public.bildirim_kontrol_buyuk_siparis(p_esik numeric)
returns table(mesaj text, ilgili_kayit text)
language plpgsql stable set search_path = public as $$
declare
  v_son_sync uuid;
begin
  select id into v_son_sync from panorama_sync_runs where report_id = 5140 and durum = 'completed' order by cekildi_at desc limit 1;
  if v_son_sync is null then
    return;
  end if;

  return query
  select format('💼 Büyük sipariş: %s — ₺%s (%s)', s.belge_kod, to_char(s.tutar, 'FM999G999G999'), coalesce(s.musteri_unvan,'')),
    s.belge_kod
  from (
    select belge_kod, max(musteri_unvan) as musteri_unvan, sum(nettutar::numeric) as tutar
    from panorama_siparis_durum_raporu
    where sync_id = v_son_sync and nettutar ~ '^[0-9.,]+$'
    group by belge_kod
  ) s
  where s.tutar >= coalesce(p_esik, 50000)
  order by s.tutar desc
  limit 10;
end;
$$;

create or replace function public.bildirim_kontrol_skt_yaklasan(p_esik_gun numeric)
returns table(mesaj text, ilgili_kayit text)
language sql stable set search_path = public as $$
  select format('📦 %s ürünün SKT''si %s gün içinde doluyor', count(*), coalesce(p_esik_gun,30)::int), 'gunluk-' || current_date::text
  from urun_skt
  where skt_tarihi is not null
    and skt_tarihi between current_date and current_date + (coalesce(p_esik_gun,30) || ' days')::interval
  having count(*) > 0;
$$;

create or replace function public.bildirim_kontrol_sabah_raporu()
returns table(mesaj text, ilgili_kayit text)
language plpgsql stable set search_path = public as $$
declare
  v_gun date := current_date;
  v_ciro numeric; v_ciro_onceki numeric; v_riskli_sayisi int;
  v_sync_hata_sayisi int; v_skt_yaklasan int; v_metin text;
begin
  select sum(net_ciro) into v_ciro from musteri_metrik_gecmis where snapshot_tarihi = v_gun;
  select sum(net_ciro) into v_ciro_onceki from musteri_metrik_gecmis where snapshot_tarihi = v_gun - 1;
  select count(*) into v_riskli_sayisi from musteri_metrik_gecmis where snapshot_tarihi = v_gun and risk_durumu = 'riskli';
  select count(*) into v_sync_hata_sayisi from panorama_sync_runs where durum = 'failed' and cekildi_at >= v_gun - 1;
  select count(*) into v_skt_yaklasan from urun_skt where skt_tarihi between current_date and current_date + interval '30 days';

  v_metin := format(
    E'☀️ Günaydın — %s durumu:\n· Ciro: ₺%s%s\n· Riskli müşteri: %s\n· SKT yaklaşan ürün (30g): %s\n· Son 24s senkron hatası: %s',
    to_char(v_gun, 'DD.MM.YYYY'),
    coalesce(to_char(v_ciro, 'FM999G999G999'), 'veri yok'),
    case when v_ciro is not null and v_ciro_onceki is not null and v_ciro_onceki > 0
      then format(' (%s%%)', round(((v_ciro - v_ciro_onceki)/v_ciro_onceki)*100, 1)) else '' end,
    v_riskli_sayisi, v_skt_yaklasan, v_sync_hata_sayisi
  );

  return query select v_metin, v_gun::text;
end;
$$;

-- Dispatcher — bildirim_ayarlari.anahtar'a göre doğru kontrolü çağırır.
-- Bilinmeyen anahtar için boş döner (yeni tip eklenene kadar sessizce yok sayılır).
create or replace function public.bildirim_calistir_kontrol(p_anahtar text, p_esik numeric)
returns table(mesaj text, ilgili_kayit text)
language plpgsql stable set search_path = public as $$
begin
  case p_anahtar
    when 'panorama_sync_hata' then return query select * from bildirim_kontrol_panorama_sync_hata();
    when 'ciro_degisim'       then return query select * from bildirim_kontrol_ciro_degisim(p_esik);
    when 'musteri_riskli'     then return query select * from bildirim_kontrol_musteri_riskli();
    when 'borc_esigi'         then return query select * from bildirim_kontrol_borc_esigi(p_esik);
    when 'yeni_siparis'       then return query select * from bildirim_kontrol_yeni_siparis();
    when 'buyuk_siparis'      then return query select * from bildirim_kontrol_buyuk_siparis(p_esik);
    when 'skt_yaklasan'       then return query select * from bildirim_kontrol_skt_yaklasan(p_esik);
    when 'sabah_raporu'       then return query select * from bildirim_kontrol_sabah_raporu();
    else return;
  end case;
end;
$$;

revoke all on function public.bildirim_kontrol_panorama_sync_hata() from public, anon, authenticated;
revoke all on function public.bildirim_kontrol_ciro_degisim(numeric) from public, anon, authenticated;
revoke all on function public.bildirim_kontrol_musteri_riskli() from public, anon, authenticated;
revoke all on function public.bildirim_kontrol_borc_esigi(numeric) from public, anon, authenticated;
revoke all on function public.bildirim_kontrol_yeni_siparis() from public, anon, authenticated;
revoke all on function public.bildirim_kontrol_buyuk_siparis(numeric) from public, anon, authenticated;
revoke all on function public.bildirim_kontrol_skt_yaklasan(numeric) from public, anon, authenticated;
revoke all on function public.bildirim_kontrol_sabah_raporu() from public, anon, authenticated;
revoke all on function public.bildirim_calistir_kontrol(text, numeric) from public, anon, authenticated;

-- ── Orkestratörler ───────────────────────────────────────────────────────
-- Ayar kontrolü (aktif=true) BURADA, SQL tarafında yapılıyor — /api/notifications/send
-- yalnız iletiyor, ayrıca kontrol etmiyor. Bilerek böyle: günlük özet birden
-- fazla tipi TEK mesajda birleştiriyor, "gönderirken tekrar kontrol et" o
-- durumda ya mesajın tamamını yanlışlıkla bloklar (bir tip kapalıysa) ya da
-- karmaşık kısmi-blok mantığı gerektirirdi. SQL zaten yalnız aktif tipleri
-- topladığı için tekrar kontrol gereksiz.
--
-- vault.create_secret ile bir kez oluşturulması gereken (bu dosyanın dışında,
-- SQL Editor'de elle çalıştırılır — gerçek değer buraya yazılmaz):
--   select vault.create_secret(
--     'https://locus-two-delta.vercel.app/api/notifications/send',
--     'locus_notifications_url',
--     'Locus bildirim gönderim endpoint''i (/api/notifications/send)'
--   );
-- (panorama_transform_auth zaten mevcut — CRON_SECRET, yeniden kullanılıyor.)

create or replace function public.bildirim_anlik_kontrol_calistir()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ayar record;
  v_sonuc record;
  v_endpoint text;
  v_auth text;
begin
  select ds.decrypted_secret into v_endpoint from vault.decrypted_secrets ds where ds.name = 'locus_notifications_url' limit 1;
  select ds.decrypted_secret into v_auth from vault.decrypted_secrets ds where ds.name = 'panorama_transform_auth' limit 1;

  if v_endpoint is null or v_auth is null then
    raise warning 'bildirim_anlik_kontrol_calistir: vault secret eksik (locus_notifications_url / panorama_transform_auth)';
    return;
  end if;

  for v_ayar in select * from bildirim_ayarlari where aktif = true and teslim_modu = 'anlik' loop
    for v_sonuc in select * from bildirim_calistir_kontrol(v_ayar.anahtar, v_ayar.esik_deger) loop
      if not exists (
        select 1 from bildirim_gecmisi
        where anahtar = v_ayar.anahtar and ilgili_kayit = v_sonuc.ilgili_kayit
      ) then
        perform net.http_post(
          url := v_endpoint,
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_auth),
          body := jsonb_build_object('anahtar', v_ayar.anahtar, 'mesaj', v_sonuc.mesaj),
          timeout_milliseconds := 15000
        );
        insert into bildirim_gecmisi (anahtar, ilgili_kayit, ozet)
          values (v_ayar.anahtar, v_sonuc.ilgili_kayit, v_sonuc.mesaj);
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.bildirim_gunluk_ozet_calistir()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ayar record;
  v_sonuc record;
  v_endpoint text;
  v_auth text;
  v_parcalar text[] := array[]::text[];
  v_birlesik text;
begin
  select ds.decrypted_secret into v_endpoint from vault.decrypted_secrets ds where ds.name = 'locus_notifications_url' limit 1;
  select ds.decrypted_secret into v_auth from vault.decrypted_secrets ds where ds.name = 'panorama_transform_auth' limit 1;

  if v_endpoint is null or v_auth is null then
    raise warning 'bildirim_gunluk_ozet_calistir: vault secret eksik (locus_notifications_url / panorama_transform_auth)';
    return;
  end if;

  -- sabah_raporu her zaman ilk sırada, geri kalanı anahtar sırasına göre
  for v_ayar in
    select * from bildirim_ayarlari
    where aktif = true and teslim_modu = 'ozet'
    order by (anahtar <> 'sabah_raporu'), anahtar
  loop
    for v_sonuc in select * from bildirim_calistir_kontrol(v_ayar.anahtar, v_ayar.esik_deger) loop
      if not exists (
        select 1 from bildirim_gecmisi
        where anahtar = v_ayar.anahtar and ilgili_kayit = v_sonuc.ilgili_kayit
      ) then
        v_parcalar := array_append(v_parcalar, v_sonuc.mesaj);
        insert into bildirim_gecmisi (anahtar, ilgili_kayit, ozet)
          values (v_ayar.anahtar, v_sonuc.ilgili_kayit, v_sonuc.mesaj);
      end if;
    end loop;
  end loop;

  if array_length(v_parcalar, 1) is null then
    return;
  end if;

  v_birlesik := array_to_string(v_parcalar, E'\n\n');

  perform net.http_post(
    url := v_endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_auth),
    body := jsonb_build_object('anahtar', 'sabah_raporu', 'mesaj', v_birlesik),
    timeout_milliseconds := 15000
  );
end;
$$;

revoke all on function public.bildirim_anlik_kontrol_calistir() from public, anon, authenticated;
revoke all on function public.bildirim_gunluk_ozet_calistir() from public, anon, authenticated;

-- Anlık: her 15 dk (panorama_sync_stale_sweep ile aynı sıklık).
select cron.schedule('bildirim_anlik_kontrol', '*/15 * * * *', $$select public.bildirim_anlik_kontrol_calistir();$$);
-- Günlük özet: 05:00 UTC = 08:00 Istanbul (Türkiye DST kullanmıyor, sabit).
select cron.schedule('bildirim_gunluk_ozet', '0 5 * * *', $$select public.bildirim_gunluk_ozet_calistir();$$);
