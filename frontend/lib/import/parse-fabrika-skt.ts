import type { UrunSktUpdateRow } from "./types";
import { cellStr, metinTemizle, sayiyaCevir } from "./utils";

/**
 * Fabrika (ARMA İlaç) alış raporu → ürün SKT / parti kayıtları.
 *
 * Panorama'dan GELMEZ; fabrikanın 15 günde bir e-posta ile gönderdiği dosya.
 * Kolonlar Panorama'nın camelCase'i yerine boşluklu Türkçe ("Belge Tip",
 * "Matbu No", "Ürün") — bu yüzden detect-type onu diğer 5 tiple karıştırmaz.
 *
 * Kritik: SKT hücreleri readWorkbook'a `{ cellDates: false, raw: true }` ile
 * okutulmalı. `cellDates: true` ile gelen Date nesnesi bir gün geri kayıyor
 * (bkz. read-workbook.ts). Burada hücre ya ham Excel seri numarası (sayı) ya
 * da metin olarak bekleniyor.
 */

/** Excel'in 1899-12-30 epoch'u — UTC ile, ortam saat diliminden bağımsız. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
/** Makul SKT seri aralığı: ~1954 – ~2064. Dışındakiler tarih sayılmaz. */
const SERI_MIN = 20000;
const SERI_MAX = 60000;

/** "ESKİ BAYİ DEVİR" — eski bayiden devralınan stok; o bayi artık yok, SKT kalıcı olarak bilinmiyor. */
const DEVIR_ETIKETI = "ESKI BAYI DEVIR";

/** gg.aa.yyyy — metin hücrelerinde tarih SADECE bu formatta kabul edilir. */
const NOKTA_TARIH = /(\d{1,2})\.(\d{1,2})\.(\d{4})/g;

/**
 * "705 ADET/04.09.2027" — parti bazında gerçek adedin yazıldığı tek format
 * (dosyada 2 hücre). Adet burada saklanmıyor: 685 SKT hücresinin 2'si için
 * ayrı kolon açmak, çok partili satırlardaki genel belirsizliği çözmüyor.
 */
const ADET_ONEKI = /^\d+\s*ADET\s*$/i;

function serialToIso(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const d = new Date(EXCEL_EPOCH_UTC + Math.round(serial) * 86400000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function isoTarih(gun: number, ay: number, yil: number): string | null {
  const d = new Date(Date.UTC(yil, ay - 1, gun));
  if (
    d.getUTCFullYear() !== yil ||
    d.getUTCMonth() !== ay - 1 ||
    d.getUTCDate() !== gun
  ) {
    return null;
  }
  return d.toISOString().slice(0, 10);
}

/** Türkçe İ/I tuzağına düşmeden büyük harfe indir. */
function trBuyuk(value: string): string {
  return value.replace(/İ/g, "I").replace(/ı/g, "i").toLocaleUpperCase("tr-TR");
}

/** "2026.05.20" | "20.05.2026" | Date | seri → ISO. Belge tarihi kolonu için. */
export function parseIslemTarihiFabrika(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return serialToIso(value);
  }
  const s = String(value ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(s);
  if (m) return isoTarih(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return isoTarih(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return isoTarih(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

export type SktDurumu = "tarihli" | "cozulemedi" | "devir" | "kayit_yok";

interface SktHucre {
  durum: SktDurumu;
  sktTarihi: string | null;
  partiNo: string | null;
}

const BOS_HUCRE: SktHucre = {
  durum: "kayit_yok",
  sktTarihi: null,
  partiNo: null,
};

/**
 * Tek bir SKT hücresini çöz.
 *
 * Metin hücrelerinde SADECE gg.aa.yyyy tarih sayılır. Düz slash biçimi
 * BİLİNÇLİ olarak tarih kabul edilmez: dosyadaki "50/25/3073", "32/26/6010"
 * gibi 7 değer tarih değil PARTİ KODU (2026-08-21'de tek tek doğrulandı) —
 * bunları tarihe çevirmek uydurma SKT üretirdi.
 */
export function parseSktHucresi(value: unknown): SktHucre {
  if (value == null) return BOS_HUCRE;

  if (typeof value === "number") {
    if (value === 0) return BOS_HUCRE;
    if (value >= SERI_MIN && value <= SERI_MAX) {
      const tarih = serialToIso(value);
      return tarih
        ? { durum: "tarihli", sktTarihi: tarih, partiNo: null }
        : { durum: "cozulemedi", sktTarihi: null, partiNo: String(value) };
    }
    return { durum: "cozulemedi", sktTarihi: null, partiNo: String(value) };
  }

  const ham = String(value).trim();
  if (!ham || ham === "0") return BOS_HUCRE;
  if (trBuyuk(ham) === DEVIR_ETIKETI) {
    return { durum: "devir", sktTarihi: null, partiNo: null };
  }

  // Hücredeki TÜM gg.aa.yyyy tarihlerini topla.
  NOKTA_TARIH.lastIndex = 0;
  const tarihler: { iso: string; index: number; uzunluk: number }[] = [];
  for (let m = NOKTA_TARIH.exec(ham); m; m = NOKTA_TARIH.exec(ham)) {
    const iso = isoTarih(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) tarihler.push({ iso, index: m.index, uzunluk: m[0].length });
  }

  if (tarihler.length === 0) {
    // Parti kodu ya da tanınmayan biçim — tarih uydurma.
    return { durum: "cozulemedi", sktTarihi: null, partiNo: ham };
  }

  // İki tarihli hücreler (ör. "24.10.2032/11.11.2035", kedi kumu) üretim/SKT
  // çifti; hangisinin önce yazıldığına güvenmeden EN GEÇ olanı SKT sayıyoruz.
  const enGec = tarihler.reduce((a, b) => (b.iso > a.iso ? b : a));

  // Tarihten önceki kısım parti numarası olabilir ("939/02.10.2027").
  const onEk = ham.slice(0, tarihler[0]!.index).replace(/[/\-\s:]+$/, "").trim();
  const partiAdayi =
    onEk === "" ||
    ADET_ONEKI.test(onEk) ||
    // Ön ek kendisi bir tarihse parti değil, üretim tarihidir.
    tarihler.some((t) => t.index === 0)
      ? null
      : metinTemizle(onEk) || null;

  return { durum: "tarihli", sktTarihi: enGec.iso, partiNo: partiAdayi };
}

export interface ParseFabrikaSktSonuc {
  /** urun_kodu HENÜZ boş — katalog eşleştirmesi API route'da yapılır. */
  rows: UrunSktUpdateRow[];
  /** Dosyadaki alım kalemi (satır) sayısı. */
  islenenSatir: number;
  /** Benzersiz ürün adları — route bunları urun_kodu'na çevirir. */
  urunAdlari: string[];
  sayimlar: Record<SktDurumu, number>;
  /** Dosyanın kapsadığı alım tarihi aralığı — ekranda "veri ne kadarını kapsıyor" için. */
  donemBas: string | null;
  donemBit: string | null;
  /** Birden fazla parti taşıyan kalem sayısı — miktar bu satırlarda partiye bölünemiyor. */
  cokPartiliSatir: number;
}

/**
 * Bir alım kalemi = 1..5 SKT hücresi. Dolu hücre yoksa da TEK satır yazılır
 * (durum='kayit_yok'): "kaç kalemde SKT kaydı yok" sorusu ancak böyle
 * cevaplanabiliyor, ekrandaki "kısmi kapsam" uyarısını bu besliyor.
 */
export function parseFabrikaSktRaporu(
  rows: Record<string, unknown>[]
): ParseFabrikaSktSonuc {
  const out: UrunSktUpdateRow[] = [];
  const urunAdlari = new Set<string>();
  const sayimlar: Record<SktDurumu, number> = {
    tarihli: 0,
    cozulemedi: 0,
    devir: 0,
    kayit_yok: 0,
  };
  const tarihler: string[] = [];
  let islenenSatir = 0;
  let cokPartiliSatir = 0;

  // Başlık metnine birebir bağlanmamak için: "SKT" ile başlayan tüm anahtarlar
  // (SheetJS tekrar eden başlıklara _1.._4 ekliyor).
  const sktAnahtarlari =
    rows.length > 0
      ? Object.keys(rows[0]!).filter((k) => trBuyuk(k.trim()).startsWith("SKT"))
      : [];

  for (const row of rows) {
    const urunAdi = metinTemizle(cellStr(row, "Ürün", "Urun"));
    if (!urunAdi) continue;

    islenenSatir += 1;
    urunAdlari.add(urunAdi);

    const matbuNo = metinTemizle(cellStr(row, "Matbu No", "MatbuNo")) || null;
    const islemTarihi = parseIslemTarihiFabrika(
      row["İşlem Tarihi"] ?? row["Islem Tarihi"] ?? row["IslemTarihi"]
    );
    if (islemTarihi) tarihler.push(islemTarihi);
    const satirMiktar = sayiyaCevir(row["Miktar"]);

    const cozulen = sktAnahtarlari
      .map((k) => parseSktHucresi(row[k]))
      .filter((h) => h.durum !== "kayit_yok");

    if (cozulen.length > 1) cokPartiliSatir += 1;

    const tekParti = cozulen.length <= 1;

    if (cozulen.length === 0) {
      sayimlar.kayit_yok += 1;
      out.push({
        urun_kodu: null,
        urun_adi: urunAdi,
        matbu_no: matbuNo,
        islem_tarihi: islemTarihi,
        satir_miktar: satirMiktar,
        parti_no: null,
        skt_tarihi: null,
        durum: "kayit_yok",
        tek_parti: true,
      });
      continue;
    }

    for (const h of cozulen) {
      sayimlar[h.durum] += 1;
      out.push({
        urun_kodu: null,
        urun_adi: urunAdi,
        matbu_no: matbuNo,
        islem_tarihi: islemTarihi,
        satir_miktar: satirMiktar,
        parti_no: h.partiNo,
        skt_tarihi: h.sktTarihi,
        durum: h.durum,
        tek_parti: tekParti,
      });
    }
  }

  tarihler.sort();

  return {
    rows: out,
    islenenSatir,
    urunAdlari: [...urunAdlari],
    sayimlar,
    donemBas: tarihler[0] ?? null,
    donemBit: tarihler[tarihler.length - 1] ?? null,
    cokPartiliSatir,
  };
}
