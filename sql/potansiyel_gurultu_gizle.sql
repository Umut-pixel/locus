-- Potansiyel gürültü temizliği: petshop/veteriner dışı + isimde pet sinyali yok.
-- Soft-hide: eslesme_durumu = 'gizli' (hard DELETE yok; n8n upsert bu alanı ezmez).
-- Saf tip filtresi (645) KULLANILMAZ — Google çoğu petshop'u "store" yazar.

-- ─── DRY-RUN: kaç satır etkilenir? ───────────────────────────────────────────
select count(*)::int as gizlenecek
from public.potansiyel_musteriler
where eslesme_durumu = 'yeni'
  and not (
    primary_type in ('pet_store', 'veterinary_care', 'pet_care')
    or coalesce(google_types, '{}')
      && array['pet_store', 'veterinary_care', 'pet_care']::text[]
    or upper(coalesce(isim, '')) similar to
      '%(PETSHOP|PET SHOP|PET STORE|PET MARKET|PET FOOD| VETER|AKVARYUM|HAYVAN|PATİ|PATI)%'
    or upper(coalesce(isim, '')) like '% PET%'
    or upper(coalesce(isim, '')) like 'PET %'
  );

-- Örnek isimler (spot-check)
select isim, primary_type, kalite_bayragi, il, ilce
from public.potansiyel_musteriler
where eslesme_durumu = 'yeni'
  and not (
    primary_type in ('pet_store', 'veterinary_care', 'pet_care')
    or coalesce(google_types, '{}')
      && array['pet_store', 'veterinary_care', 'pet_care']::text[]
    or upper(coalesce(isim, '')) similar to
      '%(PETSHOP|PET SHOP|PET STORE|PET MARKET|PET FOOD| VETER|AKVARYUM|HAYVAN|PATİ|PATI)%'
    or upper(coalesce(isim, '')) like '% PET%'
    or upper(coalesce(isim, '')) like 'PET %'
  )
order by isim
limit 40;

-- ─── APPLY: soft-hide (2026-08-06 uygulandı: 209 satır → gizli; yeni 3634→3425) ─
update public.potansiyel_musteriler
set eslesme_durumu = 'gizli'
where eslesme_durumu = 'yeni'
  and not (
    primary_type in ('pet_store', 'veterinary_care', 'pet_care')
    or coalesce(google_types, '{}')
      && array['pet_store', 'veterinary_care', 'pet_care']::text[]
    or upper(coalesce(isim, '')) similar to
      '%(PETSHOP|PET SHOP|PET STORE|PET MARKET|PET FOOD| VETER|AKVARYUM|HAYVAN|PATİ|PATI)%'
    or upper(coalesce(isim, '')) like '% PET%'
    or upper(coalesce(isim, '')) like 'PET %'
  );

-- Geri alma (gerekirse — yalnızca bu temizlik turunda gizlenenler ayırt edilemez;
-- tarama öncesi backup yoksa manuel_kontrol / yeni'ye tek tek dönülür.)

-- ─── Kapalı işyerleri (pipeline) ─────────────────────────────────────────────
-- Places field mask: places.businessStatus (n8n Nearby/Text Flatten*).
-- CLOSED_PERMANENTLY / CLOSED_TEMPORARILY insert edilmez.
-- DB'de birikmiş kapalı bayrağı yoktu; ayrı kolon şimdilik gerekmedi.
