"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getReportCache,
  isReportCacheFresh,
  setReportCache,
} from "@/lib/report-cache";
import {
  SEVKIYAT_PLAN_DURAKLARI_VIEW,
  SEVKIYAT_PLAN_OZET_VIEW,
  supabase,
} from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-fetch-all";
import type { RiskDurumu } from "@/lib/types";

const CACHE_KEY = "rota-kayitli-planlar";

/** Son kaç günün kaydı çekilsin — geçmiş büyüdükçe sayfa şişmesin. */
const GUN_SINIRI = 90;

interface PlanRaw {
  id: string;
  plan_tarihi: string;
  arac_kod: string;
  arac_ad: string | null;
  sofor_kod: string | null;
  sofor_ad: string | null;
  durum: string | null;
  durak_sayisi: number | null;
  toplam_kg: number | string | null;
  toplam_cuval: number | string | null;
  kg_doluluk: number | string | null;
  cuval_doluluk: number | string | null;
  google_sure_sn: number | null;
  google_mesafe_m: number | null;
  olusturuldu: string | null;
}

interface DurakRaw {
  plan_id: string;
  sira: number | null;
  musteri_kodu: string;
  kg: number | string | null;
  cuval_esdeger: number | string | null;
  unvan: string | null;
  ilce: string | null;
  sehir: string | null;
  lat: number | null;
  lon: number | null;
  risk_durumu: string | null;
}

export interface KayitliDurak {
  sira: number;
  musteriKodu: string;
  /** Master'dan düşmüş müşteri için null gelir — satır yine görünür. */
  unvan: string | null;
  ilce: string | null;
  sehir: string | null;
  lat: number | null;
  lon: number | null;
  riskDurumu: RiskDurumu | null;
  /** Plan anında DONDURULMUŞ yük — bugünkü sipariş değişse de sabit. */
  kg: number;
  cuvalEsdeger: number;
}

export interface KayitliPlan {
  id: string;
  planTarihi: string;
  aracKod: string;
  aracAd: string;
  soforAd: string | null;
  durum: string | null;
  durakSayisi: number;
  toplamKg: number;
  toplamCuval: number;
  kgDoluluk: number | null;
  cuvalDoluluk: number | null;
  googleSureSn: number | null;
  googleMesafeM: number | null;
  olusturuldu: string | null;
  duraklar: KayitliDurak[];
}

/** Aynı güne ait planlar tek başlık altında. */
export interface KayitliGun {
  planTarihi: string;
  planlar: KayitliPlan[];
  toplamKg: number;
  toplamDurak: number;
}

function sayi(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sayiVeyaNull(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const RISK_DEGERLERI: ReadonlySet<string> = new Set<RiskDurumu>([
  "saglikli",
  "izlenmeli",
  "riskli",
  "hic_teslimat_yok",
]);

function riskeCevir(v: string | null): RiskDurumu | null {
  return v != null && RISK_DEGERLERI.has(v) ? (v as RiskDurumu) : null;
}

function isoGunOnce(gun: number): string {
  const d = new Date();
  d.setDate(d.getDate() - gun);
  return d.toISOString().slice(0, 10);
}

interface Durum {
  gunler: KayitliGun[];
  loading: boolean;
  error: string | null;
}

/**
 * Kaydedilmiş sevkiyat planları.
 *
 * Bu kayıtlar ERP'de olmayan "hangi yük hangi araçla, kim sürerek gitti"
 * geçmişinin tek kaynağı — Panorama'da araç alanları sahte (1.979 belgenin
 * hepsi aynı plaka). Yük değerleri plan anında dondurulduğu için bugünkü
 * bekleyen sipariş tablosuyla karşılaştırılamaz; ayrı okunur.
 */
export function useKayitliPlanlar() {
  const cached = getReportCache<KayitliGun[]>(CACHE_KEY);
  const [durum, setDurum] = useState<Durum>(() => ({
    gunler: cached ?? [],
    loading: !cached,
    error: null,
  }));
  const [sayac, setSayac] = useState(0);

  const tazele = useCallback(() => setSayac((n) => n + 1), []);

  useEffect(() => {
    const varCache = Boolean(getReportCache<KayitliGun[]>(CACHE_KEY));
    if (sayac === 0 && varCache && isReportCacheFresh(CACHE_KEY)) return;

    let iptal = false;

    async function run() {
      try {
        const planlar = await fetchAllRows<PlanRaw>((from, to) =>
          supabase
            .from(SEVKIYAT_PLAN_OZET_VIEW)
            .select(
              "id,plan_tarihi,arac_kod,arac_ad,sofor_kod,sofor_ad,durum," +
                "durak_sayisi,toplam_kg,toplam_cuval,kg_doluluk,cuval_doluluk," +
                "google_sure_sn,google_mesafe_m,olusturuldu"
            )
            .gte("plan_tarihi", isoGunOnce(GUN_SINIRI))
            .order("plan_tarihi", { ascending: false })
            .order("arac_kod", { ascending: true })
            .range(from, to) as unknown as Promise<{
            data: PlanRaw[] | null;
            error: { message: string } | null;
          }>
        );

        if (iptal) return;

        // Plan yoksa durak sorgusu da gereksiz.
        const planIdler = planlar.map((p) => p.id);
        const duraklar =
          planIdler.length === 0
            ? []
            : await fetchAllRows<DurakRaw>((from, to) =>
                supabase
                  .from(SEVKIYAT_PLAN_DURAKLARI_VIEW)
                  .select(
                    "plan_id,sira,musteri_kodu,kg,cuval_esdeger," +
                      "unvan,ilce,sehir,lat,lon,risk_durumu"
                  )
                  .in("plan_id", planIdler)
                  .order("sira", { ascending: true })
                  .range(from, to) as unknown as Promise<{
                  data: DurakRaw[] | null;
                  error: { message: string } | null;
                }>
              );

        if (iptal) return;

        const duraklarByPlan = new Map<string, KayitliDurak[]>();
        for (const d of duraklar) {
          const liste = duraklarByPlan.get(d.plan_id) ?? [];
          liste.push({
            sira: d.sira ?? liste.length + 1,
            musteriKodu: d.musteri_kodu,
            unvan: d.unvan,
            ilce: d.ilce,
            sehir: d.sehir,
            lat: d.lat,
            lon: d.lon,
            riskDurumu: riskeCevir(d.risk_durumu),
            kg: sayi(d.kg),
            cuvalEsdeger: sayi(d.cuval_esdeger),
          });
          duraklarByPlan.set(d.plan_id, liste);
        }

        const gunHaritasi = new Map<string, KayitliPlan[]>();
        for (const p of planlar) {
          const plan: KayitliPlan = {
            id: p.id,
            planTarihi: p.plan_tarihi,
            aracKod: p.arac_kod,
            aracAd: p.arac_ad ?? p.arac_kod,
            soforAd: p.sofor_ad,
            durum: p.durum,
            durakSayisi: p.durak_sayisi ?? 0,
            toplamKg: sayi(p.toplam_kg),
            toplamCuval: sayi(p.toplam_cuval),
            kgDoluluk: sayiVeyaNull(p.kg_doluluk),
            cuvalDoluluk: sayiVeyaNull(p.cuval_doluluk),
            googleSureSn: p.google_sure_sn,
            googleMesafeM: p.google_mesafe_m,
            olusturuldu: p.olusturuldu,
            duraklar: duraklarByPlan.get(p.id) ?? [],
          };
          const liste = gunHaritasi.get(p.plan_tarihi) ?? [];
          liste.push(plan);
          gunHaritasi.set(p.plan_tarihi, liste);
        }

        const gunler: KayitliGun[] = [...gunHaritasi.entries()].map(
          ([planTarihi, liste]) => ({
            planTarihi,
            planlar: liste,
            toplamKg: liste.reduce((t, p) => t + p.toplamKg, 0),
            toplamDurak: liste.reduce((t, p) => t + p.durakSayisi, 0),
          })
        );

        setReportCache(CACHE_KEY, gunler);
        setDurum({ gunler, loading: false, error: null });
      } catch (err) {
        if (iptal) return;
        setDurum((o) => ({
          ...o,
          loading: false,
          error:
            err instanceof Error ? err.message : "Kayıtlı planlar yüklenemedi.",
        }));
      }
    }

    void run();
    return () => {
      iptal = true;
    };
  }, [sayac]);

  const ozet = useMemo(
    () => ({
      gunSayisi: durum.gunler.length,
      planSayisi: durum.gunler.reduce((t, g) => t + g.planlar.length, 0),
    }),
    [durum.gunler]
  );

  return { ...durum, ozet, tazele };
}
