-- 6 view'ın security_invoker bayrağı eksikti — view sahibi (postgres,
-- rolbypassrls=true) RLS'i tamamen atlıyordu. Bu düzeltilmeden has_izin()
-- bazlı kısıtlamalar bu view'lar için sessizce işe yaramaz. Faz 2 (bkz. plan).
--
-- potansiyel_musteriler_harita özel durum: kaynağı potansiyel_musteriler
-- bugün RLS açık ama SIFIR politika (yalnız service-role). View bugüne kadar
-- security-definer olduğu için çalışıyordu. security_invoker=true yapılır
-- yapılmaz alttaki sıfır politika devreye girer ve view anında 0 satır döner
-- — bu yüzden GEÇİCİ olarak (nihai has_izin('harita') kısıtı Faz 5'te,
-- rls_izin_bazli_politikalar.sql'de) bugünkü fiili davranışı koruyan bir
-- politika ekleniyor: herkese (anon+authenticated) açık, eskisiyle aynı.

alter view public.v_panorama_belge_detay_raporu_guncel set (security_invoker = true);
alter view public.v_panorama_sevkiyat_raporu_kup_guncel set (security_invoker = true);
alter view public.v_panorama_detayli_stok_raporu_guncel set (security_invoker = true);
alter view public.potansiyel_musteriler_harita set (security_invoker = true);
alter view public.rapor_bolge_disi_ozet set (security_invoker = true);
alter view public.v_panorama_rut_tanim_listesi_guncel set (security_invoker = true);

create policy "potansiyel_musteriler_select_gecici"
  on public.potansiyel_musteriler
  for select to anon, authenticated
  using (true);
