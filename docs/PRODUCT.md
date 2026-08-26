# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Peritas Pet Food'un (Ege bölgesi petshop/veteriner distribütörü) saha satış
ve operasyon ekibi — sidebar'da "Peritas ekibi" olarak görünüyor. Kullanıcılar
internal/dahili personel; müşteri değil. [Çıkarım: tam ekip büyüklüğü/rolleri
(saha satış temsilcisi mi, sadece ofis operasyon mu, ikisi birden mi)
doğrulanmadı — kod ve UI'dan "saha satış ekibi kullanıyor" güçlü kanıtla
görünüyor ama roller netleştirilmedi.]

## Product Purpose

Panorama (Univera) ERP'den gelen parçalı Excel raporlarını (müşteri listesi,
rut tanımı, sevkiyat, ST yaşlandırma/borç, belge detay ciro) tek bir
haritalanabilir ve raporlanabilir görünümde birleştirir. Amaç: satış/operasyon
ekibinin hangi müşterinin teslimat riski (uzun süre sevkiyat yok) veya ödeme
riski (gecikmiş açık bakiye) taşıdığını tek bakışta görmesi, rutları
doğrulaması ve Excel'de manuel pivot/vlookup yapmadan ciro/segment/risk
kırılımlı rapor alabilmesi.

## Positioning

Jenerik bir CRM/BI aracı değil — Panorama'nın gerçek export şekline (77
kolonlu MusteriListesi, gram cinsinden ağırlık, `KoordinatX`=enlem gibi
yanıltıcı isimlendirmeler, %77 dolu `Ilce` kolonu, geocode hassasiyet
katmanları) özel olarak inşa edilmiş; bu veri tuhaflıklarını ETL/view
katmanında (bkz. `sql/sema.sql`, `backend/README.md`) belgeleyerek ve saklayarak çözüyor.
Komşu bir genel-amaçlı CRM bu domain-özel veri temizliğini kopyalayamaz.

## Operating Context

- Tek-kiracılı (single-tenant) dahili araç, kamuya açık SaaS değil.
- Veri kaynağı: Panorama ERP'den manuel Excel export → uygulama içi yükleme
  akışı (bilinen 5 dosya tipi: MusteriListesi, RutTanimListesi,
  SevkiyatRaporuKup, StYaslandirma, BelgeDetayRaporu) → Supabase'e parse/upsert.
- Ayrıca sidebar'da "Panorama Senkron" adlı bir tarayıcı-otomasyonu senkron
  özelliği var [Çıkraım: tam çalışma şekli bu incelemede doğrulanmadı].
  Not: bu doğrulanmadı, tahmin edilerek genişletilmedi.
- Temel işler: haritada risk/şehir/kanala göre keşif, rut doğrulama, müşteri
  raporlama tablosu (segment/risk/ciro/açık bakiye kırılımı) + dışa aktarma,
  ERP export döngüsünden sonra veri yükleme.
- Kayıt güncellemeleri toplu/manuel (Excel yükleme) — "Panorama Senkron"
  dışında gerçek zamanlı değil.

## Capabilities and Constraints

- DistGrup'taki tüm senkron müşteriler (~1400+ unique). Çekirdek Ege
  illeri `bolge_grubu` etiketi; Antalya, Bursa, İstanbul vb. de dahildir.
- Teslimat riski sunucu tarafında (`musteriler_harita` view) hesaplanır:
  sağlıklı / izlenmeli (>45 gün) / riskli (>90 gün) / hiç teslimat yok —
  client bunu asla yeniden hesaplamaz.
- Borç/ödeme riski AYRI bir eksen: ST Yaşlandırma'dan 11 gün bandı
  (01-06 … 70 Üstü), `riskli_tutar` = 56+ gün bantlarının toplamı. Teslimat
  riskiyle karıştırılmamalı.
- Yalnızca Türkçe (tr-TR locale — sayı/tarih/para birimi formatı).
- Geocode hassasiyeti değişken (saha_gps / mahalle_merkezi / ilce_merkezi /
  yok) — UI olduğundan kesin konum hissi vermemeli.
- Basit kullanıcı adı/şifre girişi — müşteri self-servis değil, dahili erişim.
- PostgREST 1000 satır limiti nedeniyle "tüm filtrelenmiş satırlar" gereken
  yerler (özet, dışa aktarma) batch'lenerek çekilir.

## Brand Commitments

Uygulama iki isimle görünüyor: sidebar'da **"Locus"** (dahili kod adı gibi),
tarayıcı sekmesi/login ekranında **"Patigo · Müşteri Haritası"**.
[Çıkraım: bunların aynı ürünün farklı adlandırma aşamaları mı yoksa bilinçli
çift marka mı olduğu doğrulanmadı — hangisinin kalıcı/kanonik olduğu
netleştirilmeli.] Ekip kimliği "Peritas ekibi" olarak sidebar'da sabit.

Görsel kimlik: **koyu kömür grisi (charcoal) tema bilinçli bir üründür**,
varsayılan değil — bu projede önceki oturumlarda ayrıntılı olarak
oluşturuldu (bkz. `globals.css` yorumları: "tüm dashboard'un tek renk
kaynağı"). Açık temaya veya parlak/renkli genel "admin dashboard" hissine
geri dönülmemeli.

## Evidence on Hand

Supabase'de gerçek üretim verisi var (proje: "Project Locus", ~1200+ gerçek
müşteri, gerçek ciro/borç rakamları). Pazarlama metni, referans/testimonial
veya müşteri-yüzlü içerik yok — bu tamamen operasyonel dahili bir araç.

## Product Principles

1. **Risk/borç rakamları tartışılmaz gerçektir.** Bu uygulama ekibin karar
   aldığı tek doğruluk kaynağı — görsel çekicilik doğruluğun/izlenebilirliğin
   (view'da hesaplanmış, client'ta yeniden hesaplanmamış) önüne geçemez.
2. **Türkçe-öncelikli, yoğun-veri "operate" modu.** Küçük dahili bir ekibin
   günlük kullandığı bir operasyon aracı — pazarlama/ikna değil, taranabilirlik
   ve hız önceliklidir.
3. **Gerçek verinin şeklini olduğu gibi kabul et.** Geocode hassasiyet
   katmanları, ERP kolon tuhaflıkları, borç yaşlandırma bantları — kaynak
   verinin gerçek kısıtları. Sahte kesinlik üretme, verinin desteklemediği
   metrik uydurma.
4. **Koyu charcoal, düşük-doygunluk arayüz bilinçli bir kısıttır, varsayılan
   değil.** Renk vurgusu yalnızca risk/veri anlamı taşıdığında kullanılır,
   dekoratif değildir.

## Accessibility & Inclusion

[Bu incelemede ürüne özgü bir erişilebilirlik gereksinimi doğrulanmadı —
bölüm bilinçli olarak boş bırakıldı.]
