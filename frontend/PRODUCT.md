# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Peritas Pet Food saha / operasyon ekibi (Ege dağıtıcı; müşteri kontağı Melih Sarıcaoğulu). Girişten sonra günlük turu ve borç/teslimat riskini harita ve raporlardan okur. Tek paylaşılan hesap (AUTH_USERNAME); çoklu rol yok.

## Product Purpose

Locus, Panorama (Univera) ERP verisini harita ve raporlara çevirir; Panorama’nın yerini almaz. Amaç: mevcut müşterileri konumda görmek, teslimat ve borç durumuna göre riski okumak, yoğun bölgeye ve açık bakiyeye hızlı bakmak.

Success: ekip, girişten sonra nerede yoğunluk olduğunu ve paranın/yaşlandırmanın nasıl durduğunu bir bakışta görür; çalışma aracı olan haritaya veya finansal rapora atlar.

## Positioning

Risk `musteriler_harita` SQL view’da hesaplanır; uygulama riski yeniden üretmez. Konum mahalle-merkezi + saha GPS’tir (sokak geocode yok). Aralık 2026’da veritabanı sağlayıcısı değişecek; ingestion kaynak-agnostik tutulur.

## Operating Context

Canlı: Vercel (`frontend/`). Veri: Supabase + n8n Panorama çekimi. Günlük kullanım: haritada müşteri/potansiyel, raporlarda borç-ciro-sevkiyat-stok. Anasayfa girişten sonraki brifing; harita `/harita`.

## Capabilities and Constraints

- Harita, müşteri/potansiyel katmanları, favori/gizle, rota, veri yükleme, finansal / sevkiyat / stok / müşteri raporları.
- Anasayfa (onaylandı, 2026-08-21): kare yoğun-ilçe haritası; açık bakiye + borç yaşlandırma; ciro–tahsilat trendi; karşılama satırı. Uydurma rakam yok.
- Risk mantığı view’da kalır. İlçe boşsa tahmin edilmez.

## Brand Commitments

Ürün adı Locus; müşteri yüzünde Patigo / Peritas. Arayüz Türkçe. Görsel dil mevcut uygulama kabuğundan (sidebar, rapor ızgarası, Mapbox dusk basemap) iner; yeni kimlik yok.

## Evidence on Hand

Gerçek Panorama satırları: `musteriler_harita`, finansal view’lar (ST Yaşlandırma 5530, Belge Detay 5450), konumlanan müşteri sayısı (kapsam özeti). Anasayfa bu kaynakları okur; sentetik demo veri kullanılmaz.

## Product Principles

- Karar verisi tek kaynaktan gelir; risk ve toplamlar uydurulmaz, bayat veri işaretlenir.
- Harita çalışma tezgâhıdır; anasayfa brifingdir.
- Konum doğruluğu mahalle/saha seviyesinde kalır.
- Kaynak değişimine hazır ingestion; Panorama’ya özel kırılgan bağ yok.

## Accessibility & Inclusion

Ürüne özel yasal standard kaydı yok. Operasyon arayüzü: klavye odağı, okunur kontrast, `prefers-reduced-motion` mevcut hareketlerde honör edilir.
