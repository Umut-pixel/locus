/**
 * Panorama çekim zincirleri — tek tek seçilebilen birimler.
 *
 * Seçilebilir birim RAPOR DEĞİL, ZİNCİR. n8n iş akışında her zincirin kendi
 * Config düğümü var ve rapor id'leri o düğümde sabit; "Müşteri listesi"
 * zinciri üç raporu (5020/5500/5130) tek Loop içinde çekiyor, bölünemiyor.
 *
 * Sıra n8n'deki kaskad sırasıdır (backend/n8n/README.md). Birden fazla zincir
 * seçildiğinde son tamamlanan, bu listede en sonda olandır — ilerleme takibi
 * onu bekler.
 */

export interface PanoramaZinciri {
  /** Sohbette ve arayüzde kullanılan kısa anahtar. */
  anahtar: string;
  /** n8n'e gönderilen id — IF düğümleri bununla eşleşir. */
  reportId: number;
  /**
   * `panorama_sync_runs` içinde tamamlanmayı beklediğimiz id. Çoğu zincirde
   * `reportId` ile aynı; müşteri zincirinde son çekilen rapor (5130).
   */
  bekleId: number;
  /** Kullanıcıya görünen ad — iş dili, rapor kodu değil. */
  ad: string;
  aciklama: string;
  /** Ölçülen tipik süre (sn) — beklenen bitiş damgası için. */
  tahminiSn: number;
}

export const PANORAMA_ZINCIRLERI: readonly PanoramaZinciri[] = [
  {
    anahtar: "musteri",
    reportId: 5020,
    bekleId: 5130,
    ad: "Müşteri, rut ve sevkiyat",
    aciklama: "Müşteri kartları, rut tanımları ve sevkiyat özeti — üçü birlikte gelir.",
    tahminiSn: 120,
  },
  {
    anahtar: "yaslandirma",
    reportId: 5530,
    bekleId: 5530,
    ad: "Açık fatura yaşlandırma",
    aciklama: "Vadesi geçmiş alacakların gün bantlarına dağılımı.",
    tahminiSn: 35,
  },
  {
    anahtar: "belge-detay",
    reportId: 5450,
    bekleId: 5450,
    ad: "Fatura belge detayı",
    aciklama: "Fatura satırları. En ağır çekim — tek başına ~2 dakika.",
    tahminiSn: 120,
  },
  {
    anahtar: "siparis-durum",
    reportId: 5140,
    bekleId: 5140,
    ad: "Sipariş durumu",
    aciklama: "Açık ve kapanmış siparişlerin durumu.",
    tahminiSn: 35,
  },
  {
    anahtar: "stok",
    reportId: 5430,
    bekleId: 5430,
    ad: "Detaylı stok",
    aciklama: "Depo stok miktarları ve parti bilgisi.",
    tahminiSn: 35,
  },
  {
    anahtar: "tahsilat",
    reportId: 5230,
    bekleId: 5230,
    ad: "Tahsilat",
    aciklama: "Yapılan tahsilatlar ve ödeme tipleri.",
    tahminiSn: 35,
  },
  {
    anahtar: "siparis-detay",
    reportId: 5451,
    bekleId: 5451,
    ad: "Sipariş belge detayı",
    aciklama: "Bekleyen sipariş satırları — rota planlaması bunu kullanır.",
    tahminiSn: 60,
  },
] as const;

/**
 * Zincirler arası n8n bekleme süresi — 2026-09-04'te KALDIRILDI.
 *
 * WAF, aynı egress IP'den arka arkaya login'leri bot trafiği sanıyordu; Wait
 * düğümleri bunu yavaşlatarak önlüyordu. "Hepsi" seçiliyken artık 7 login de
 * aralıksız ateşleniyor — WAF tekrar tetiklenirse ilk geri alınacak değer
 * budur (backend/n8n/README.md'deki nottan bak).
 */
export const ZINCIR_ARASI_BEKLEME_SN = 0;

export function zincirBul(anahtarVeyaId: string | number): PanoramaZinciri | null {
  if (typeof anahtarVeyaId === "number") {
    return (
      PANORAMA_ZINCIRLERI.find((z) => z.reportId === anahtarVeyaId) ?? null
    );
  }
  const t = anahtarVeyaId.trim().toLowerCase();
  if (!t) return null;
  const sayi = Number(t);
  if (Number.isFinite(sayi)) {
    return PANORAMA_ZINCIRLERI.find((z) => z.reportId === sayi) ?? null;
  }
  return PANORAMA_ZINCIRLERI.find((z) => z.anahtar === t) ?? null;
}

/**
 * Serbest girdiyi (anahtar ya da rapor id) zincir listesine çevirir.
 * Boş girdi = hepsi. Tanınmayan değer hata olarak döner — sessizce
 * "hepsi"ne düşerse kullanıcı tek rapor istediğini sanıp 7 zincir tetikler.
 */
export function zincirleriCoz(
  girdi: readonly (string | number)[] | null | undefined
): { zincirler: PanoramaZinciri[]; bilinmeyen: string[] } {
  if (girdi == null || girdi.length === 0) {
    return { zincirler: [...PANORAMA_ZINCIRLERI], bilinmeyen: [] };
  }
  const secilen = new Set<string>();
  const bilinmeyen: string[] = [];
  for (const ham of girdi) {
    const z = zincirBul(ham);
    if (z) secilen.add(z.anahtar);
    else bilinmeyen.push(String(ham));
  }
  // Kaskad sırası korunur — seçim sırası değil.
  return {
    zincirler: PANORAMA_ZINCIRLERI.filter((z) => secilen.has(z.anahtar)),
    bilinmeyen,
  };
}

/**
 * Seçilen zincirlerin tahmini toplam süresi (ms).
 * Zincir sayısı kadar çekim + aralarındaki beklemeler.
 */
export function tahminiSureMs(zincirler: readonly PanoramaZinciri[]): number {
  if (zincirler.length === 0) return 0;
  const cekim = zincirler.reduce((t, z) => t + z.tahminiSn, 0);
  const bekleme = (zincirler.length - 1) * ZINCIR_ARASI_BEKLEME_SN;
  return (cekim + bekleme) * 1000;
}

/** Çekim sonrası içerik özeti — /api/sync/panorama/ozet döndürür. */
export interface RaporMetrigi {
  etiket: string;
  deger: number;
  tip: "adet" | "para";
}

export interface RaporOzeti {
  anahtar: string;
  ad: string;
  reportId: number;
  durum: string | null;
  satirSayisi: number | null;
  /** Bir önceki tamamlanmış çekimin satır sayısı — fark göstermek için. */
  oncekiSatir: number | null;
  tamamlandiAt: string | null;
  hata: string | null;
  metrikler: RaporMetrigi[];
}
