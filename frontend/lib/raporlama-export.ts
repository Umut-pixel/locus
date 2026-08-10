import * as XLSX from "xlsx";

import {
  fetchAllMusteriRaporu,
  type MusteriRaporSatiri,
  type RaporlamaFilters,
} from "@/hooks/useMusteriRaporlama";
import { formatDate } from "@/lib/format";
import { segmentDisplayLabel } from "@/lib/raporlama-style";
import {
  debtRiskDurumu,
  riskShortLabelsForMode,
  type RiskMetricMode,
} from "@/lib/risk-mode";

function rowsToSheet(rows: MusteriRaporSatiri[], riskMode: RiskMetricMode) {
  const labels = riskShortLabelsForMode(riskMode);
  return rows.map((r) => ({
    "Müşteri Kodu": r.musteri_kodu,
    Unvan: r.unvan,
    Şehir: r.sehir ?? "",
    İlçe: r.ilce ?? "",
    Segment: segmentDisplayLabel(r.musteri_grubu),
    Durum: r.durum ?? "",
    Temsilci: r.belge_st_adi ?? "",
    // Ekrandaki risk moduyla birebir aynı — borç ya da sevkiyat (bkz. lib/risk-mode.ts).
    "Risk Durumu": labels[riskMode === "borc" ? debtRiskDurumu(r) : r.risk_durumu],
    "Net Ciro (TL)": r.belge_net_ciro ?? 0,
    "Sipariş Sayısı": r.belge_siparis_sayisi ?? 0,
    "Fatura Sayısı": r.belge_fatura_sayisi ?? 0,
    "Açık Bakiye (TL)": r.yas_toplam ?? 0,
    "Riskli Bakiye (TL)": r.yas_riskli_tutar ?? 0,
    "Son Teslimat": formatDate(r.son_teslimat_tarihi),
    "Toplam Teslimat Sayısı": r.toplam_teslimat_sayisi,
  }));
}

/** Geçerli filtrelerle eşleşen tüm müşteri raporunu .xlsx olarak indirir (xlsx zaten bağımlılıkta — bkz. lib/import). */
export async function exportMusteriRaporu(
  filters: RaporlamaFilters,
  riskMode: RiskMetricMode
): Promise<number> {
  const rows = await fetchAllMusteriRaporu(filters, riskMode);
  const sheetRows = rowsToSheet(rows, riskMode);

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Müşteri Raporu");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `locus-musteri-raporu-${stamp}.xlsx`);

  return rows.length;
}

/** Seçili satırları — yeni fetch olmadan — anında .xlsx olarak indirir. */
export function exportSelectedRows(
  rows: MusteriRaporSatiri[],
  riskMode: RiskMetricMode
): void {
  const sheetRows = rowsToSheet(rows, riskMode);

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Müşteri Raporu");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `locus-musteri-raporu-${stamp}.xlsx`);
}
