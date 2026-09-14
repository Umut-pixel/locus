-- =============================================================================
-- arvento_araclar.sevkiyat — "bu araç bizim dağıtım aracımız mı"
-- =============================================================================
--
-- Neden arac_kod'dan AYRI bir bayrak: bunlar iki farklı soru ve iki farklı
-- zamanda cevaplanıyor.
--
--   sevkiyat  → "bu araç dağıtım filosunun bir parçası mı?"
--               Bugün cevaplanabiliyor: Arvento'daki sürücü etiketleri
--               PATİGO SEVKİYAT 1/2/3 diyor, kalan 5 araç çalışanların
--               şahıs aracı (34 plakalı, kişi isimleri).
--
--   arac_kod  → "bu araç bizim HANGİ rota aracımız (kangoo/transit/npr10/
--               isuzu3d)?" Bu hâlâ Melih'in teyidini bekliyor: API yalnız
--               "OTOMOBIL"/"KAMYON" ayrımı veriyor, hangi kamyonun NPR 10
--               hangisinin 3D olduğunu bilmiyor. Ayrıca bizde 4 rota aracı
--               varken Arvento'da 3 sevkiyat aracı görünüyor.
--
-- İkisini tek kolona sıkıştırsaydık haritada hiçbir araç ayırt edilemezdi:
-- arac_kod bugün 8 aracın 8'inde de NULL.
--
-- ⚠ ARAÇ SINIFI BU SORUYU CEVAPLAMAZ. "KAMYON = sevkiyat" kuralı yanlış:
-- 35ASM899 (PATİGO SEVKİYAT 1) OTOMOBIL sınıfında. Sınıf yalnız İKON
-- seçiminde kullanılıyor (kamyon/otomobil silueti), sevkiyat kararında değil.
--
-- Sürücü adında "SEVKİYAT" aramak da tercih edilmedi: serbest metin, Arvento
-- tarafında sürücü değişince sessizce bozulur ve veritabanında izi kalmaz.
-- Bayrak açıkça işaretlenir, kim işaretlediyse kararı orada durur.
--
-- n8n filo senkronu bu kolonu EZMEZ: `Upsert Arvento Araclar` düğümünün
-- gövdesinde sevkiyat alanı yok, PostgREST upsert'i yalnız gövdedeki
-- kolonları günceller (arac_kod da aynı sebeple korunuyor).
--
-- Uygula: MCP apply_migration / SQL Editor. Idempotent.
-- =============================================================================

alter table public.arvento_araclar
  add column if not exists sevkiyat boolean not null default false;

comment on column public.arvento_araclar.sevkiyat is
  'Bu araç dağıtım filosunun parçası mı. arac_kod''dan AYRI: o "hangi rota aracı" sorusunu cevaplar ve Melih''in teyidini bekler. Araç sınıfı bu soruyu cevaplamaz — 35ASM899 sevkiyat aracı ama OTOMOBIL sınıfında.';

-- 2026-09-14 — Arvento sürücü etiketlerinden okunan üç sevkiyat aracı.
update public.arvento_araclar
   set sevkiyat = true
 where plaka in ('35ASM899', '34UBB75', '42ENL50');

create index if not exists arvento_araclar_sevkiyat_idx
  on public.arvento_araclar (sevkiyat)
  where sevkiyat;   -- harita/liste "önce sevkiyat" sıralaması bu yolu kullanır

-- ── View'a sevkiyat + arac_sinifi eklenmesi ─────────────────────────────────
-- Kolon eklendiği için CREATE OR REPLACE yetmiyor; DROP + CREATE şart
-- (sql/README.md'deki view deltası konvansiyonu).
drop view if exists public.v_arac_konum_son;

create view public.v_arac_konum_son
with (security_invoker = true) as
select
    k.node,
    av.plaka,
    av.plaka_ham,
    av.surucu,
    av.arac_sinifi,
    av.arac_kod,
    av.sevkiyat,
    a.ad                              as arac_adi,
    k.olcum_zamani,
    k.lat,
    k.lon,
    k.hiz_kmh,
    k.yon_derece,
    k.rakim_m,
    k.odometre_km,
    k.adres,
    k.bolge,
    k.cekildi_at,
    coalesce(k.hiz_kmh, 0) > 0        as hareket,
    k.olcum_zamani < now() - interval '10 minutes' as bayat,
    (extract(epoch from (now() - k.olcum_zamani)))::integer as yas_saniye
from public.arac_konum_son k
join public.arvento_araclar av on av.node = k.node
left join public.araclar a     on a.kod   = av.arac_kod;

comment on view public.v_arac_konum_son is
  'Canlı araç konumu — frontend YALNIZ bunu okur. hareket/bayat türetilmiş kolonlardır, uygulama kodunda tekrar hesaplanmaz (CLAUDE.md risk view''ı ilkesi). bayat eşiği 10 dk: mesai içi polling 1 dk, cihaz ~1 dk''da bir gönderiyor. sevkiyat + arac_sinifi harita imlecinin rengini ve ikonunu belirler.';

grant select on public.v_arac_konum_son to anon, authenticated;

do $$ begin
  grant select on public.v_arac_konum_son to locus_agent_ro;
exception when undefined_object then null;
end $$;
