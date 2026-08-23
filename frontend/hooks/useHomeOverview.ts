"use client";

import { useCallback, useEffect, useState } from "react";

import { parseBelgeTarihi } from "@/lib/import/parse-sevkiyat";
import { sayiyaCevir } from "@/lib/import/utils";
import {
  MUSTERILER_RAPOR_VIEW,
  PANORAMA_SEVKIYAT_VIEW,
  supabase,
} from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-fetch-all";
import type { RiskDurumu } from "@/lib/types";
import { RISK_ORDER, RISK_SHORT_LABELS } from "@/lib/risk-style";
import { BORC_RISK_SHORT_LABELS, debtRiskDurumu } from "@/lib/risk-mode";

const ROW_SELECT =
  "musteri_kodu,durum,risk_durumu,sehir,ilce,belge_net_ciro,yas_toplam,yas_riskli_tutar," +
  "hf_01_06,hf_07_13,hf_14_20,hf_21_27,hf_28_34,hf_35_41,hf_42_48," +
  "hf_49_55,hf_56_62,hf_63_69,hf_70_ustu";

const YAS_BANTLARI = [
  { kolon: "hf_01_06", label: "1–6", riskli: false },
  { kolon: "hf_07_13", label: "7–13", riskli: false },
  { kolon: "hf_14_20", label: "14–20", riskli: false },
  { kolon: "hf_21_27", label: "21–27", riskli: false },
  { kolon: "hf_28_34", label: "28–34", riskli: false },
  { kolon: "hf_35_41", label: "35–41", riskli: false },
  { kolon: "hf_42_48", label: "42–48", riskli: false },
  { kolon: "hf_49_55", label: "49–55", riskli: false },
  { kolon: "hf_56_62", label: "56–62", riskli: true },
  { kolon: "hf_63_69", label: "63–69", riskli: true },
  { kolon: "hf_70_ustu", label: "70+", riskli: true },
] as const;

const SON_SEVK_Goster = 6;

type OverviewRow = {
  musteri_kodu: string;
  durum: string | null;
  risk_durumu: RiskDurumu;
  sehir: string | null;
  ilce: string | null;
  belge_net_ciro: number | null;
  yas_toplam: number | null;
  yas_riskli_tutar: number | null;
  hf_01_06: number | null;
  hf_07_13: number | null;
  hf_14_20: number | null;
  hf_21_27: number | null;
  hf_28_34: number | null;
  hf_35_41: number | null;
  hf_42_48: number | null;
  hf_49_55: number | null;
  hf_56_62: number | null;
  hf_63_69: number | null;
  hf_70_ustu: number | null;
};

type SevkRaw = {
  musteri_kodu: string | null;
  musteri_unvani: string | null;
  belge_kod: string | null;
  belge_tarihi: string | null;
  net_fiyat: string | null;
  agirlik: string | null;
};

export type DurumAdi = "Aktif" | "Pasif" | "İptal" | "Diğer";

export type HomeDurumSlice = {
  ad: DurumAdi;
  sayi: number;
  prompt: string;
};

export type HomeRiskSlice = {
  key: RiskDurumu;
  ad: string;
  sayi: number;
  prompt: string;
};

export type HomeIlceSlice = {
  etiket: string;
  ilce: string;
  sehir: string | null;
  sayi: number;
  ciro: number;
  borc: number;
  prompt: string;
};

export type HomeSevkSatiri = {
  belgeKod: string;
  musteriKodu: string | null;
  musteriUnvani: string | null;
  tarih: string;
  tutar: number;
  agirlikKg: number;
  prompt: string;
};

export type HomeBorcBant = {
  kolon: string;
  label: string;
  tutar: number;
  riskli: boolean;
  prompt: string;
};

export type HomeOverview = {
  toplam: number;
  netCiro: number;
  durum: HomeDurumSlice[];
  risk: HomeRiskSlice[];
  borcRisk: HomeRiskSlice[];
  borcBantlar: HomeBorcBant[];
  ilceler: HomeIlceSlice[];
  sonSevk: HomeSevkSatiri[];
};

const DURUM_ORDER: DurumAdi[] = ["Aktif", "Pasif", "İptal", "Diğer"];

const DURUM_PROMPT: Record<DurumAdi, string> = {
  Aktif: "Aktif müşteri sayısı nedir?",
  Pasif: "Pasif müşteri sayısı nedir?",
  İptal: "İptal müşteri sayısı nedir?",
  Diğer: "Durumu belirsiz müşteri sayısı nedir?",
};

const RISK_PROMPT: Record<RiskDurumu, string> = {
  saglikli: "Sağlıklı teslimat durumundaki müşteri sayısı nedir?",
  izlenmeli: "İzlenmeli müşteri sayısı nedir?",
  riskli: "Riskli müşteri sayısı nedir?",
  hic_teslimat_yok: "Hiç teslimatı olmayan müşteri sayısı nedir?",
};

const BORC_PROMPT: Record<RiskDurumu, string> = {
  saglikli: "Borcu temiz müşteri sayısı nedir?",
  izlenmeli: "Açık bakiyesi olan ama 56 gün altı müşteri sayısı nedir?",
  riskli: "56 gün ve üzeri riskli borcu olan müşteri sayısı nedir?",
  hic_teslimat_yok: "Yaşlandırma verisi olmayan müşteri sayısı nedir?",
};

function normalizeDurum(raw: string | null): DurumAdi {
  if (!raw) return "Diğer";
  const k = raw
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S");
  if (k === "AKTIF") return "Aktif";
  if (k === "PASIF") return "Pasif";
  if (k === "IPTAL") return "İptal";
  return "Diğer";
}

function emptyOverview(): HomeOverview {
  return {
    toplam: 0,
    netCiro: 0,
    durum: [],
    risk: RISK_ORDER.map((key) => ({
      key,
      ad: RISK_SHORT_LABELS[key],
      sayi: 0,
      prompt: RISK_PROMPT[key],
    })),
    borcRisk: RISK_ORDER.map((key) => ({
      key,
      ad: BORC_RISK_SHORT_LABELS[key],
      sayi: 0,
      prompt: BORC_PROMPT[key],
    })),
    borcBantlar: [],
    ilceler: [],
    sonSevk: [],
  };
}

function titleIlce(raw: string): string {
  return raw
    .toLocaleLowerCase("tr-TR")
    .replace(/(^|[\s/·-])(\S)/g, (m, sep: string, ch: string) => {
      return `${sep}${ch.toLocaleUpperCase("tr-TR")}`;
    });
}

function hfTutar(row: OverviewRow, kolon: (typeof YAS_BANTLARI)[number]["kolon"]) {
  return Number(row[kolon] ?? 0);
}

function aggregate(rows: OverviewRow[], sevkRows: SevkRaw[]): HomeOverview {
  const durumSayim: Record<DurumAdi, number> = {
    Aktif: 0,
    Pasif: 0,
    İptal: 0,
    Diğer: 0,
  };
  const riskSayim: Record<RiskDurumu, number> = {
    saglikli: 0,
    izlenmeli: 0,
    riskli: 0,
    hic_teslimat_yok: 0,
  };
  const borcSayim: Record<RiskDurumu, number> = {
    saglikli: 0,
    izlenmeli: 0,
    riskli: 0,
    hic_teslimat_yok: 0,
  };
  const bantToplam: Record<string, number> = {};
  for (const b of YAS_BANTLARI) bantToplam[b.kolon] = 0;

  const ilceSayim = new Map<
    string,
    {
      ilce: string;
      sehir: string | null;
      sayi: number;
      ciro: number;
      borc: number;
    }
  >();
  let netCiro = 0;

  for (const row of rows) {
    durumSayim[normalizeDurum(row.durum)] += 1;
    if (row.risk_durumu in riskSayim) {
      riskSayim[row.risk_durumu] += 1;
    } else {
      riskSayim.hic_teslimat_yok += 1;
    }
    borcSayim[debtRiskDurumu(row)] += 1;
    netCiro += Number(row.belge_net_ciro ?? 0);
    for (const b of YAS_BANTLARI) {
      bantToplam[b.kolon] += hfTutar(row, b.kolon);
    }

    const ilce = row.ilce?.trim();
    if (!ilce) continue;
    const sehir = row.sehir?.trim() || null;
    const key = sehir ? `${sehir}|||${ilce}` : ilce;
    const prev = ilceSayim.get(key);
    const ciro = Number(row.belge_net_ciro ?? 0);
    const borc = Number(row.yas_toplam ?? 0);
    if (prev) {
      prev.sayi += 1;
      prev.ciro += ciro;
      prev.borc += borc;
    } else {
      ilceSayim.set(key, { ilce, sehir, sayi: 1, ciro, borc });
    }
  }

  const durum = DURUM_ORDER.filter((ad) => durumSayim[ad] > 0).map((ad) => ({
    ad,
    sayi: durumSayim[ad],
    prompt: DURUM_PROMPT[ad],
  }));

  const ilceler = Array.from(ilceSayim.values())
    .sort((a, b) => b.ciro - a.ciro)
    .slice(0, 5)
    .map((item) => ({
      etiket: titleIlce(item.ilce),
      ilce: item.ilce,
      sehir: item.sehir,
      sayi: item.sayi,
      ciro: item.ciro,
      borc: item.borc,
      prompt: `${item.ilce} teslimat ve borç durumu nedir?`,
    }));

  const borcBantlar: HomeBorcBant[] = YAS_BANTLARI.map((b) => ({
    kolon: b.kolon,
    label: b.label,
    tutar: Math.round((bantToplam[b.kolon] ?? 0) * 100) / 100,
    riskli: b.riskli,
    prompt: `${b.label} gün gecikme bandındaki açık bakiye nedir?`,
  }));

  const seen = new Set<string>();
  const sevkiyatlar: HomeSevkSatiri[] = [];
  for (const r of sevkRows) {
    const belgeKod = r.belge_kod?.trim();
    if (!belgeKod || seen.has(belgeKod)) continue;
    const tarih = parseBelgeTarihi(r.belge_tarihi);
    if (!tarih) continue;
    seen.add(belgeKod);
    const tarihStr = tarih.toISOString().slice(0, 10);
    const unvan = r.musteri_unvani?.trim() || null;
    const kod = r.musteri_kodu?.trim() || null;
    const kim = unvan ?? kod ?? "bu müşteri";
    sevkiyatlar.push({
      belgeKod,
      musteriKodu: kod,
      musteriUnvani: unvan,
      tarih: tarihStr,
      tutar: Math.round((sayiyaCevir(r.net_fiyat) ?? 0) * 100) / 100,
      agirlikKg: Math.round(((sayiyaCevir(r.agirlik) ?? 0) / 1000) * 100) / 100,
      prompt: `${kim} son sevkiyatları nedir?`,
    });
  }
  sevkiyatlar.sort(
    (a, b) =>
      b.tarih.localeCompare(a.tarih) || b.belgeKod.localeCompare(a.belgeKod, "tr")
  );

  return {
    toplam: rows.length,
    netCiro,
    durum,
    risk: RISK_ORDER.map((key) => ({
      key,
      ad: RISK_SHORT_LABELS[key],
      sayi: riskSayim[key],
      prompt: RISK_PROMPT[key],
    })),
    borcRisk: RISK_ORDER.map((key) => ({
      key,
      ad: BORC_RISK_SHORT_LABELS[key],
      sayi: borcSayim[key],
      prompt: BORC_PROMPT[key],
    })),
    borcBantlar,
    ilceler,
    sonSevk: sevkiyatlar.slice(0, SON_SEVK_Goster),
  };
}

export function useHomeOverview(enabled = true) {
  const [data, setData] = useState<HomeOverview | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    void Promise.all([
      fetchAllRows<OverviewRow>((from, to) =>
        supabase
          .from(MUSTERILER_RAPOR_VIEW)
          .select(ROW_SELECT)
          .order("musteri_kodu", { ascending: true })
          .range(from, to) as unknown as Promise<{
          data: OverviewRow[] | null;
          error: { message: string } | null;
        }>
      ),
      fetchAllRows<SevkRaw>(
        (from, to) =>
          supabase
            .from(PANORAMA_SEVKIYAT_VIEW)
            .select(
              "musteri_kodu,musteri_unvani,belge_kod,belge_tarihi,net_fiyat,agirlik"
            )
            .range(from, to) as unknown as Promise<{
            data: SevkRaw[] | null;
            error: { message: string } | null;
          }>,
        { maxBatches: 2 }
      ).catch(() => [] as SevkRaw[]),
    ])
      .then(([rows, sevkRows]) => {
        if (cancelled) return;
        setData(aggregate(rows, sevkRows));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Özet yüklenemedi.";
        setError(message);
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  return { data: data ?? emptyOverview(), loading, error, refresh };
}
