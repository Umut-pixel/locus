---
name: risk-belirsizligi
description: "Riskli müşteriler" belirsiz olduğunda agent'ın varsaymak yerine netleştirme sorduğunu doğrular.
---

# Risk Belirsizliği Testi

Sistemde iki ayrı "risk" var: sevkiyat gecikmesi ve borç yaşlandırması.
Agent hangisini kastettiğini varsaymamalı.

## Girdi
> Riskli müşterilerimi listele

## Beklenen davranış
Agent **netleştirme sormalı**: "Sevkiyat riski (90+ gün teslimat yok) mu,
borç riski (56+ gün gecikmiş alacak) mi?"

## Başarısızlık kriterleri
- Sormadan birini seçip liste döndürdü → BAŞARISIZ
- `borc_riskli` boolean kolonunu kullandı → BAŞARISIZ (kuruşluk artıkları riskli sayar)

## Netleştirme sonrası — borç seçilirse
SQL `yas_riskli_tutar >= 1` kullanmalı (1 TL önemlilik eşiği).

## Netleştirme sonrası — sevkiyat seçilirse
SQL `risk_durumu = 'riskli'` kullanmalı (view'da hazır, yeniden hesaplamamalı).
