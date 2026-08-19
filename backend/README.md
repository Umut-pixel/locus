# Petshop MVP — Panorama ERP → temiz müşteri veri seti

Ege bölgesi petshop/veteriner distribütörü için tek seferlik statik ETL.
Panorama (Univera) ERP'den alınan üç Excel'i temizler, birleştirir ve
haritalanabilir tek bir tablo üretir.

Bu klasörden çalıştırın:

```bash
cd backend
python etl_musteri.py
```

Repo kökünden: `python backend/etl_musteri.py`

Kimlik bilgileri repo kökündeki `.env` dosyasından okunur.

## Dosyalar

| Dosya | İş |
|---|---|
| `etl_musteri.py` | Ana ETL. Okuma → dedup → bölge filtresi → rut join → sevkiyat agregasyonu → geocode → CSV |
| `supabase_yukle.py` | CSV'yi Supabase'e upsert eder. ETL'den bağımsız çalışır |
| `dogrula.py` | Bağımsız QA. Çıktıyı ham Excel'lere karşı yeniden hesaplar (20 kontrol) |
| `geocode_ilce_merkezleri.py` | `ilce_merkezleri` tablosunu Nominatim ile seed eder |
| `smoke_konak_nearby.py` | Google Places Nearby smoke testi (Konak) |
| `../sql/sema.sql` | Tablo/index/view DDL'i (kanonik şema) |
| `geocode_cache.json` | Nominatim yanıt önbelleği. Silinmezse tekrar çalıştırma ağa çıkmaz |
| `cikti/musteriler_temiz.csv` | **Ana çıktı** |
| `cikti/geocode_basarisiz.csv` | Koordinatı çözülemeyen müşteriler |
| `cikti/bolge_disi_musteriler.csv` | Bölge filtresine takılanlar (referans) |
| `cikti/etl_rapor.json` | Her adımın sayıları, makine okunur |
| `cikti/etl_log.txt` | Tam çalışma logu |
| `n8n/google-places-prospecting.json` | Potansiyel müşteri tarama (n8n, güncel) |
| `n8n/panorama-otomasyon.json` | Panorama ERP → landing tabloları |

## Kaynak dosyalarda brief'ten farklı çıkanlar

Brief'teki kolon listeleri gerçek dosyalarla karşılaştırıldı. Beklenen
kolonların **tamamı mevcut** — ama dosyalar çok daha geniş:

| Dosya | Brief | Gerçek | Not |
|---|---|---|---|
| MusteriListesi | ~11 kolon | **77 kolon**, 2 sheet (`Pivot Table` boş, `Data` dolu) | 1596 satır ✓, 1401 tekil ✓ |
| RutTanimListesi | 9 kolon | **14 kolon**, sheet adı `RutTanimListesi` | 1016 satır (brief ~1017) |
| SevkiyatRaporuKup | 10 kolon | **27 kolon**, 2 sheet | 1586 satır ✓, 437 tekil ✓ |

Ek olarak tespit edilenler:

1. **`Telefon` neredeyse boş** — 1596 satırın sadece 76'sında (%4.8) dolu.
   Asıl telefon `CepTelNo` kolonunda (%99.6 dolu). Çıktıdaki `telefon`
   alanı CepTelNo öncelikli, boşsa Telefon'a düşüyor.
2. **`KoordinatX` = enlem, `KoordinatY` = boylam.** İsimlendirme yanıltıcı;
   değer aralıklarından doğrulandı (X: 36–42, Y: 26–45).
3. **14 satırda koordinat `0.0`** — geçersiz, boş sayıldı. Brief'teki
   "426 müşteride dolu" rakamı bu sıfırlar atıldıktan sonra **tam olarak
   426 tekil müşteri** ile doğrulandı (494 satır-bazlı ve tekrarlı sayımdı).
4. **Tarih aralığı ~7.5 ay**, brief'te "birkaç ay" deniyordu:
   2025-12-12 → 2026-07-24 (224 gün), yıl sınırını aşıyor.
5. **`Agirlik` gram cinsinden.** Medyan 185.500 → 185,5 kg/teslimat.
   Toplam 814 ton / 7,5 ay tutarlı. Çıktıda **kg'a bölündü**.
6. **`Ilce` %77 dolu** — 362 satırda boş. Geocode kalitesini doğrudan etkiliyor.
7. **36 satırda adres sadece `.`** — sokak seviyesinde çözülemez.

## Verilen kararlar

### 1. Dedup kuralı — `ilk_satir_st_birlestirildi`

1596 satır → 1401 tekil müşteri (195 fazlalık, 182 grup).

Kuralı tahminle değil ölçerek belirledim: **tekrar eden tüm 182 grupta
farklılaşan kolonlar yalnızca `STKodu` ve `STKod`** (satış temsilcisi kodu
ve adı). Kalan 75 kolon — adres, koordinat, durum dahil — her grupta
birebir aynı. Yani tekrar, brief'in tahmin ettiği gibi tamamen satış
temsilcisi kırılımından geliyor.

Bu yüzden "en dolu satırı seç" gibi bir heuristik gereksiz: hangi satırı
tutarsanız tutun aynı veriyi alırsınız. **İlk satır tutuluyor**, ve bilgi
kaybını önlemek için o müşterinin tüm temsilcileri `satis_temsilcileri`
alanında `|` ile birleştiriliyor (182 müşterinin birden fazla temsilcisi var).

ETL bu varsayımı her çalıştırmada yeniden doğruluyor. `STKodu`/`STKod`
dışında farklılaşan bir kolon çıkarsa otomatik olarak "satırdaki dolu hücre
sayısı en yüksek kaydı seç" moduna düşüyor ve uyarı basıyor.

### 2. Bölge kapsamı — 8 il

Onayınızla: **çekirdek 5 il + Balıkesir + Çanakkale + Uşak. Antalya hariç.**

| İl | Müşteri | Rutta | Sevkiyatlı | Ciro |
|---|---|---|---|---|
| İzmir | 597 | 444 | 237 | 31,3 M ₺ |
| Aydın | 168 | 112 | 69 | 4,1 M ₺ |
| Muğla | 131 | 67 | 37 | 8,9 M ₺ |
| Manisa | 117 | 115 | 44 | 5,3 M ₺ |
| Denizli | 94 | 51 | 17 | 0,9 M ₺ |
| **Balıkesir** | 115 | 114 | 10 | 0,35 M ₺ |
| **Çanakkale** | 59 | 59 | 1 | 0,10 M ₺ |
| **Uşak** | 11 | 7 | 6 | 0,49 M ₺ |
| ~~Antalya~~ | ~~47~~ | ~~2~~ | ~~1~~ | ~~0,10 M ₺~~ |

Gerekçeler:
- **Balıkesir/Çanakkale dahil**: 174 müşterinin 173'ü aktif rutta ve
  hepsinin `Durum=Aktif`. Sevkiyat kaydı az olması bu rotaların sevkiyat
  raporunun kapsadığı araç/dönemde olmamasından; atıl saha değiller.
- **Uşak dahil**: idari olarak zaten Ege (İç Ege). 11 müşteride 494 bin ₺ —
  müşteri başına ciroda çekirdek Denizli'yi (94 müşteri / 911 bin ₺) geçiyor.
- **Antalya hariç**: 47 müşterinin 45'i Pasif/İptal, sadece 2'si rutta.
  Fiilen ölü bir bölge, haritaya çoğunlukla gürültü eklerdi.

Bölge dışı kalan 109 müşteri silinmedi, `cikti/bolge_disi_musteriler.csv`
dosyasına ayrıldı.

### 3. Durum filtresi — filtre yok

Onayınızla 1292 müşterinin tamamı korunuyor (970 Aktif, 274 Pasif, 48 İptal).
`durum` kolonu çıktıda taşınıyor; filtreleme harita/UI katmanında yapılacak.
ETL hiçbir kaydı durumu yüzünden silmiyor.

### 4. Geocode stratejisi — kademeli, sokak kademesi bilerek yok

Nominatim'in Türkiye sokak/kapı numarası kapsamı **yok**. Ölçtüm:
temizlenmiş sokak adresiyle 27 örnekte isabet **0/27**. Bu kademe
kaldırıldı — tutulsaydı ~600 boşa istek (~11 dakika) ekleyecekti.

Kalan kademeler:
1. **`X Mahallesi, İlçe, İl, Türkiye`** — asıl çalışan kademe
2. **`İlçe, İl, Türkiye`** — mahalle çözülemezse

Her sonuç iki kez doğrulanıyor: Türkiye sınırları içinde mi, ve beklenen
ilin merkezine ~180 km'den yakın mı. Uymayan sonuç reddediliyor.

Adres metninden ilçe tahmin etmeyi **denedim ve attım**: 133 ilçelik bir
sözlükle eşleştirme yanlış sonuç üretiyordu — "ADNAN MENDERES MAH." bir
Aydın müşterisini İzmir'in Menderes ilçesine, "YILDIRIM MH." Bursa'nın
Yıldırım'ına gönderiyordu. 202 boş ilçenin sadece 23'ünü dolduruyor,
çoğu da hatalı. Sessizce yanlış koordinat üretmektense boş bırakmak doğru.

**Hassasiyet açıkça işaretli** — `geocode_hassasiyet` kolonu:

| Değer | Anlamı | Yaklaşık hata |
|---|---|---|
| `saha_gps` | ERP'de zaten kayıtlı, saha ekibi GPS'i | metre |
| `mahalle_merkezi` | Nominatim mahalle centroid'i | ~0,5–1 km |
| `ilce_merkezi` | Nominatim ilçe centroid'i | ~5 km |
| `yok` | Çözülemedi | — |

Sonuç: **1203 / 1292 müşteri konumlandı (%93,1)** — 421'den başlayıp.

| Hassasiyet | Adet | Oran |
|---|---|---|
| `mahalle_merkezi` | 501 | %38,8 |
| `saha_gps` | 421 | %32,6 |
| `ilce_merkezi` | 281 | %21,7 |
| `yok` | 89 | %6,9 |

⚠️ `mahalle_merkezi` ve `ilce_merkezi` kayıtları **centroid** olduğu için
aynı mahalledeki müşteriler haritada **tam olarak üst üste biner**. 1203
kayıt 833 tekil noktaya düşüyor; en kalabalık nokta 18 müşteri barındırıyor.
Harita katmanında marker clustering kullanın ve bu noktaları "kesin adres"
gibi göstermeyin — `geocode_hassasiyet` alanı tam da bunun için var.

### Geocode edilemeyen 89 müşteri

Hepsinin **tek ve ortak sebebi var: `Ilce` boş.** İlçe olmadan
"X Mahallesi, İZMİR" sorgusu çok belirsiz kalıyor, ilçe kademesi de hiç
çalışamıyor. Dağılım: Çanakkale 29, Balıkesir 19, Denizli 19, Manisa 9,
Aydın 5, Muğla 5, İzmir 3. Bunların **75'i aktif rutta**, 8'inin sevkiyat
geçmişi var — yani gerçek, çalışılan müşteriler.

İlçeyi başka kaynaktan kurtarmayı denedim, **olmadı**:
- `RutTanimListesi.Adres2` bu 89 kaydın 51'inde dolu ama brief'te belirtilen
  "İLÇE / İL" formatında **değil** — sadece ikinci bir serbest sokak satırı.
- Adres metninden ilçe sözlüğüyle eşleştirme yanlış sonuç üretiyordu
  (yukarıda anlatıldı).

Uydurma koordinat üretmektense boş bırakıldı; tamamı
`cikti/geocode_basarisiz.csv`'de listeli. **Kalıcı çözüm ETL'de değil
kaynakta**: Panorama'da bu 89 müşterinin `Ilce` alanı doldurulursa,
`geocode_cache.json` korunarak ETL yeniden çalıştırıldığında sadece bu
kayıtlar için ağa çıkılır ve kapsama ~%99'a çıkar.

Nominatim kullanım politikasına uyuluyor: istekler arası 1,1 sn, tanımlayıcı
User-Agent. Tüm yanıtlar `geocode_cache.json`'a yazılıyor — script yeniden
çalıştırıldığında ağa hiç çıkmaz, kesilirse kaldığı yerden devam eder.

## Çıktı şeması

`cikti/musteriler_temiz.csv` — brief'te istenen 14 alan + harita/risk için
gereken bağlam alanları:

| Kolon | Tip | Not |
|---|---|---|
| `musteri_kodu` | text | Birincil anahtar |
| `unvan` | text | |
| `adres` | text | |
| `sehir` / `ilce` | text | |
| `lat` / `lon` | float | Boş olabilir — `geocode_basarisiz.csv`'ye bakın |
| `rut_kod` / `rut_aciklama` / `ziyaret_sira` | text/int | RutTanimListesi'nden |
| `son_teslimat_tarihi` | date | `YYYY-MM-DD` |
| `toplam_teslimat_sayisi` | int | |
| `toplam_agirlik` | float | **kg** (kaynak gramdı) |
| `toplam_tutar` | float | ₺ |
| `ilk_teslimat_tarihi` | date | *ek* |
| `son_teslimattan_gecen_gun` | int | *ek* — risk skoru için |
| `durum` | text | Aktif/Pasif/İptal |
| `musteri_grubu` | text | PETSHOP / VETERİNER / YEM TOPTAN … |
| `bolge_grubu` | text | `cekirdek` / `sinir_dahil` |
| `geocode_kaynak` / `geocode_hassasiyet` | text | Konum güvenilirliği |
| `satis_temsilcileri` | text | `|` ile ayrık, dedup'ta korundu |
| `telefon` / `posta_kodu` | text | |

## Join güvenliği

Join anahtarları hiçbir dönüşüm gerektirmedi — isimleri farklı
(`MusteriKod` / `MusteriKodu`) ama değerler birebir uyumlu:

- MusteriListesi ∩ RutTanim = **1016 / 1016** (rut tarafının tamamı çözüldü)
- MusteriListesi ∩ Sevkiyat = **437 / 437** (sevkiyat tarafının tamamı çözüldü)

Rut tarafı 1:1 (her müşteri tek rutta), sevkiyat önce müşteri bazında
özetleniyor. İki join de sol tabloyu çoğaltmıyor; ETL bunu her çalıştırmada
satır sayısı karşılaştırarak doğruluyor.

## Supabase'e yükleme

Kimlik bilgileri koda gömülü değil — repo kökündeki `.env` veya ortam değişkeninden okunur.

Şema kurulumu: **`../sql/sema.sql`** (Supabase Studio → SQL Editor).
`--sema-yaz` eski bir ETL dump'ı üretir; üretimdeki `musteriler_harita` view'ını bozabilir, kullanmayın.

`musteriler` tablosunu, indeksleri ve `musteriler_harita` view'ını `sql/sema.sql` kurar.
View, koordinatı olan kayıtları `risk_durumu` ile birlikte döndürür
(`saglikli` / `izlenmeli` >45 gün / `riskli` >90 gün / `hic_teslimat_yok`).

Sonra kimlik bilgilerini verip yükleyin:

```bash
$env:SUPABASE_URL = "https://xxxx.supabase.co"
```

```bash
$env:SUPABASE_SERVICE_KEY = "eyJhbGci..."
```

```bash
python supabase_yukle.py --dogrula
```

`--dogrula` bağlantıyı ve CSV'yi kontrol eder, hiçbir şey yazmaz. Sorun
yoksa:

```bash
python supabase_yukle.py
```

`musteri_kodu` üzerinden upsert (`merge-duplicates`) yapar — tekrar
çalıştırmak güvenlidir, kayıt çoğaltmaz. Bir parça hata verirse script durur
ve kaç satırın yazıldığını söyler; düzeltip baştan çalıştırabilirsiniz.

`SUPABASE_SERVICE_KEY` RLS'i bypass eden `service_role` anahtarıdır —
sunucu tarafında tutun, tarayıcıya/repoya koymayın.

## Doğrulama

```bash
python dogrula.py
```

ETL'in kendi loguna güvenmez — çıktı CSV'sindeki her sayıyı ham Excel'lerden
bağımsız olarak yeniden hesaplayıp karşılaştırır: bölge filtresi, rut
eşleşmesi, teslimat sayıları, tutar/ağırlık toplamları, son teslimat
tarihleri, koordinat sınırları ve koda gömülü sır taraması. Herhangi bir
kontrol düşerse çıkış kodu 1 döner.

Son çalıştırma: **20/20 kontrol geçti.**

## Tekrar çalıştırma

- `python etl_musteri.py --skip-geocode` → ağa çıkmadan tüm dönüşümleri
  çalıştırır (~2 sn). Mantık değişikliğini test etmek için.
- `python etl_musteri.py --geocode-limit 50` → sadece 50 kayıt geocode eder.
- `geocode_cache.json` durduğu sürece tam çalıştırma da ağa çıkmaz.
