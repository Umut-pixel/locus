-- FAZ 5 — DÖNÜŞÜ ZOR. Yeni frontend prod'da doğrulanmadan UYGULAMAYIN.
--
-- Kalan tabloları/view kaynaklarını `to anon,authenticated using(true)`
-- (veya `to public`) yerine `to authenticated` + has_izin() bazlı politikalara
-- çeviriyor. musteriler/musteri_belge_ozet/musteri_yaslandirma/
-- musteri_tahsilat_ozet BURADA DEĞİL — sql/musteriler_rapor_maskeleme.sql'de.
--
-- Dokunulmayanlar (zaten sıfır politika — service-role only, ilgili
-- /api/* route middleware ile korunuyor): agent_konusmalar,
-- agent_konusma_mesajlari, bildirim_ayarlari, bildirim_gecmisi, entity_notlar,
-- musteri_favoriler, potansiyel_favoriler, ilce_merkezleri, rota_taslaklari,
-- panorama_belge_detay_raporu_yedek_20260818.
-- agent_ro_select (locus_agent_ro rolü) politikalarına da dokunulmuyor —
-- Supabase Auth'tan tamamen ayrı bir eksen.

-- İzin gerekmez, yalnız girişli olmak yeterli (sidebar canlı-nokta göstergesi,
-- yakıt fiyatı vb. — düşük hassasiyet, tüm rollere açık).
drop policy if exists "panorama_sync_runs_select_public" on public.panorama_sync_runs;
create policy "panorama_sync_runs_select_authenticated" on public.panorama_sync_runs
  for select to authenticated using (true);

drop policy if exists "yukleme_loglari_select_public" on public.yukleme_loglari;
create policy "yukleme_loglari_select_authenticated" on public.yukleme_loglari
  for select to authenticated using (true);

drop policy if exists "fuel_prices_select_public" on public.fuel_prices;
create policy "fuel_prices_select_authenticated" on public.fuel_prices
  for select to authenticated using (true);

-- Panorama landing tabloları — browser'dan hiç okunmuyor (yalnız server-side
-- transform), yine de anon'u düşürmek için authenticated-only yapılıyor.
drop policy if exists "panorama_musteri_listesi_select_public" on public.panorama_musteri_listesi;
create policy "panorama_musteri_listesi_select_authenticated" on public.panorama_musteri_listesi
  for select to authenticated using (true);

drop policy if exists "panorama_rut_tanim_listesi_select_public" on public.panorama_rut_tanim_listesi;
create policy "panorama_rut_tanim_listesi_select_authenticated" on public.panorama_rut_tanim_listesi
  for select to authenticated using (true);

drop policy if exists "panorama_siparis_durum_raporu_select_public" on public.panorama_siparis_durum_raporu;
create policy "panorama_siparis_durum_raporu_select_authenticated" on public.panorama_siparis_durum_raporu
  for select to authenticated using (true);

-- harita
drop policy if exists "potansiyel_musteriler_select_gecici" on public.potansiyel_musteriler;
create policy "potansiyel_musteriler_select_authenticated" on public.potansiyel_musteriler
  for select to authenticated using (public.has_izin('harita'));

drop policy if exists "arac_konum_son_select_public" on public.arac_konum_son;
create policy "arac_konum_son_select_authenticated" on public.arac_konum_son
  for select to authenticated
  using (public.has_izin('harita') or public.has_izin('rota_planlama'));

drop policy if exists "arvento_araclar_select_public" on public.arvento_araclar;
create policy "arvento_araclar_select_authenticated" on public.arvento_araclar
  for select to authenticated
  using (public.has_izin('harita') or public.has_izin('rota_planlama'));

-- stok_raporlari
drop policy if exists "panorama_detayli_stok_raporu_select_public" on public.panorama_detayli_stok_raporu;
create policy "panorama_detayli_stok_raporu_select_authenticated" on public.panorama_detayli_stok_raporu
  for select to authenticated using (public.has_izin('stok_raporlari'));

drop policy if exists "urun_skt_select_public" on public.urun_skt;
create policy "urun_skt_select_authenticated" on public.urun_skt
  for select to authenticated using (public.has_izin('stok_raporlari'));

drop policy if exists "urun_olcu_select_public" on public.urun_olcu;
create policy "urun_olcu_select_authenticated" on public.urun_olcu
  for select to authenticated using (public.has_izin('stok_raporlari'));

-- finansal_raporlar (bazıları OR — birden fazla sayfa aynı landing'i okuyor)
drop policy if exists "panorama_acik_fatura_vade_kup_select_public" on public.panorama_acik_fatura_vade_kup;
create policy "panorama_acik_fatura_vade_kup_select_authenticated" on public.panorama_acik_fatura_vade_kup
  for select to authenticated using (public.has_izin('finansal_raporlar'));

-- useUrunSatisDagilimi (stok sayfası) + useFinansalRaporu + useSevkiyatRaporu
-- aynı BelgeDetayRaporu landing'ini okuyor.
drop policy if exists "panorama_belge_detay_raporu_select_public" on public.panorama_belge_detay_raporu;
create policy "panorama_belge_detay_raporu_select_authenticated" on public.panorama_belge_detay_raporu
  for select to authenticated
  using (
    public.has_izin('finansal_raporlar')
    or public.has_izin('sevkiyat_raporlari')
    or public.has_izin('stok_raporlari')
  );

drop policy if exists "panorama_siparis_detay_raporu_select_public" on public.panorama_siparis_detay_raporu;
create policy "panorama_siparis_detay_raporu_select_authenticated" on public.panorama_siparis_detay_raporu
  for select to authenticated
  using (public.has_izin('finansal_raporlar') or public.has_izin('sevkiyat_raporlari'));

-- tahsilat_raporlari
drop policy if exists "panorama_tahsilat_raporu_select_public" on public.panorama_tahsilat_raporu;
create policy "panorama_tahsilat_raporu_select_authenticated" on public.panorama_tahsilat_raporu
  for select to authenticated using (public.has_izin('tahsilat_raporlari'));

-- sevkiyat_raporlari
drop policy if exists "panorama_sevkiyat_raporu_kup_select_public" on public.panorama_sevkiyat_raporu_kup;
create policy "panorama_sevkiyat_raporu_kup_select_authenticated" on public.panorama_sevkiyat_raporu_kup
  for select to authenticated using (public.has_izin('sevkiyat_raporlari'));

-- musteri_raporlama (useSevkiyatRaporu de okuyor — OR)
drop policy if exists "musteri_metrik_gecmis_select_public" on public.musteri_metrik_gecmis;
create policy "musteri_metrik_gecmis_select_authenticated" on public.musteri_metrik_gecmis
  for select to authenticated
  using (public.has_izin('musteri_raporlama') or public.has_izin('sevkiyat_raporlari'));

-- rota_planlama
drop policy if exists "araclar_select_public" on public.araclar;
create policy "araclar_select_authenticated" on public.araclar
  for select to authenticated using (public.has_izin('rota_planlama'));

drop policy if exists "soforler_select_public" on public.soforler;
create policy "soforler_select_authenticated" on public.soforler
  for select to authenticated using (public.has_izin('rota_planlama'));

drop policy if exists "sevkiyat_planlari_select_public" on public.sevkiyat_planlari;
create policy "sevkiyat_planlari_select_authenticated" on public.sevkiyat_planlari
  for select to authenticated using (public.has_izin('rota_planlama'));

drop policy if exists "sevkiyat_plan_duraklari_select_public" on public.sevkiyat_plan_duraklari;
create policy "sevkiyat_plan_duraklari_select_authenticated" on public.sevkiyat_plan_duraklari
  for select to authenticated using (public.has_izin('rota_planlama'));

drop policy if exists "arac_konum_gecmis_select_public" on public.arac_konum_gecmis;
create policy "arac_konum_gecmis_select_authenticated" on public.arac_konum_gecmis
  for select to authenticated using (public.has_izin('rota_planlama'));

drop policy if exists "arac_bakim_select_public" on public.arac_bakim;
create policy "arac_bakim_select_authenticated" on public.arac_bakim
  for select to authenticated using (public.has_izin('rota_planlama'));

-- musteri_finansal_detay — Ritim sekmesi risk bandı geçişlerini gösteriyor,
-- Borçlar sekmesiyle aynı gerekçeyle maskelenir (bkz. musteriler_rapor_maskeleme.sql).
drop policy if exists "musteri_snapshotlari_select_public" on public.musteri_snapshotlari;
create policy "musteri_snapshotlari_select_authenticated" on public.musteri_snapshotlari
  for select to authenticated using (public.has_izin('musteri_finansal_detay'));

-- ayarlar
drop policy if exists "arvento_sync_runs_select_public" on public.arvento_sync_runs;
create policy "arvento_sync_runs_select_authenticated" on public.arvento_sync_runs
  for select to authenticated using (public.has_izin('ayarlar'));
