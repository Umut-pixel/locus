import { sehirNormalize } from "./utils";

export const SEHIR_CEKIRDEK = new Set([
  "İZMİR",
  "MANİSA",
  "AYDIN",
  "MUĞLA",
  "DENİZLİ",
]);

export const SEHIR_SINIR_DAHIL = new Set([
  "BALIKESİR",
  "ÇANAKKALE",
  "UŞAK",
]);

export const SEHIR_HEDEF = new Set([...SEHIR_CEKIRDEK, ...SEHIR_SINIR_DAHIL]);

export type BolgeGrubu = "cekirdek" | "sinir_dahil" | "bolge_disi";

export function bolgeGrubu(sehir: string): BolgeGrubu {
  const n = sehirNormalize(sehir);
  if (SEHIR_CEKIRDEK.has(n)) return "cekirdek";
  if (SEHIR_SINIR_DAHIL.has(n)) return "sinir_dahil";
  return "bolge_disi";
}

export function hedefBolgeMi(sehir: string): boolean {
  return SEHIR_HEDEF.has(sehirNormalize(sehir));
}
