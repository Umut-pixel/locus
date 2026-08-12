import * as XLSX from "xlsx";

import {
  acikBakiyeDegeri,
  fetchAllMusteriRaporu,
  gecikmeBandiEtiketi,
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

function rowsToSheet(
  rows: MusteriRaporSatiri[],
  riskMode: RiskMetricMode,
  filters: RaporlamaFilters
) {
  const labels = riskShortLabelsForMode(riskMode);
  // Bant filtresi aktifse kolon başlığı da neyin dışa aktarıldığını söylesin —
  // ekranda "70+ gün" görüp Excel'de toplam bakiye bulmak yanıltıcı olurdu.
  const bandEtiketi = gecikmeBandiEtiketi(filters);
  const bakiyeBaslik = bandEtiketi
    ? `Açık Bakiye · ${bandEtiketi} (TL)`
    : "Açık Bakiye (TL)";
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
    // null = veri yok → boş hücre. `?? 0` yazılırsa Excel'de "cirosu sıfır"
    // gibi okunuyor ve toplam/ortalama formülleri bunu gerçek 0 sayıyor.
    "Net Ciro (TL)": r.belge_net_ciro,
    "Sipariş Sayısı": r.belge_siparis_sayisi,
    "Fatura Sayısı": r.belge_fatura_sayisi,
    [bakiyeBaslik]: acikBakiyeDegeri(r, filters),
    "Riskli Bakiye (TL)": r.yas_riskli_tutar,
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
  const sheetRows = rowsToSheet(rows, riskMode, filters);

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
  riskMode: RiskMetricMode,
  filters: RaporlamaFilters
): void {
  const sheetRows = rowsToSheet(rows, riskMode, filters);

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Müşteri Raporu");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `locus-musteri-raporu-${stamp}.xlsx`);
}
