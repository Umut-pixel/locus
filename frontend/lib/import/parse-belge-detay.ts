import type { BelgeOzetUpdateRow } from "./types";
import { cellStr, metinTemizle, sayiyaCevir } from "./utils";

/**
 * Aggregate'e giren belge tipleri.
 *
 * Panorama'nın Belge Tür filtresi değiştiğinden (2026-08) export'lar aynı
 * satırları artık "Satış" yerine "Satış - İade" etiketiyle veriyor. İkisi de
 * sayılır; eskiden bu set'in üstlendiği çift-kayıt koruması artık
 * belgeAnahtari() dedup'una devredildi.
 */
const KEEP_BELGE_TIP = new Set([
  "Satış",
  "Konsinye Satış",
  "Satış - İade",
  "Satış-İade",
]);

/**
 * IslemTarihi: YYYY.MM.DD | dd.mm.yyyy | Excel serial → ISO date (UTC).
 */
export function parseIslemTarihi(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const d = new Date(excelEpoch + value * 86400000);
    return Number.isNaN(d.getTime()) ? null : toIsoDate(d);
  }
  const s = String(value ?? "").trim();
  if (!s) return null;

  let m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(s);
  if (m) {
    return makeIso(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) {
    return makeIso(Number(m[3]), Number(m[2]), Number(m[1]));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    return makeIso(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  return null;
}

function makeIso(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return toIsoDate(d);
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function money(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return sayiyaCevir(value) ?? 0;
}

/** Türkçe İ/I tuzağına düşmeden küçük harfe indir. */
function trKucuk(value: string): string {
  return value.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
}

/**
 * Müşteriden iade hareketi mi? (IslemTip ör. "Müşteriden İade (Sağlam)")
 * İade satırlarında Nettutar/BrutTutar/Iskonto negatif gelir.
 */
function iadeSatiriMi(row: Record<string, unknown>): boolean {
  const islemTip = cellStr(row, "IslemTip", "islem_tip");
  return islemTip !== "" && trKucuk(islemTip).includes("iade");
}

/**
 * Belge satırı kimliği — landing tablosundaki unified_doc ile aynı öncelik
 * (MatbuNo → SiparisNo → FaturaNo) + Sira. Aynı satır birden fazla BelgeTip
 * etiketiyle geldiğinde bir kez sayılmasını sağlar. Kimlik üretilemezse ""
 * döner ve satır dedup'a sokulmaz.
 */
function belgeAnahtari(row: Record<string, unknown>): string {
  const belge =
    cellStr(row, "MatbuNo", "matbu_no") ||
    cellStr(row, "SiparisNo", "siparis_no") ||
    cellStr(row, "FaturaNo", "fatura_no");
  if (!belge) return "";
  return `${belge}|${cellStr(row, "Sira", "sira")}`;
}

function modeKey(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function modeInt(counts: Map<number, number>): number | null {
  let best: number | null = null;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

type Acc = {
  satir_sayisi: number;
  net_ciro: number;
  brut_ciro: number;
  iskonto_toplam: number;
  promo_satir: number;
  iptal_satir: number;
  siparis: Set<string>;
  fatura: Set<string>;
  dates: string[];
  vade: Map<number, number>;
  urunGrup: Map<string, number>;
  urun: Map<string, number>;
  stAdi: Map<string, number>;
  stKodu: Map<string, number>;
  /** En son işlem tarihindeki UrunGrup / Urun */
  sonUrunGrup: string | null;
  sonUrun: string | null;
  sonUrunTarih: string | null;
};

function emptyAcc(): Acc {
  return {
    satir_sayisi: 0,
    net_ciro: 0,
    brut_ciro: 0,
    iskonto_toplam: 0,
    promo_satir: 0,
    iptal_satir: 0,
    siparis: new Set(),
    fatura: new Set(),
    dates: [],
    vade: new Map(),
    urunGrup: new Map(),
    urun: new Map(),
    stAdi: new Map(),
    stKodu: new Map(),
    sonUrunGrup: null,
    sonUrun: null,
    sonUrunTarih: null,
  };
}

/**
 * BelgeDetayRaporu satırlarını müşteri aggregate'ine çevir.
 *
 * BelgeTip ∈ KEEP_BELGE_TIP; aynı belge satırı belgeAnahtari() ile bir kez sayılır.
 * İade satırları (IslemTip "…İade…") ciroya negatifleriyle girer — net_ciro,
 * brut_ciro ve iskonto_toplam böylece netleşir — ama satır sayısı, ürün/ST
 * frekansları ve son işlem tarihi gibi "satış aktivitesi" alanlarına girmez:
 * iade bir satış değil, satışın geri alınmasıdır.
 */
export function parseBelgeDetayRaporu(rows: Record<string, unknown>[]): {
  rows: BelgeOzetUpdateRow[];
  islenenSatir: number;
} {
  const byKod = new Map<string, Acc>();
  const gorulenBelge = new Set<string>();
  let islenenSatir = 0;

  for (const row of rows) {
    const belgeTip = metinTemizle(cellStr(row, "BelgeTip"));
    if (!KEEP_BELGE_TIP.has(belgeTip)) continue;

    const musteri_kodu = metinTemizle(
      cellStr(row, "MusteriKod", "MusteriKodu", "musteri_kodu")
    );
    if (!musteri_kodu) continue;

    const anahtar = belgeAnahtari(row);
    if (anahtar) {
      if (gorulenBelge.has(anahtar)) continue;
      gorulenBelge.add(anahtar);
    }

    islenenSatir += 1;
    const acc = byKod.get(musteri_kodu) ?? emptyAcc();
    byKod.set(musteri_kodu, acc);

    acc.net_ciro += money(row["Nettutar"]);
    acc.brut_ciro += money(row["BrutTutar"]);
    acc.iskonto_toplam += money(row["Iskonto"]);

    // Buradan sonrası yalnızca satış hareketleri için.
    if (iadeSatiriMi(row)) continue;

    acc.satir_sayisi += 1;

    const kayit = metinTemizle(cellStr(row, "Kayittip"));
    if (kayit === "Genel Promosyon Ürün") acc.promo_satir += 1;

    const iptal = metinTemizle(cellStr(row, "IptalNeden"));
    if (iptal) acc.iptal_satir += 1;

    const siparis = metinTemizle(cellStr(row, "SiparisNo"));
    if (siparis) acc.siparis.add(siparis);

    const fatura = metinTemizle(cellStr(row, "FaturaNo"));
    if (fatura) acc.fatura.add(fatura);

    const tarih = parseIslemTarihi(row["IslemTarihi"]);
    if (tarih) acc.dates.push(tarih);

    const vadeRaw = row["VadeGunu"];
    const vade =
      typeof vadeRaw === "number" && Number.isFinite(vadeRaw)
        ? Math.round(vadeRaw)
        : sayiyaCevir(vadeRaw);
    if (vade != null && Number.isFinite(vade)) {
      const v = Math.round(vade);
      acc.vade.set(v, (acc.vade.get(v) ?? 0) + 1);
    }

    const ug = metinTemizle(cellStr(row, "UrunGrup"));
    if (ug) acc.urunGrup.set(ug, (acc.urunGrup.get(ug) ?? 0) + 1);

    const urun = metinTemizle(cellStr(row, "Urun"));
    if (urun) acc.urun.set(urun, (acc.urun.get(urun) ?? 0) + 1);

    // Aynı günde birden fazla satır varsa son görüleni al (dosya sırası).
    if (
      tarih &&
      (ug || urun) &&
      (!acc.sonUrunTarih ||
        tarih > acc.sonUrunTarih ||
        tarih === acc.sonUrunTarih)
    ) {
      if (ug) acc.sonUrunGrup = ug;
      if (urun) acc.sonUrun = urun;
      acc.sonUrunTarih = tarih;
    }

    const stAdi = metinTemizle(cellStr(row, "SatisTemsilcisi"));
    if (stAdi) acc.stAdi.set(stAdi, (acc.stAdi.get(stAdi) ?? 0) + 1);

    const stKodu = metinTemizle(cellStr(row, "STKodu"));
    if (stKodu) acc.stKodu.set(stKodu, (acc.stKodu.get(stKodu) ?? 0) + 1);
  }

  const out: BelgeOzetUpdateRow[] = [];
  for (const [musteri_kodu, acc] of byKod) {
    acc.dates.sort();
    const donem_bas = acc.dates[0] ?? null;
    const donem_bit = acc.dates.length ? acc.dates[acc.dates.length - 1]! : null;
    out.push({
      musteri_kodu,
      donem_bas,
      donem_bit,
      satir_sayisi: acc.satir_sayisi,
      siparis_sayisi: acc.siparis.size,
      fatura_sayisi: acc.fatura.size,
      net_ciro: Math.round(acc.net_ciro * 100) / 100,
      brut_ciro: Math.round(acc.brut_ciro * 100) / 100,
      iskonto_toplam: Math.round(acc.iskonto_toplam * 100) / 100,
      promo_satir: acc.promo_satir,
      iptal_satir: acc.iptal_satir,
      son_islem_tarihi: donem_bit,
      vade_gunu: modeInt(acc.vade),
      top_urun_grup: modeKey(acc.urunGrup),
      son_urun_grup: acc.sonUrunGrup,
      top_urun: modeKey(acc.urun),
      son_urun: acc.sonUrun,
      st_adi: modeKey(acc.stAdi),
      st_kodu: modeKey(acc.stKodu),
    });
  }

  out.sort((a, b) => a.musteri_kodu.localeCompare(b.musteri_kodu, "tr"));
  return { rows: out, islenenSatir };
}
