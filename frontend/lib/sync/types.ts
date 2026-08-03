export type PanoramaReportId = 5020 | 5500 | 5130;

export interface SyncRunSummary {
  id: string;
  report_id: number;
  durum: string;
  satir_sayisi: number | null;
  cekildi_at: string | null;
  tamamlandi_at: string | null;
  hata: string | null;
}

export interface PanoramaSyncIds {
  "5020": string;
  "5500": string;
  "5130": string;
}

export interface PanoramaTransformResult {
  skipped: boolean;
  reason?: string;
  syncIds: PanoramaSyncIds | null;
  musteri: {
    islenenSatir: number;
    yazilan: number;
    yeni: number;
    guncellenen: number;
    bolgeDisi: number;
    geocodeBasarisiz: number;
    geocodeAtlanan: number;
    dedupUyari: boolean;
  };
  rut: {
    islenenSatir: number;
    guncellenen: number;
    eslesmeyen: number;
  };
  sevkiyat: {
    islenenSatir: number;
    guncellenen: number;
    eslesmeyen: number;
    tarihBozuk: number;
  };
  yuklemeId?: string;
  yuklenmeZamani?: string;
  uyarilar: string[];
}
