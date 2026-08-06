/** Petshop / veteriner kanal sınıflandırması — filtre ve GeoJSON. */

export type TipKanal = "petshop" | "veteriner" | "diger";

/** Harita toggle’ında seçilebilir kanallar (diğer hariç). */
export type TipKanalSecilebilir = "petshop" | "veteriner";

export type TipKanalFilter = Record<TipKanalSecilebilir, boolean>;

export const TIP_LABELS: Record<TipKanal, string> = {
  petshop: "Petshop",
  veteriner: "Veteriner",
  diger: "Diğer",
};

/** Legend / filtrede gösterilen ana kanallar (diğer hariç). */
export const TIP_ORDER: TipKanalSecilebilir[] = ["petshop", "veteriner"];

export const DEFAULT_TIP_FILTER: TipKanalFilter = {
  petshop: true,
  veteriner: true,
};

export function tipKanalFromMusteriGrubu(
  g: string | null | undefined
): TipKanal {
  if (!g) return "diger";
  const u = g.toLocaleUpperCase("tr-TR");
  if (u.includes("PETSHOP") || u.includes("PET SHOP")) return "petshop";
  if (u.includes("VETER")) return "veteriner";
  return "diger";
}

export function tipKanalFromPrimaryType(
  t: string | null | undefined
): TipKanal {
  if (t === "pet_store" || t === "pet_care") return "petshop";
  if (t === "veterinary_care") return "veteriner";
  return "diger";
}

/** Places tipi veya isim — petshop/veteriner sinyali var mı (gürültü filtresi). */
export function isPetOrVetSignal(
  primaryType: string | null | undefined,
  googleTypes: string[] | null | undefined,
  isim: string | null | undefined
): boolean {
  const tipOk =
    primaryType === "pet_store" ||
    primaryType === "veterinary_care" ||
    primaryType === "pet_care" ||
    (Array.isArray(googleTypes) &&
      googleTypes.some(
        (t) =>
          t === "pet_store" ||
          t === "veterinary_care" ||
          t === "pet_care"
      ));
  if (tipOk) return true;
  const u = (isim ?? "").toLocaleUpperCase("tr-TR");
  if (!u) return false;
  if (
    u.includes("PETSHOP") ||
    u.includes("PET SHOP") ||
    u.includes("PET STORE") ||
    u.includes("PET MARKET") ||
    u.includes("PET FOOD") ||
    u.includes("VETER") ||
    u.includes("AKVARYUM") ||
    u.includes("HAYVAN") ||
    u.includes("PATİ") ||
    u.includes("PATI")
  ) {
    return true;
  }
  if (u.includes(" PET") || u.startsWith("PET ")) return true;
  return false;
}

export function isTipFilterActive(filter: TipKanalFilter): boolean {
  return !filter.petshop || !filter.veteriner;
}

export function tipPassesFilter(
  tip: TipKanal,
  filter: TipKanalFilter,
  includeDiger: boolean
): boolean {
  if (tip === "diger") return includeDiger;
  return filter[tip];
}

/** İkisi de açıkken haritada petshop/veteriner renk halkası. */
export function tipRingVisible(filter: TipKanalFilter): boolean {
  return filter.petshop && filter.veteriner;
}

export const TIP_STROKE_COLORS: Record<TipKanal, string> = {
  petshop: "#22d3ee",
  veteriner: "#e879f9",
  diger: "rgba(255,255,255,0.85)",
};

/** Mapbox paint — tip_kanal property’sine göre stroke. */
export function tipStrokeColorExpr(
  fallback: string = TIP_STROKE_COLORS.diger
): import("mapbox-gl").ExpressionSpecification {
  return [
    "match",
    ["get", "tip_kanal"],
    "petshop",
    TIP_STROKE_COLORS.petshop,
    "veteriner",
    TIP_STROKE_COLORS.veteriner,
    fallback,
  ];
}
