# Melih'e not — Excel'deki ciro ile ekrandaki ciro neden farklı? (18 Ağustos 2026)

Merhaba Melih,

Panorama'dan aldığın Belge Detay Raporu'nda "Net Tutar" kolonunu topladığında
**57.828.023 TL** çıkıyor, ekranda ise **47.454.053 TL** görünüyor. Aradaki fark
bir hata değil — iki ayrı sebebi var ve ikisi de kasıtlı. Aşağıda adım adım.

---

## Kısaca

| Adım | Tutar | Ne oldu |
|---|---:|---|
| Excel'de "Net Tutar" kolonu toplamı | **57.828.023** | Başlangıç |
| − KDV (%20) | −9.638.004 | KDV satış geliri değil, devlete ödenen vergi |
| **= KDV hariç net satış** | **48.190.020** | |
| − Ege dışı 25 müşteri | −1.502.613 | Bu harita 8 Ege iliyle sınırlı |
| **= Ekranda gördüğün rakam** | **46.687.406** | *(elindeki 17 Ağustos dosyası için)* |
| + 18 Ağustos günü satışları | +766.646 | Ekran bir gün daha güncel |
| **= Ekrandaki güncel rakam** | **47.454.053** | ✓ |

---

## Sebep 1 — "Net Tutar" kolonu aslında KDV dahil (9,6 milyon)

Bu, raporun en kafa karıştırıcı yeri: Panorama'nın **"Net Tutar"** dediği kolon
net satış değil, **KDV dahil toplam tutar**. Yani müşteriden tahsil edilen para.

Aynı satırdaki diğer kolonlarla kontrol edebilirsin — raporun **her satırında**
istisnasız şu geçerli:

```
Net Tutar = (Brüt Tutar − İskonto) × 1,20
```

Örnek olarak toplamlar üzerinden:

```
Brüt Tutar         68.502.562
− İskonto          20.312.543
= 48.190.020   ← KDV hariç gerçek satış geliri
+ KDV (%20)         9.638.004
= 57.828.023   ← "Net Tutar" kolonu
```

Ekrandaki **"Net Ciro"**, muhasebe anlamında ciro yani **KDV hariç** rakamı
gösteriyor: `Brüt − İskonto`. KDV senin gelirin değil, devlet adına tahsil edip
beyan ettiğin tutar — bu yüzden ciroya dahil edilmiyor.

> Excel'de kendin kontrol etmek istersen: `Net Tutar` toplamını **1,20**'ye böl,
> `Brüt Tutar − İskonto` sonucunu bulursun.

## Sebep 2 — Ege dışı müşteriler (1,5 milyon)

Panorama'nın belge raporu **tüm bayi bölgesini** kapsıyor (Ege ve Akdeniz).
Locus haritası ve raporu ise başından beri **8 Ege iliyle** sınırlı:
İzmir, Manisa, Aydın, Muğla, Denizli, Balıkesir, Çanakkale, Uşak.

Bu 8 il dışında kalan **25 müşterinin 1.502.613 TL** cirosu var. En büyüğü tek
başına 735.064 TL ile Ankara'daki ARCA PETSHOP. Diğerleri ağırlıklı İstanbul
(11 müşteri), Bursa (5), Ankara (3), Adana (2), ayrıca Antalya, Eskişehir,
Kocaeli, Konya.

**Bu rakam artık ekranda görünüyor.** Rapor sayfasının alt şeridine "bölge dışı"
satırı ekledik — böylece Panorama ile karşılaştırdığında farkı ekleyip mutabık
kalabilirsin. Müşteriler listede tek tek çıkmıyor, sadece toplam olarak.

Bu 25 müşteriyi haritaya da eklemek istersen mümkün, ama o zaman harita artık
"Ege Bölgesi müşteri haritası" olmaktan çıkar — karar senin, haber ver.

---

## Bu arada iki düzeltme yaptık

Denetim sırasında iki hata bulup düzelttik, ekrandaki toplam bu yüzden bir
miktar oynadı (47.335.100 → 47.454.053):

1. **İade satırlarının bir kısmı sayılmıyordu.** Bazı iade belgelerinde belge
   numarası farklı müşterilerde tekrar ediyor; sistem bunları "aynı satır"
   sanıp atıyordu. 35 satır düşüyordu ve hepsi iade olduğu için ciro olduğundan
   **yüksek** görünüyordu. Düzeltildi.

2. **Koordinatı olmayan 12 müşteri rapordan düşüyordu.** Rapor sayfası harita
   verisini okuduğu için, adresi haritaya oturtulamamış müşteriler toplama hiç
   girmiyordu — 240.626 TL. Artık rapor haritadan bağımsız, cirosu olan herkes
   toplama giriyor.

---

## Hangi rakamı ne zaman kullanmalı

- **Ciro / satış performansı konuşurken** → ekrandaki **Net Ciro** (KDV hariç).
  Muhasebe ve gerçek gelir bu.
- **Tahsilat / müşteri borcu konuşurken** → KDV dahil tutar. Müşteri sana
  KDV'li tutarı ödüyor. Bu veri sistemde duruyor, ekranda göstermemizi
  istersen ekleyebiliriz.

Sorusu olan olursa haber ver.
