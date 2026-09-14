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
  TaramaIlerlemesi,
  TaramaOzetiIcerik,
} from "@/components/potansiyel/TaramaToastIcerik";
import { useToastManager } from "@/components/ui/toast";
import {
  izleTarama,
  TARAMA_DEADLINE_MS,
  TARAMA_STORAGE_KEY,
  type TaramaKotasi,
  type TaramaSatiri,
} from "@/lib/potansiyel-tarama";

/**
 * Potansiyel tarama akışı — toast, satır izleme, kota, kalıcılık.
 *
 * `useRaporCekme` ile aynı gerekçeyle (app)/layout.tsx'te yaşar: tarama 3-12 dk
 * sürüyor ve kullanıcı bu sırada başka sayfaya geçebilmeli; provider unmount
 * olmadığı için toast her sayfada görünmeye devam eder.
 *
 * ⚠️ `useRaporCekme`'den BİLİNÇLİ SAPMA: orada POST'u provider atıyor. Burada
 * POST'u SAYFA atıyor (harita/page.tsx), çünkü 409/429 yanıtları onay kartının
 * içinde satır içi gösterilmeli — toast'a düşen bir hata kullanıcıyı kartın
 * neden reddedildiği konusunda bilgisiz bırakırdı. Provider yalnız
 * "tetiklendi, şimdi izle" kısmını sahiplenir.
 */

type AktifKayit = {
  runId: string;
  il: string;
  plaka: number;
  basladiAt: number;
  planlananIlce: number | null;
};

export type TaramaAsamasi = "taraniyor" | "bitti" | "hata";

export interface TaramaRunu extends AktifKayit {
  asama: TaramaAsamasi;
  satir: TaramaSatiri | null;
  hata: string | null;
}

interface PotansiyelTaramaDegeri {
  run: TaramaRunu | null;
  calisiyor: boolean;
  kota: TaramaKotasi | null;
  /** POST başarılı olduktan sonra çağrılır — tetikleme YAPMAZ, izler. */
  izle: (kayit: AktifKayit) => void;
  kotayiTazele: () => void;
}

const Ctx = createContext<PotansiyelTaramaDegeri | null>(null);

function aktifYaz(kayit: AktifKayit) {
  try {
    window.localStorage.setItem(TARAMA_STORAGE_KEY, JSON.stringify(kayit));
  } catch {
    /* private mode */
  }
}

function aktifSil() {
  try {
    window.localStorage.removeItem(TARAMA_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

function aktifOku(): AktifKayit | null {
  try {
    const ham = window.localStorage.getItem(TARAMA_STORAGE_KEY);
    if (!ham) return null;
    const k = JSON.parse(ham) as Partial<AktifKayit>;
    if (!k?.runId || !k.il || typeof k.basladiAt !== "number") return null;
    // Ölü kayıt: süpürücü eşiğini geçmişse izlemeye değmez.
    if (Date.now() - k.basladiAt > TARAMA_DEADLINE_MS) {
      aktifSil();
      return null;
    }
    return {
      runId: k.runId,
      il: k.il,
      plaka: Number(k.plaka ?? 0),
      basladiAt: k.basladiAt,
      planlananIlce: k.planlananIlce ?? null,
    };
  } catch {
    return null;
  }
}

export function PotansiyelTaramaProvider({ children }: { children: ReactNode }) {
  const toast = useToastManager();
  const [run, setRun] = useState<TaramaRunu | null>(null);
  const [kota, setKota] = useState<TaramaKotasi | null>(null);
  const calisiyorRef = useRef(false);

  const kotayiTazele = useCallback(() => {
    void fetch("/api/potansiyel/tarama")
      .then((r) => (r.ok ? r.json() : null))
      .then((g: { kota?: TaramaKotasi } | null) => {
        if (g?.kota) setKota(g.kota);
      })
      .catch(() => {
        /* rozet kotasız da çalışır */
      });
  }, []);

  useEffect(() => {
    kotayiTazele();
  }, [kotayiTazele]);

  const yurut = useCallback(
    async (kayit: AktifKayit) => {
      if (calisiyorRef.current) return;
      calisiyorRef.current = true;
      aktifYaz(kayit);
      setRun({ ...kayit, asama: "taraniyor", satir: null, hata: null });

      // add + update: açıklama ReactNode kabul ettiği için geçen süre
      // tarama sürerken canlı ilerleyebiliyor (toast.promise ile sabit kalırdı).
      const toastId = toast.add({
        type: "loading",
        title: `${kayit.il} taranıyor…`,
        description: (
          <TaramaIlerlemesi
            il={kayit.il}
            planlananIlce={kayit.planlananIlce}
            basladiAt={kayit.basladiAt}
            simdi={Date.now()}
          />
        ),
        timeout: 0,
        priority: "low",
      });

      // n8n yalnız başta ve sonda yazıyor; ara ilerleme yok. Geçen süreyi
      // tiklemek, "takıldı mı" sorusunu kullanıcı adına yanıtlıyor.
      const sayac = window.setInterval(() => {
        toast.update(toastId, {
          description: (
            <TaramaIlerlemesi
              il={kayit.il}
              planlananIlce={kayit.planlananIlce}
              basladiAt={kayit.basladiAt}
              simdi={Date.now()}
            />
          ),
        });
      }, 5_000);

      try {
        const satir = await izleTarama(kayit.runId, kayit.basladiAt, (ara) => {
          setRun((o) => (o ? { ...o, satir: ara } : o));
        });
        window.clearInterval(sayac);
        aktifSil();

        if (satir.durum === "failed") {
          setRun((o) =>
            o ? { ...o, asama: "hata", satir, hata: satir.hata } : o
          );
          toast.update(toastId, {
            type: "error",
            title: `${kayit.il} taraması başarısız`,
            description: satir.hata ?? "n8n execution loguna bakın.",
            timeout: 14_000,
          });
        } else {
          setRun((o) => (o ? { ...o, asama: "bitti", satir } : o));
          toast.update(toastId, {
            type: "success",
            title: "Tarama tamamlandı",
            description: <TaramaOzetiIcerik satir={satir} />,
            timeout: 14_000,
          });
        }
      } catch (err) {
        window.clearInterval(sayac);
        aktifSil();
        const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
        setRun((o) => (o ? { ...o, asama: "hata", hata: msg } : o));
        toast.update(toastId, {
          type: "error",
          title: "Tarama izlenemedi",
          description: msg,
          timeout: 14_000,
        });
      } finally {
        calisiyorRef.current = false;
        kotayiTazele();
      }
    },
    [toast, kotayiTazele]
  );

  const izle = useCallback(
    (kayit: AktifKayit) => {
      void yurut(kayit);
    },
    [yurut]
  );

  // Sayfa yenilendiyse yarım kalan taramayı tekrar izlemeye al — yeniden
  // TETİKLEME yok, n8n zaten çalışıyor (useRaporCekme.tsx:229-238 deseni).
  useEffect(() => {
    const aktif = aktifOku();
    if (!aktif) return;
    // Bir tik ertele: mount sırasında senkron setState cascading render yaratır.
    const id = window.setTimeout(() => {
      void yurut(aktif);
    }, 0);
    return () => window.clearTimeout(id);
  }, [yurut]);

  const deger = useMemo<PotansiyelTaramaDegeri>(
    () => ({
      run,
      calisiyor: run?.asama === "taraniyor",
      kota,
      izle,
      kotayiTazele,
    }),
    [run, kota, izle, kotayiTazele]
  );

  return <Ctx.Provider value={deger}>{children}</Ctx.Provider>;
}

export function usePotansiyelTarama(): PotansiyelTaramaDegeri {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "usePotansiyelTarama, PotansiyelTaramaProvider içinde çağrılmalı ((app)/layout.tsx)."
    );
  }
  return ctx;
}
