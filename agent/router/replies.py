"""Router'ın Opus'suz sabitlediği kısa cevaplar."""

CLARIFY_RISK = (
    "Hangisini kastediyorsun?\n\n"
    "- **Sevkiyat riski** — son teslimattan 90+ gün geçmiş "
    "(`risk_durumu = 'riskli'`).\n"
    "- **Borç riski** — 56+ gün gecikmiş alacak, 1 TL eşiği "
    "(`yas_riskli_tutar >= 1`).\n\n"
    "`borc_riskli` bayrağını kullanmıyorum; kuruşluk artıklar risk sayılmaz."
)

OOS = (
    "Bu veride yok. Locus'ta kredi notu, rakip satışı veya bu sistemin "
    "dışındaki kayıtlar yok. Ciro, borç, sevkiyat, stok/SKT sorabilirsin."
)
