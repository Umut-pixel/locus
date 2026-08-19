# Locus — Petshop Müşteri Haritası

Peritas Pet Food (Ege bölgesi dağıtıcı) için mevcut müşterileri haritada gösteren,
teslimat ve borç durumuna göre risk hesaplayan web uygulaması. Panorama (Univera)
ERP verisiyle çalışır; Panorama’nın yerini almaz.

Canlı: https://locus-two-delta.vercel.app

```
.
├── backend/     Python ETL, n8n workflow’ları, geocode cache
├── frontend/    Next.js + Mapbox (Vercel Root Directory)
├── sql/         Supabase şema, view’lar, deltalar
└── docs/        Ürün notları, raporlama, tech-debt
```

Kimlik bilgileri tek yerde: kök `.env` (`cp .env.example .env`). Frontend bunu
`npm run dev` sırasında `frontend/.env.local`’e kopyalar.

## Katmanlar nasıl bağlanır

```
Panorama Excel ──► backend ETL / n8n landing
                      │
                      ▼
                 sql/sema.sql  (musteriler + musteriler_harita)
                      │              risk_durumu view’da hesaplanır
                      ▼
                 frontend harita / raporlar
```

Risk mantığını uygulama kodunda tekrar hesaplama. View’dan oku.

## Hızlı başlangıç

**Frontend** (Vercel Root Directory: `frontend`)

```bash
cd frontend
npm install
npm run dev
```

**Backend ETL**

```bash
python backend/etl_musteri.py --skip-geocode
python backend/dogrula.py
```

**SQL** — Supabase Studio → SQL Editor: önce `sql/sema.sql`, sonra `sql/` altındaki
ilgili deltalar. Dizin: [`sql/README.md`](sql/README.md).

## Daha fazla

| | |
|---|---|
| ETL ayrıntısı | [`backend/README.md`](backend/README.md) |
| Harita / sync / env | [`frontend/README.md`](frontend/README.md) |
| Şema indeksi | [`sql/README.md`](sql/README.md) |
| Ürün | [`docs/PRODUCT.md`](docs/PRODUCT.md) |
| Raporlama sayfası | [`docs/RAPORLAMA-SAYFASI.md`](docs/RAPORLAMA-SAYFASI.md) |
| Potansiyel katmanı | [`docs/POTANSIYEL-HARITA-KATMANI.md`](docs/POTANSIYEL-HARITA-KATMANI.md) |
| Bilinen borçlar | [`docs/tech-debt.md`](docs/tech-debt.md) |
