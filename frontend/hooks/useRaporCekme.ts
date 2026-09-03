"use client";

import { useCallback, useMemo, useRef, useState } from "react";

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
 * Rapor çekme akışının tamamı — seçim, tetikleme, ilerleme, özet.
 *
 * Hem sohbetteki kart hem ana sayfadaki "Şimdi çek" düğmesi bunu kullanır;
 * iki yerde iki ayrı davranış olmasın diye tek yerde tutuluyor.
 *
 * Hiçbir adımda modele gidilmez: seçim kullanıcıdan, rakamlar veritabanından.
 */
export type CekimAsamasi = "secim" | "cekiliyor" | "ozet" | "hata";

export interface RaporCekmeDurumu {
  asama: CekimAsamasi;
  secili: Set<string>;
  zincirler: readonly PanoramaZinciri[];
  secilenZincirler: PanoramaZinciri[];
  hepsi: boolean;
  hicbiri: boolean;
  ilerleme: ZincirIlerlemesi[];
  ozet: RaporOzeti[];
  hata: string | null;
  tahminiSn: number;
  bitenSayisi: number;
  degistir: (anahtar: string) => void;
  hepsiniDegistir: () => void;
  basla: () => Promise<void>;
  sifirla: () => void;
}

export function useRaporCekme(options?: {
  /** Kart açıldığında işaretli gelecek anahtarlar. */
  onSecili?: readonly string[];
  onBitti?: (ozet: RaporOzeti[]) => void;
}): RaporCekmeDurumu {
  const zincirler = PANORAMA_ZINCIRLERI;
  const [secili, setSecili] = useState<Set<string>>(
    () => new Set(options?.onSecili ?? [])
  );
  const [asama, setAsama] = useState<CekimAsamasi>("secim");
  const [ilerleme, setIlerleme] = useState<ZincirIlerlemesi[]>([]);
  const [ozet, setOzet] = useState<RaporOzeti[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const calisiyorRef = useRef(false);

  const secilenZincirler = useMemo(
    () => zincirler.filter((z) => secili.has(z.anahtar)),
    [zincirler, secili]
  );
  const hepsi = secili.size === zincirler.length;
  const hicbiri = secili.size === 0;

  const tahminiSn = useMemo(
    () => Math.round(tahminiSureMs(secilenZincirler) / 1000),
    [secilenZincirler]
  );

  const bitenSayisi = useMemo(
    () => ilerleme.filter((i) => i.durum === "bitti").length,
    [ilerleme]
  );

  const degistir = useCallback(
    (anahtar: string) => {
      if (calisiyorRef.current) return;
      setSecili((o) => {
        const s = new Set(o);
        if (s.has(anahtar)) s.delete(anahtar);
        else s.add(anahtar);
        return s;
      });
    },
    []
  );

  const hepsiniDegistir = useCallback(() => {
    if (calisiyorRef.current) return;
    setSecili((o) =>
      o.size === zincirler.length ? new Set() : new Set(zincirler.map((z) => z.anahtar))
    );
  }, [zincirler]);

  const sifirla = useCallback(() => {
    if (calisiyorRef.current) return;
    setAsama("secim");
    setIlerleme([]);
    setOzet([]);
    setHata(null);
  }, []);

  const basla = useCallback(async () => {
    if (calisiyorRef.current || secili.size === 0) return;
    calisiyorRef.current = true;

    const tumSecili = secili.size === zincirler.length;
    // Hepsi seçiliyse liste GÖNDERİLMEZ: n8n Guard'ı boş listeyi "bütün
    // zincirler" olarak okuyor, eski davranış birebir korunsun.
    const govdeSecim = tumSecili
      ? null
      : zincirler.filter((z) => secili.has(z.anahtar)).map((z) => z.anahtar);
    const izlenecek = govdeSecim ?? zincirler.map((z) => z.anahtar);

    const basladi = Date.now();
    setAsama("cekiliyor");
    setHata(null);
    setIlerleme(
      zincirler
        .filter((z) => izlenecek.includes(z.anahtar))
        .map((z) => ({
          anahtar: z.anahtar,
          ad: z.ad,
          durum: "bekliyor" as const,
          satirSayisi: null,
          hata: null,
        }))
    );

    try {
      const res = await fetch("/api/sync/panorama/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(govdeSecim ? { reportIds: govdeSecim } : {}),
      });
      const govde = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(govde?.error ?? "Çekim başlatılamadı.");

      writeManualSyncAt(basladi);
      await izleRaporCekimi(basladi, govdeSecim, setIlerleme);

      const ozetRes = await fetch("/api/sync/panorama/ozet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportIds: izlenecek }),
      });
      const ozetGovde = (await ozetRes.json().catch(() => null)) as {
        raporlar?: RaporOzeti[];
        error?: string;
      } | null;
      if (!ozetRes.ok) throw new Error(ozetGovde?.error ?? "Özet okunamadı.");

      const gelen = ozetGovde?.raporlar ?? [];
      setOzet(gelen);
      setAsama("ozet");
      options?.onBitti?.(gelen);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Çekim tamamlanamadı.");
      setAsama("hata");
    } finally {
      calisiyorRef.current = false;
    }
    // options bilinçli olarak bağımlılıkta yok: her render'da yeni nesne
    // geliyor ve callback'i yeniden kurmak çekimi kesebilirdi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secili, zincirler]);

  return {
    asama,
    secili,
    zincirler,
    secilenZincirler,
    hepsi,
    hicbiri,
    ilerleme,
    ozet,
    hata,
    tahminiSn,
    bitenSayisi,
    degistir,
    hepsiniDegistir,
    basla,
    sifirla,
  };
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

/** Anahtar listesini zincirlere çevirir — dışarıdan gelen seçim için. */
export function anahtarlariCoz(anahtarlar: readonly string[]): PanoramaZinciri[] {
  return zincirleriCoz(anahtarlar).zincirler;
}
