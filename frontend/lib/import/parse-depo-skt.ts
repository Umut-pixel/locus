import { parseSktHucresi, type SktDurumu } from "./parse-fabrika-skt";
import type { UrunSktUpdateRow } from "./types";
import { cellStr, sayiyaCevir } from "./utils";

/**
 * Depo fiziksel sayım föyü ("PATİGO DEPO SKT BİLGİSİ.xlsx") → ürün SKT/parti.
 *
 * Panorama'dan GELMEZ; depoda elle tutulup e-posta ile geliyor. Fabrika alış
 * raporundan iki temel farkı var:
 *
 *  1. Ürün KODU dosyada yazıyor — ad üzerinden katalog eşleştirmesine gerek yok
 *     (fabrika dosyasında yalnızca ad var, bkz. write-urun-skt.ts).
 *  2. Her partinin ADEDİ yazıyor (SAYIM kolonu). Fabrika dosyasında miktar
 *     yalnızca alım kalemi düzeyinde ve çok partili kalemlerde bölünemiyordu;
 *     burada "bu SKT'den şu kadar adet var" GERÇEKTEN söylenebiliyor.
 *
 * Kolon düzeni: Depo Kodu · Depo Adı · Ürün Kodu · Grup · Ürün · DEPO STOK ·
 * (SAYIM, SKT) × N. Tekrar eden başlıkları SheetJS `_1`, `_2` ile ayırıyor;
 * eşleştirme başlık metnine değil KOLON SIRASINA göre yapılıyor, çünkü hangi
 * SAYIM'ın hangi SKT'ye ait olduğunu yalnızca sıra söylüyor.
 *
 * DEPO STOK, Panorama'nın (ERP) stok rakamı; SAYIM toplamı ise fiziksel sayım.
 * İkisi BİRBİRİNİ TUTMUYOR — 2026-09-07 dosyasında 92 üründen 71'i farklı,
 * net +3.344 adet (%11,5). Bu yüzden sayım, ERP miktarının üzerine yazılmıyor:
 * ayrı kolonda tutulup ekranda mutabakat farkı olarak gösteriliyor.
 *
 * Kritik: SKT hücreleri readWorkbook'a `{ cellDates: false, raw: true }` ile
 * okutulmalı — `cellDates: true` bir gün geri kaydırıyor (bkz. read-workbook.ts).
 */

/** Ürün kodu / adı kolonu. Föy Türkçe boşluklu başlık kullanıyor. */
const URUN_KODU_ANAHTARLARI = ["Ürün Kodu", "Urun Kodu", "UrunKodu"];
const URUN_ANAHTARLARI = ["Ürün", "Urun"];

/** Türkçe İ/I tuzağına düşmeden büyük harfe indir. */
function trBuyuk(value: string): string {
  return value.replace(/İ/g, "I").replace(/ı/g, "i").toLocaleUpperCase("tr-TR");
}

export interface SayimSktCifti {
  /** Adet kolonu; föyde SKT'siz SAYIM da olabiliyor. */
  sayimKey: string | null;
  /** SKT kolonu; sayımsız SKT de mümkün. */
  sktKey: string | null;
}

/**
 * (SAYIM, SKT) kolon çiftlerini KOLON SIRASINDAN çıkar.
 *
 * SheetJS satır nesnesinin anahtar sırası sayfadaki kolon sırasıdır; her SKT
 * kolonu kendisinden önce gelen ilk eşleşmemiş SAYIM kolonuna aittir. Sonunda
 * eşsiz kalan SAYIM da çift olarak dönüyor: adet, SKT'si yazılmadı diye
 * kaybolmamalı (föyde 6 böyle hücre var).
 */
export function sayimSktCiftleri(anahtarlar: string[]): SayimSktCifti[] {
  const ciftler: SayimSktCifti[] = [];
  let bekleyenSayim: string | null = null;

  for (const key of anahtarlar) {
    const buyuk = trBuyuk(key.trim());
    if (buyuk.startsWith("SAYIM")) {
      // Arka arkaya iki SAYIM: öncekinin SKT'si yok, tek başına yazılır.
      if (bekleyenSayim) ciftler.push({ sayimKey: bekleyenSayim, sktKey: null });
      bekleyenSayim = key;
    } else if (buyuk.startsWith("SKT")) {
      ciftler.push({ sayimKey: bekleyenSayim, sktKey: key });
      bekleyenSayim = null;
    }
  }
  if (bekleyenSayim) ciftler.push({ sayimKey: bekleyenSayim, sktKey: null });

  return ciftler;
}

/** Ürün bazlı ERP ↔ fiziksel sayım farkı — ekrandaki mutabakat şeridini besler. */
export interface SayimFarki {
  urunKodu: string;
  urunAdi: string;
  depoStok: number;
  sayim: number;
  /** sayim - depoStok. Pozitif = fiziksel sayımda ERP'den fazla mal var. */
  fark: number;
}

export interface ParseDepoSktSonuc {
  rows: UrunSktUpdateRow[];
  /** Dosyadaki ürün (satır) sayısı. */
  islenenSatir: number;
  sayimlar: Record<SktDurumu, number>;
  /** ERP (Panorama) stok toplamı — stok sayfasındaki `miktar` ile aynı kaynak. */
  depoStokToplam: number;
  /** Fiziksel sayım toplamı. */
  sayimToplam: number;
  /** DEPO STOK ile sayımı tutmayan ürün sayısı. */
  farkliUrunSayisi: number;
  /** En büyük farklar önce — uyarı metni bunlardan ilk birkaçını yazıyor. */
  farklar: SayimFarki[];
  /** Hiç sayım hücresi doldurulmamış ürün — "sayılmadı", "sıfır sayıldı" değil. */
  sayimsizUrun: number;
  /** Birden fazla parti taşıyan ürün sayısı. */
  cokPartiliUrun: number;
  /** Föyün kapsadığı depolar — bugün tek depo (ANA DEPO). */
  depoAdlari: string[];
}

export function parseDepoSktRaporu(
  rows: Record<string, unknown>[]
): ParseDepoSktSonuc {
  const out: UrunSktUpdateRow[] = [];
  const sayimlar: Record<SktDurumu, number> = {
    tarihli: 0,
    cozulemedi: 0,
    devir: 0,
    kayit_yok: 0,
  };
  const farklar: SayimFarki[] = [];
  const depolar = new Set<string>();

  const ciftler = rows.length > 0 ? sayimSktCiftleri(Object.keys(rows[0]!)) : [];

  let islenenSatir = 0;
  let depoStokToplam = 0;
  let sayimToplam = 0;
  let sayimsizUrun = 0;
  let cokPartiliUrun = 0;

  for (const row of rows) {
    const urunKodu = cellStr(row, ...URUN_KODU_ANAHTARLARI);
    const urunAdi = cellStr(row, ...URUN_ANAHTARLARI);
    // Kodsuz satır yazılmıyor: SKT rozeti stok tablosuna urun_kodu ile bağlanıyor.
    if (!urunKodu || !urunAdi) continue;

    islenenSatir += 1;

    const depoAd = cellStr(row, "Depo Adı", "Depo Adi", "DepoAd");
    if (depoAd) depolar.add(depoAd);

    const depoStok = sayiyaCevir(row["DEPO STOK"] ?? row["Depo Stok"]);
    depoStokToplam += depoStok ?? 0;

    const partiler: { miktar: number | null; hucre: ReturnType<typeof parseSktHucresi> }[] =
      [];
    for (const { sayimKey, sktKey } of ciftler) {
      const miktar = sayimKey ? sayiyaCevir(row[sayimKey]) : null;
      const hucre = sktKey ? parseSktHucresi(row[sktKey]) : parseSktHucresi(null);
      // Sıfır adet + boş SKT = kullanılmamış kolon; parti sayılmaz.
      if ((miktar == null || miktar === 0) && hucre.durum === "kayit_yok") continue;
      partiler.push({ miktar, hucre });
    }

    const urunSayimi = partiler.reduce((a, p) => a + (p.miktar ?? 0), 0);
    sayimToplam += urunSayimi;
    if (partiler.length === 0) sayimsizUrun += 1;
    if (partiler.length > 1) cokPartiliUrun += 1;

    if (depoStok != null && Math.abs(urunSayimi - depoStok) > 0.001) {
      farklar.push({
        urunKodu,
        urunAdi,
        depoStok,
        sayim: urunSayimi,
        fark: urunSayimi - depoStok,
      });
    }

    // Parti yoksa da TEK satır yazılır (durum='kayit_yok'): "bu ürün föyde var
    // ama hiç sayılmamış" ile "föyde hiç geçmiyor" ekranda ayrı şeyler.
    if (partiler.length === 0) {
      sayimlar.kayit_yok += 1;
      out.push({
        urun_kodu: urunKodu,
        urun_adi: urunAdi,
        matbu_no: null,
        islem_tarihi: null,
        satir_miktar: null,
        parti_no: null,
        skt_tarihi: null,
        durum: "kayit_yok",
        tek_parti: true,
        kaynak: "depo_sayim",
        depo_stok: depoStok,
        parti_miktar: null,
      });
      continue;
    }

    const tekParti = partiler.length === 1;
    for (const { miktar, hucre } of partiler) {
      sayimlar[hucre.durum] += 1;
      out.push({
        urun_kodu: urunKodu,
        urun_adi: urunAdi,
        matbu_no: null,
        islem_tarihi: null,
        satir_miktar: null,
        parti_no: hucre.partiNo,
        skt_tarihi: hucre.sktTarihi,
        durum: hucre.durum,
        // Fabrika kaynağının aksine adet HER ZAMAN partiye ait; bayrak burada
        // yalnızca "ürünün tek partisi var mı" bilgisini taşıyor.
        tek_parti: tekParti,
        kaynak: "depo_sayim",
        depo_stok: depoStok,
        parti_miktar: miktar,
      });
    }
  }

  farklar.sort((a, b) => Math.abs(b.fark) - Math.abs(a.fark));

  return {
    rows: out,
    islenenSatir,
    sayimlar,
    depoStokToplam,
    sayimToplam,
    farkliUrunSayisi: farklar.length,
    farklar,
    sayimsizUrun,
    cokPartiliUrun,
    depoAdlari: [...depolar],
  };
}
