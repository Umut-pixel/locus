import type { RiskDurumu } from "./types";

/** View / form ile paylaşılan eşikler (sql/sema.sql risk case). */
export const IZLE_GUN = 45;
export const AKSIYON_GUN = 90;

/** Form durumu — aksiyon dili; “kötüleşme” yok. */
export type FormDurumu = "ritimde" | "yaklasiyor" | "esik_asildi" | "sessiz";

/** Yükleme arası olay — yalnızca anlamlı eşik/kazanım geçişleri. */
export type FormOlay =
  | "kazanim"
  | "uyari"
  | "aksiyon"
  | "ritim"
  | "sessiz";

export const FORM_ORDER: FormDurumu[] = [
  "ritimde",
  "yaklasiyor",
  "esik_asildi",
  "sessiz",
];

export const FORM_LABELS: Record<FormDurumu, string> = {
  ritimde: "Ritimde",
  yaklasiyor: "Yaklaşıyor",
  esik_asildi: "Eşik aşıldı",
  sessiz: "Sessiz",
};

export const FORM_HINTS: Record<FormDurumu, string> = {
  ritimde: "Karar gerekmez",
  yaklasiyor: "İzle / ziyaret planla",
  esik_asildi: "Aksiyon gerekli",
  sessiz: "İlk temas",
};

export const OLAY_LABELS: Record<FormOlay, string> = {
  kazanim: "Kazanım",
  uyari: "Uyarı",
  aksiyon: "Aksiyon",
  ritim: "Ritim",
  sessiz: "Sessiz",
};

/** Risk sıralaması — düşük = daha iyi (kazanım / band karşılaştırması). */
export const RISK_RANK: Record<RiskDurumu, number> = {
  saglikli: 0,
  izlenmeli: 1,
  riskli: 2,
  hic_teslimat_yok: 3,
};

export const FORM_RANK: Record<FormDurumu, number> = {
  ritimde: 0,
  yaklasiyor: 1,
  esik_asildi: 2,
  sessiz: 3,
};

/** Kazanım XP paketleri — negatif XP yok. */
export const XP_BAND_IYILESME = 30;
export const XP_YENI_TESLIMAT = 20;

export interface SnapshotMetrics {
  risk_durumu: RiskDurumu;
  toplam_teslimat_sayisi: number;
  toplam_tutar: number;
  toplam_agirlik: number;
  son_teslimattan_gecen_gun: number | null;
  son_teslimat_tarihi: string | null;
}

export interface MusteriSnapshotRow extends SnapshotMetrics {
  id?: string;
  yukleme_id?: string | null;
  musteri_kodu: string;
  onceki_risk_durumu: RiskDurumu | null;
  onceki_toplam_teslimat_sayisi: number | null;
  onceki_toplam_tutar: number | null;
  onceki_toplam_agirlik: number | null;
  onceki_son_teslimattan_gecen_gun: number | null;
  onceki_son_teslimat_tarihi: string | null;
  olusturuldu?: string;
}

/** Portföy özeti — yukleme_loglari.karsilastirma jsonb. */
export interface YuklemeKarsilastirma {
  kazanim: number;
  uyari: number;
  aksiyon: number;
  ritim: number;
  sessiz: number;
  form_dagilim: Record<FormDurumu, number>;
  /** Geriye dönük harita risk sayaçları (AI / debug). */
  risk_onceki: Record<RiskDurumu, number>;
  risk_yeni: Record<RiskDurumu, number>;
}

export interface MusteriFormSonuc {
  form: FormDurumu;
  olay: FormOlay;
  baski: number;
  xp: number;
  /** Son yüklemede ritimde kaldıysa 1, değilse 0 (basit streak). */
  streak: number;
  mesaj: string;
}

export function computeRiskDurumu(
  toplamTeslimat: number,
  sonTeslimattanGecenGun: number | null
): RiskDurumu {
  if (toplamTeslimat === 0) return "hic_teslimat_yok";
  if (sonTeslimattanGecenGun != null && sonTeslimattanGecenGun > AKSIYON_GUN) {
    return "riskli";
  }
  if (sonTeslimattanGecenGun != null && sonTeslimattanGecenGun > IZLE_GUN) {
    return "izlenmeli";
  }
  return "saglikli";
}

export function formDurumu(metrics: SnapshotMetrics): FormDurumu {
  if (metrics.toplam_teslimat_sayisi === 0) return "sessiz";
  const gun = metrics.son_teslimattan_gecen_gun;
  if (gun == null) return "sessiz";
  if (gun > AKSIYON_GUN) return "esik_asildi";
  if (gun > IZLE_GUN) return "yaklasiyor";
  return "ritimde";
}

/** Cezasız yaklaşma: gun / 90, 0–1. */
export function baskiOrani(gun: number | null): number {
  if (gun == null || gun < 0) return 0;
  return Math.min(1, Math.max(0, gun / AKSIYON_GUN));
}

export function emptyFormCounts(): Record<FormDurumu, number> {
  return {
    ritimde: 0,
    yaklasiyor: 0,
    esik_asildi: 0,
    sessiz: 0,
  };
}

export function emptyRiskCounts(): Record<RiskDurumu, number> {
  return {
    saglikli: 0,
    izlenmeli: 0,
    riskli: 0,
    hic_teslimat_yok: 0,
  };
}

/**
 * Önceki ↔ yeni olay.
 * Aynı form bandında gün artışı → ritim (kötüleşme yok).
 * Ciro tek başına olay üretmez.
 */
export function classifyOlay(
  onceki: SnapshotMetrics | null,
  yeni: SnapshotMetrics
): FormOlay {
  if (!onceki) return "sessiz";

  const onceForm = formDurumu(onceki);
  const yeniForm = formDurumu(yeni);

  // Kazanım: form iyileşti veya aynı bandda gün belirgin düştü (yeni teslimat)
  if (FORM_RANK[yeniForm] < FORM_RANK[onceForm]) {
    return "kazanim";
  }

  const oldGun = onceki.son_teslimattan_gecen_gun;
  const newGun = yeni.son_teslimattan_gecen_gun;
  if (
    onceForm === yeniForm &&
    oldGun != null &&
    newGun != null &&
    newGun < oldGun
  ) {
    return "kazanim";
  }

  // Band / risk iyileşmesi (form aynı kalsa bile — örn. sayısal edge)
  if (RISK_RANK[yeni.risk_durumu] < RISK_RANK[onceki.risk_durumu]) {
    return "kazanim";
  }

  // Uyarı: ritimde → yaklaşıyor (45 aşıldı)
  if (onceForm === "ritimde" && yeniForm === "yaklasiyor") {
    return "uyari";
  }

  // Aksiyon: eşik aşıldı veya sessize girildi / sessizde kaldı
  if (yeniForm === "esik_asildi" && onceForm !== "esik_asildi") {
    return "aksiyon";
  }
  if (yeniForm === "sessiz") {
    return "aksiyon";
  }
  // Zaten eşik aşılmışsa ve hâlâ oradaysa — tekrar “kötüleşme” değil, aksiyon rozeti
  if (yeniForm === "esik_asildi" && onceForm === "esik_asildi") {
    // Gün düştüyse yukarıda kazanım; aksi halde ritim (beklemede)
    return "ritim";
  }

  // yaklaşıyor → eşik_asildi covered above; yaklaşıyor içinde kalma → ritim
  return "ritim";
}

export function kazanimXp(
  onceki: SnapshotMetrics | null,
  yeni: SnapshotMetrics,
  olay: FormOlay
): number {
  if (olay !== "kazanim" || !onceki) return 0;
  let xp = 0;
  if (FORM_RANK[formDurumu(yeni)] < FORM_RANK[formDurumu(onceki)]) {
    xp += XP_BAND_IYILESME;
  }
  const oldGun = onceki.son_teslimattan_gecen_gun;
  const newGun = yeni.son_teslimattan_gecen_gun;
  if (oldGun != null && newGun != null && newGun < oldGun) {
    xp += XP_YENI_TESLIMAT;
  }
  // Band iyileşti ama gün bilgisi yoksa en az band XP
  if (xp === 0) xp = XP_BAND_IYILESME;
  return xp;
}

export function olayMesaji(
  olay: FormOlay,
  form: FormDurumu
): string {
  switch (olay) {
    case "kazanim":
      return "Kazanım — teslimat yenilendi";
    case "uyari":
      return `Uyarı — ${IZLE_GUN} gün aşıldı`;
    case "aksiyon":
      if (form === "sessiz") return "Aksiyon — teslimat kaydı yok";
      return `Aksiyon — ${AKSIYON_GUN} gün aşıldı`;
    case "sessiz":
      return "Sessiz — karşılaştırma için önceki yükleme yok";
    case "ritim":
    default:
      return `${FORM_LABELS[form]} — ${FORM_HINTS[form]}`;
  }
}

/** Tek müşteri form sonucu (panel). */
export function evaluateMusteriForm(
  onceki: SnapshotMetrics | null,
  yeni: SnapshotMetrics
): MusteriFormSonuc {
  const form = formDurumu(yeni);
  const olay = classifyOlay(onceki, yeni);
  const baski = baskiOrani(yeni.son_teslimattan_gecen_gun);
  const xp = kazanimXp(onceki, yeni, olay);
  const streak = form === "ritimde" ? 1 : 0;
  return {
    form,
    olay,
    baski,
    xp,
    streak,
    mesaj: olayMesaji(olay, form),
  };
}

/** Eşiğe kalan gün (bilgisel); aşıldıysa null. */
export function esigeKalanGun(gun: number | null): {
  hedef: typeof IZLE_GUN | typeof AKSIYON_GUN;
  kalan: number;
} | null {
  if (gun == null) return null;
  if (gun <= IZLE_GUN) {
    return { hedef: IZLE_GUN, kalan: IZLE_GUN - gun };
  }
  if (gun <= AKSIYON_GUN) {
    return { hedef: AKSIYON_GUN, kalan: AKSIYON_GUN - gun };
  }
  return null;
}

export function buildPortfolioForm(
  pairs: Array<{ onceki: SnapshotMetrics | null; yeni: SnapshotMetrics }>
): YuklemeKarsilastirma {
  const form_dagilim = emptyFormCounts();
  const risk_onceki = emptyRiskCounts();
  const risk_yeni = emptyRiskCounts();
  let kazanim = 0;
  let uyari = 0;
  let aksiyon = 0;
  let ritim = 0;
  let sessiz = 0;

  for (const { onceki, yeni: cur } of pairs) {
    form_dagilim[formDurumu(cur)] += 1;
    risk_yeni[cur.risk_durumu] += 1;
    if (onceki) risk_onceki[onceki.risk_durumu] += 1;

    const olay = classifyOlay(onceki, cur);
    if (olay === "kazanim") kazanim += 1;
    else if (olay === "uyari") uyari += 1;
    else if (olay === "aksiyon") aksiyon += 1;
    else if (olay === "sessiz") sessiz += 1;
    else ritim += 1;
  }

  return {
    kazanim,
    uyari,
    aksiyon,
    ritim,
    sessiz,
    form_dagilim,
    risk_onceki,
    risk_yeni,
  };
}

export function pctChange(onceki: number | null, yeni: number): number | null {
  if (onceki == null || onceki === 0) {
    if (yeni === 0) return 0;
    return onceki == null ? null : 100;
  }
  return ((yeni - onceki) / Math.abs(onceki)) * 100;
}
