<!-- Kurum hafızası. Bu dosyaya yazılan her şey sonraki her turda, her çağıran için okunur. Kişisel veri / müşteri finansal detayı yazma. -->

## Veri kalitesi notları

- `musteri_metrik_gecmis.net_ciro` kümülatif ama **seviye kırılmaları** içeriyor
  (2026-08 ölçümü: 08-10, 08-13 ve 08-18'de toplam sırasıyla -%32 / -%17 / -%50
  düştü; 08-14→08-15 gibi küçük negatif adımlar da var). Günlük ciro'yu
  ardışık fark alarak hesaplamak bu tarihlerde absürt/negatif değer üretir.
  Fark bazlı günlük seri kurmadan önce seviye kırılmasını kontrol et, kırılan
  günleri dışla veya kullanıcıya bildir.
- `musteri_metrik_gecmis` risk kolonu içermez. Risk kırılımlı trend için
  `musteriler_rapor`'un **bugünkü** risk etiketi geçmişe uygulanır — bunu
  yanıtta varsayım olarak belirt.

