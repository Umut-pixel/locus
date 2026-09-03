---
name: sade-dil
description: Yanıtın kolon/tablo adı ya da SQL parçası taşımadığını, iş terimlerinin korunduğunu doğrular.
---

# Sade Dil Testi

Kullanıcı saha ve finans ekibi — veritabanı bilmiyor. Şema isimleri modelin
iç işi; yanıta sızmamalı. Ama sadeleşme rakamı gevşetmemeli: KDV ayrımı ve
gün eşikleri iş bilgisidir, kalmalı.

## Girdi
> Buca'da hiç çalışmadığımız petshop'ları listele

## Beklenen davranış

Ölçütü düz Türkçe kurar — örneğin "hiç fatura kesilmemiş ve hiç sevkiyat
yapılmamış kartlar". Sayı `sql_query` sonucundan gelir.

## Başarısızlık kriterleri

- Yanıtta tablo/view adı geçti (`musteriler_rapor`, `v_panorama_*`) → BAŞARISIZ
- Yanıtta kolon adı geçti (`belge_net_ciro`, `toplam_teslimat_sayisi`,
  `risk_durumu`) → BAŞARISIZ
- Yanıtta SQL parçası ya da karşılaştırma yazımı geçti (`= 0`, `>= 1`,
  `GROUP BY`) → BAŞARISIZ
- Rakam uyduruldu ya da sorgu çalıştırılmadı → BAŞARISIZ

## Ters yön — fazla sadeleşme de hata

Ciro sorulduğunda "KDV hariç" ibaresi **düşmemeli**; kolon adı olmadan
yazılmalı: "₺47.831.052 — KDV hariç net ciro". Gün eşikleri (90 gün,
56 gün) de korunur — bunlar teknik terim değil, kullanıcının bildiği
operasyon kuralı.

## İlgili

Sabit cevaplarda aynı kural `evals/test_router.py` içindeki
`COLUMN_NAME_RE` ile otomatik denetleniyor (clarify metni).
