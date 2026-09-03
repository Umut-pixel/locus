"""Router'ın Opus'suz sabitlediği kısa cevaplar."""

CLARIFY_RISK = (
    "Hangisini kastediyorsun?\n\n"
    "- **Sevkiyat riski** — son teslimatın üzerinden 90+ gün geçmiş "
    "müşteriler.\n"
    "- **Borç riski** — 56 günü aşan gecikmiş alacağı olan müşteriler.\n\n"
    "Kuruşluk artıkları riskli saymıyorum; 1 TL'nin altındaki bakiye "
    "listeye girmez."
)

OOS = (
    "Bu veride yok. Locus'ta kredi notu, rakip satışı veya bu sistemin "
    "dışındaki kayıtlar yok. Ciro, borç, sevkiyat, stok/SKT sorabilirsin."
)

#: Rapor çekme seçim kartı — tamamen sabit, hiçbir model çağrılmıyor.
#:
#: `secenekler` bilerek YOK: listeyi arayüz kendi kayıt defterinden okuyor
#: (frontend/lib/panorama-raporlar.ts). Burada tekrarlansaydı rapor adı ya da
#: süresi değiştiğinde iki yer birbirinden sapardı.
RAPOR_SECIM = (
    "Hangi raporları çekeyim? Aşağıdan seç — yalnız işaretlediklerin "
    "çekilir, gerisi atlanır.\n\n"
    "```locus\n"
    '{"kind": "secim", "title": "Çekilecek raporlar", '
    '"aksiyon": "rapor_cek", "coklu": true}\n'
    "```"
)
