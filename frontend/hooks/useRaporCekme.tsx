"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  CekimAdimlari,
  CekimOzeti,
} from "@/components/panorama/CekimToastIcerik";
import { useToastManager } from "@/components/ui/toast";
import {
  PANORAMA_ZINCIRLERI,
  tahminiSureMs,
  zincirleriCoz,
  type PanoramaZinciri,
  type RaporOzeti,
} from "@/lib/panorama-raporlar";
import {
  izleRaporCekimi,
  writeManualSyncAt,
  type ZincirIlerlemesi,
} from "@/lib/panorama-manual-sync";

/**
 * Rapor çekme akışı — seçim, tetikleme, ilerleme, özet.
 *
 * Çalışan çekim UYGULAMA SEVİYESİNDE tutulur ((app)/layout.tsx), bileşende
 * değil. Sebebi: kart sohbet mesajının içinde ya da ana sayfadaki Sheet'te
 * duruyor; kullanıcı başka sayfaya geçince o bileşen unmount oluyordu ve
 * çekim takibi, ilerleme ve özet birlikte kayboluyordu. Provider hiç unmount
 * olmadığı için çekim arka planda sürüyor, toast her sayfada görünüyor.
 *
 * Hiçbir adımda modele gidilmez: seçim kullanıcıdan, rakamlar veritabanından.
 */

const CEKIM_STORAGE_KEY = "locus:panorama-cekim-aktif";

export type CekimAsamasi = "cekiliyor" | "ozet" | "hata";

export interface CekimRunu {
  asama: CekimAsamasi;
  /** Çekilen zincirlerin anahtarları. */
  anahtarlar: string[];
  ilerleme: ZincirIlerlemesi[];
  ozet: RaporOzeti[];
  hata: string | null;
  basladiAt: number;
}

interface RaporCekmeDegeri {
  run: CekimRunu | null;
  calisiyor: boolean;
  basla: (anahtarlar: readonly string[]) => Promise<void>;
  temizle: () => void;
}

const Ctx = createContext<RaporCekmeDegeri | null>(null);

/** Sayfa yenilendiğinde yarım kalan çekimi tekrar izleyebilmek için. */
function aktifCekimiYaz(anahtarlar: string[], basladiAt: number) {
  try {
    window.localStorage.setItem(
      CEKIM_STORAGE_KEY,
      JSON.stringify({ anahtarlar, basladiAt })
    );
  } catch {
    /* private mode */
  }
}

function aktifCekimiSil() {
  try {
    window.localStorage.removeItem(CEKIM_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

function aktifCekimiOku(): { anahtarlar: string[]; basladiAt: number } | null {
  try {
    const ham = window.localStorage.getItem(CEKIM_STORAGE_KEY);
    if (!ham) return null;
    const o = JSON.parse(ham) as { anahtarlar?: unknown; basladiAt?: unknown };
    const basladiAt = Number(o.basladiAt);
    if (!Number.isFinite(basladiAt)) return null;
    // 20 dk'dan eski kayıt: ya bitti ya zaman aşımına uğradı, izlemeye değmez.
    if (Date.now() - basladiAt > 20 * 60 * 1000) return null;
    const anahtarlar = Array.isArray(o.anahtarlar)
      ? o.anahtarlar.filter((a): a is string => typeof a === "string")
      : [];
    return anahtarlar.length ? { anahtarlar, basladiAt } : null;
  } catch {
    return null;
  }
}

function baslangicIlerlemesi(anahtarlar: readonly string[]): ZincirIlerlemesi[] {
  return zincirleriCoz(anahtarlar).zincirler.map((z) => ({
    anahtar: z.anahtar,
    ad: z.ad,
    durum: "bekliyor" as const,
    satirSayisi: null,
    hata: null,
  }));
}

export function RaporCekmeProvider({ children }: { children: ReactNode }) {
  const toast = useToastManager();
  const [run, setRun] = useState<CekimRunu | null>(null);
  const calisiyorRef = useRef(false);

  /**
   * Çekimi baştan sona yürütür. Provider'da yaşadığı için sayfa değişse de
   * devam eder; toast root layout'taki ToastProvider'dan geldiği için her
   * sayfada görünür.
   */
  const yurut = useCallback(
    async (anahtarlar: string[], basladiAt: number, tetikle: boolean) => {
      if (calisiyorRef.current) return;
      calisiyorRef.current = true;

      const tumu = anahtarlar.length === PANORAMA_ZINCIRLERI.length;
      // Hepsi seçiliyse liste GÖNDERİLMEZ: n8n Guard'ı boş listeyi "bütün
      // zincirler" olarak okuyor, eski davranış birebir korunsun.
      const govdeSecim = tumu ? null : anahtarlar;

      const baslangic = baslangicIlerlemesi(anahtarlar);
      setRun({
        asama: "cekiliyor",
        anahtarlar,
        ilerleme: baslangic,
        ozet: [],
        hata: null,
        basladiAt,
      });

      // toast.promise yerine add + update: açıklama ReactNode kabul ettiği
      // için adımlar çekim sürerken canlı tiklenebiliyor. promise ile
      // açıklama sabit kalırdı.
      const kacRapor = anahtarlar.length;
      const toastId = toast.add({
        type: "loading",
        title: kacRapor === 1 ? "Rapor çekiliyor…" : `${kacRapor} rapor çekiliyor…`,
        description: <CekimAdimlari ilerleme={baslangic} />,
        timeout: 0,
        priority: "low",
      });

      try {
        if (tetikle) {
          const res = await fetch("/api/sync/panorama/manual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(govdeSecim ? { reportIds: govdeSecim } : {}),
          });
          const govde = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (!res.ok) throw new Error(govde?.error ?? "Çekim başlatılamadı.");
          writeManualSyncAt(basladiAt);
          aktifCekimiYaz(anahtarlar, basladiAt);
        }

        await izleRaporCekimi(basladiAt, govdeSecim, (adimlar) => {
          setRun((o) => (o ? { ...o, ilerleme: adimlar } : o));
          toast.update(toastId, {
            description: <CekimAdimlari ilerleme={adimlar} />,
          });
        });

        const ozetRes = await fetch("/api/sync/panorama/ozet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportIds: anahtarlar }),
        });
        const ozetGovde = (await ozetRes.json().catch(() => null)) as {
          raporlar?: RaporOzeti[];
          error?: string;
        } | null;
        if (!ozetRes.ok) throw new Error(ozetGovde?.error ?? "Özet okunamadı.");

        const gelen = ozetGovde?.raporlar ?? [];
        setRun((o) => (o ? { ...o, asama: "ozet", ozet: gelen } : o));
        aktifCekimiSil();

        // "Bitti" + neyin güncellendiği; birkaç saniye sonra kendi kapanıyor.
        toast.update(toastId, {
          type: "success",
          title: "Çekim tamamlandı",
          description: <CekimOzeti raporlar={gelen} />,
          timeout: 9_000,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
        setRun((o) => (o ? { ...o, asama: "hata", hata: msg } : o));
        aktifCekimiSil();
        toast.update(toastId, {
          type: "error",
          title: msg.includes("zaman aşımı") ? "Çekim bitmedi" : "Çekim başlatılamadı",
          description: msg,
          timeout: 12_000,
        });
      } finally {
        calisiyorRef.current = false;
      }
    },
    [toast]
  );

  const basla = useCallback(
    async (anahtarlar: readonly string[]) => {
      const temiz = zincirleriCoz(anahtarlar).zincirler.map((z) => z.anahtar);
      if (!temiz.length) return;
      await yurut(temiz, Date.now(), true);
    },
    [yurut]
  );

  // Sayfa yenilendiyse yarım kalan çekimi tekrar izlemeye al (yeniden
  // TETİKLEME yok — n8n zaten çalışıyor, sadece takibi geri bağlıyoruz).
  useEffect(() => {
    const aktif = aktifCekimiOku();
    if (!aktif) return;
    // Bir tik ertele: mount sırasında senkron setState cascading render
    // yaratıyor. İzleme zaten ağ tabanlı, bir tik gecikmenin etkisi yok.
    const id = window.setTimeout(() => {
      void yurut(aktif.anahtarlar, aktif.basladiAt, false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [yurut]);

  const temizle = useCallback(() => {
    if (calisiyorRef.current) return;
    setRun(null);
  }, []);

  const deger = useMemo<RaporCekmeDegeri>(
    () => ({ run, calisiyor: run?.asama === "cekiliyor", basla, temizle }),
    [run, basla, temizle]
  );

  return <Ctx.Provider value={deger}>{children}</Ctx.Provider>;
}

export function useRaporCekme(): RaporCekmeDegeri {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useRaporCekme, RaporCekmeProvider içinde çağrılmalı");
  }
  return v;
}

/** "stok, tahsilat" gibi kısa bir seçim etiketi. */
export function secimEtiketi(
  secilen: readonly PanoramaZinciri[],
  toplam: number
): string {
  if (secilen.length === 0) return "Seçim yok";
  if (secilen.length === toplam) return `Tüm raporlar (${toplam})`;
  if (secilen.length <= 2) return secilen.map((z) => z.ad).join(", ");
  return `${secilen[0]!.ad} +${secilen.length - 1} rapor`;
}

/** Anahtar listesini zincirlere çevirir. */
export function anahtarlariCoz(anahtarlar: readonly string[]): PanoramaZinciri[] {
  return zincirleriCoz(anahtarlar).zincirler;
}

/** Seçilen zincirlerin tahmini süresi (sn) — kartın başlığında gösteriliyor. */
export function secimSuresiSn(secilen: readonly PanoramaZinciri[]): number {
  return Math.round(tahminiSureMs(secilen) / 1000);
}
