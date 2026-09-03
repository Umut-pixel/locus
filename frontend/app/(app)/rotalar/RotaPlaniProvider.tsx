"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { RotaBilgisi } from "@/components/rota/AracKarti";
import { aracRengi, type HaritaRotasi } from "@/components/rota/RotaHaritasi";
import type { EtkiSecenegi } from "@/components/rota/EtkiPaneli";
import {
  useRotaPlani,
  type RotaAraci,
  type RotaDuragi,
  type RotaOzeti,
} from "@/hooks/useRotaPlani";
import { DEPOT } from "@/lib/depot";
import { formatNumber } from "@/lib/format";
import {
  dolulukHesapla,
  surulebilirKirp,
  type FiloSecimi,
  type Sofor,
} from "@/lib/rota/atama";
import { sonrakiKalkis } from "@/lib/rota/operasyon";
import { planMetrigi, planOlustur, type PlanMetrigi } from "@/lib/rota/planla";
import {
  tercihAbone,
  tercihAnlik,
  tercihGuncelle,
  tercihSunucuAnlik,
  type Tercihler,
} from "@/lib/rota/tercihler";

/** aracKod → sıralı musteriKodu listesi. Sıra = durak numarası. */
export type Plan = Record<string, string[]>;

export interface KayitDurumu {
  tur: "ok" | "hata";
  mesaj: string;
}

interface RotaPlaniDegeri {
  // Veri
  loading: boolean;
  error: string | null;
  duraklar: RotaDuragi[];
  /** Filonun tamamı — "şoför yok" nedenini ayırt etmek için. */
  araclar: RotaAraci[];
  soforler: Sofor[];
  filo: FiloSecimi<RotaAraci>;
  ozet: RotaOzeti;
  tazele: () => void;

  // Tercihler
  tercihler: Tercihler;
  tercihDegis: (yeni: Partial<Tercihler>) => void;

  // Taslak plan
  plan: Plan;
  /** O gün çıkabilecek araçlar — şoför sınırı + elle seçim uygulanmış. */
  cikanAraclar: RotaAraci[];
  /** Elle seçilip şoför yetmediği için çıkamayan araçlar. */
  elenenAraclar: RotaAraci[];
  havuz: RotaDuragi[];
  atananSayisi: number;
  aracDuraklari: (aracKod: string) => RotaDuragi[];
  aracBul: (aracKod: string) => RotaAraci | null;
  rotalar: HaritaRotasi[];

  // Seçim ve düzenleme
  seciliArac: string | null;
  setSeciliArac: (kod: string | null) => void;
  otomatikDagit: () => void;
  hepsiniTemizle: () => void;
  durakEkle: (musteriKodu: string, aracKod?: string) => void;
  durakCikar: (musteriKodu: string) => void;
  aracTemizle: (aracKod: string) => void;

  // Google Routes
  optimizeEt: (aracKod: string) => Promise<void>;
  optimizeEdilen: string | null;
  rotaBilgileri: Record<string, RotaBilgisi>;
  optimizeHatalari: Record<string, string>;

  // Ölçüm
  mevcutMetrik: PlanMetrigi;
  etkiSecenekleri: EtkiSecenegi[];

  // Kayıt
  planiKaydet: () => Promise<void>;
  kaydediliyor: boolean;
  kayitDurumu: KayitDurumu | null;
}

const Baglam = createContext<RotaPlaniDegeri | null>(null);

/**
 * Rota modülünün paylaşılan durumu.
 *
 * Neden context: taslak plan (hangi durak hangi araçta) üç ekran arasında
 * yaşamalı — bento ana sayfa, araç detayı ve tam ekran harita. Sayfa
 * `useState`'inde tutulursa gezinirken kayboluyordu.
 */
export function RotaPlaniProvider({ children }: { children: ReactNode }) {
  /**
   * Tercihler localStorage'da, yani sunucuda yok. `useSyncExternalStore` ilk
   * kareyi varsayılanla çizip hemen ardından kaydedilmiş değere geçiyor —
   * `useState(oku)` ile başlatmak hydration uyuşmazlığı üretiyordu (client
   * component'ler de sunucuda prerender ediliyor).
   */
  const tercihler = useSyncExternalStore(
    tercihAbone,
    tercihAnlik,
    tercihSunucuAnlik
  );

  const tercihDegis = useCallback(
    (yeni: Partial<Tercihler>) => tercihGuncelle(yeni),
    []
  );

  const { loading, error, duraklar, araclar, soforler, filo, ozet, tazele } =
    useRotaPlani(tercihler.gunPenceresi);

  /**
   * O gün çıkabilecek araçlar.
   *
   * Elle seçim varsa OLDUĞU GİBİ geçerli — yalnız şoföre sığmayanlar elenir.
   * Burada `filoSec` çağırmak hataydı: o "yükü karşılayan en küçük filo"yu
   * arıyor, yani 4 araç seçildiğinde yük tek Transit'e sığıyorsa diğer üçünü
   * atıyordu. Kullanıcı elle seçtiyse niyeti "bu araçlar çıksın"dır.
   */
  const { cikanAraclar, elenenAraclar } = useMemo(() => {
    if (tercihler.aracKodlari == null) {
      return { cikanAraclar: filo.secilen, elenenAraclar: [] as RotaAraci[] };
    }
    const istenen = new Set(tercihler.aracKodlari);
    // Sıra `araclar`dan gelir (sira kolonu) — tıklama sırası değil, sabit.
    const elle = araclar.filter((a) => istenen.has(a.kod));
    const { cikan, elenen } = surulebilirKirp(elle, soforler);
    return { cikanAraclar: cikan, elenenAraclar: elenen };
  }, [tercihler.aracKodlari, filo, araclar, soforler]);

  const [plan, setPlan] = useState<Plan>({});
  const [seciliArac, setSeciliArac] = useState<string | null>(null);
  const [optimizeEdilen, setOptimizeEdilen] = useState<string | null>(null);
  const [rotaBilgileri, setRotaBilgileri] = useState<
    Record<string, RotaBilgisi>
  >({});
  const [optimizeHatalari, setOptimizeHatalari] = useState<
    Record<string, string>
  >({});
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [kayitDurumu, setKayitDurumu] = useState<KayitDurumu | null>(null);

  const durakHaritasi = useMemo(() => {
    const m = new Map<string, RotaDuragi>();
    for (const d of duraklar) m.set(d.musteriKodu, d);
    return m;
  }, [duraklar]);

  const atananlar = useMemo(() => new Set(Object.values(plan).flat()), [plan]);

  const havuz = useMemo(
    () => duraklar.filter((d) => !atananlar.has(d.musteriKodu)),
    [duraklar, atananlar]
  );

  const aracDuraklari = useCallback(
    (aracKod: string): RotaDuragi[] =>
      (plan[aracKod] ?? [])
        .map((kod) => durakHaritasi.get(kod))
        .filter((d): d is RotaDuragi => d != null),
    [plan, durakHaritasi]
  );

  const aracBul = useCallback(
    (aracKod: string): RotaAraci | null =>
      araclar.find((a) => a.kod === aracKod) ?? null,
    [araclar]
  );

  const rotalar = useMemo<HaritaRotasi[]>(
    () =>
      cikanAraclar.map((a, i) => ({
        aracKod: a.kod,
        aracAd: a.ad,
        renk: aracRengi(i),
        duraklar: aracDuraklari(a.kod),
      })),
    [cikanAraclar, aracDuraklari]
  );

  /** Atama değişti — o araç için eski güzergâh süresi geçersiz. */
  const rotaBilgisiniDusur = useCallback((aracKod: string) => {
    setRotaBilgileri((o) => {
      if (o[aracKod] == null) return o;
      const sonraki = { ...o };
      delete sonraki[aracKod];
      return sonraki;
    });
    setOptimizeHatalari((o) => {
      if (o[aracKod] == null) return o;
      const sonraki = { ...o };
      delete sonraki[aracKod];
      return sonraki;
    });
  }, []);

  /**
   * Tercihlere göre dağıtım. Panorama rut'u kullanılmıyor: Melih "o öylesine
   * yapılmış bir rut, düzenlenecek" dedi, ölçüm de doğrulamıştı (gün
   * tutarlılığı %18, sıra TSP alt sınırının 4,5–37 katı).
   *
   * Yalnız `cikanAraclar`'a dağıtır — filonun tamamına değil. `araclar` yine
   * de geçilir ki artan durak "araç yok" yerine "şoför yok" diyebilsin.
   */
  const otomatikDagit = useCallback(() => {
    const sonuc = planOlustur({
      duraklar,
      araclar: cikanAraclar,
      tumFilo: araclar,
      depo: DEPOT,
      strateji: tercihler.strateji,
      uzakAyir: tercihler.uzakAyir,
    });
    const sonraki: Plan = {};
    for (const yuk of sonuc.yukler) {
      sonraki[yuk.arac.kod] = yuk.duraklar.map((d) => d.musteriKodu);
    }
    setPlan(sonraki);
    setRotaBilgileri({});
    setOptimizeHatalari({});
  }, [duraklar, cikanAraclar, araclar, tercihler.strateji, tercihler.uzakAyir]);

  const hepsiniTemizle = useCallback(() => {
    setPlan({});
    setSeciliArac(null);
    setRotaBilgileri({});
    setOptimizeHatalari({});
  }, []);

  /** `aracKod` verilmezse seçili araca eklenir (havuzdan tıklama akışı). */
  const durakEkle = useCallback(
    (musteriKodu: string, aracKod?: string) => {
      const hedef = aracKod ?? seciliArac;
      if (hedef == null) return;
      setPlan((o) => ({
        ...o,
        [hedef]: [...(o[hedef] ?? []), musteriKodu],
      }));
      rotaBilgisiniDusur(hedef);
    },
    [seciliArac, rotaBilgisiniDusur]
  );

  const durakCikar = useCallback(
    (musteriKodu: string) => {
      setPlan((o) => {
        const sonraki: Plan = {};
        for (const [kod, liste] of Object.entries(o)) {
          sonraki[kod] = liste.filter((k) => k !== musteriKodu);
          if (sonraki[kod].length !== liste.length) rotaBilgisiniDusur(kod);
        }
        return sonraki;
      });
    },
    [rotaBilgisiniDusur]
  );

  const aracTemizle = useCallback(
    (aracKod: string) => {
      setPlan((o) => ({ ...o, [aracKod]: [] }));
      rotaBilgisiniDusur(aracKod);
    },
    [rotaBilgisiniDusur]
  );

  /** Google Routes — trafikli durak sırası. Hata olursa mevcut sıra korunur. */
  const optimizeEt = useCallback(
    async (aracKod: string) => {
      const liste = aracDuraklari(aracKod).filter(
        (d) => d.lat != null && d.lon != null
      );
      if (liste.length < 2) return;

      setOptimizeEdilen(aracKod);
      setOptimizeHatalari((o) => {
        const sonraki = { ...o };
        delete sonraki[aracKod];
        return sonraki;
      });

      try {
        const res = await fetch("/api/rota/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            duraklar: liste.map((d) => ({ lat: d.lat, lon: d.lon })),
            // Araç günün sonunda depoya dönüyor (Melih) — güzergâh kapalı
            // halka, dönüş bacağı da süreye giriyor.
            depoyaDonus: true,
            // Trafik tahmini kalkış saatine göre yapılır. "Şimdi" göndermek
            // akşam yapılan planlamada yanlış süre üretiyordu.
            kalkis: sonrakiKalkis().toISOString(),
          }),
        });
        const json = (await res.json()) as {
          sira?: number[];
          toplamSaniye?: number;
          toplamMetre?: number;
          trafik?: string;
          error?: string;
        };

        if (!res.ok || !Array.isArray(json.sira)) {
          throw new Error(json.error ?? "Optimizasyon başarısız.");
        }

        const yeniSira = json.sira
          .map((i) => liste[i]?.musteriKodu)
          .filter((k): k is string => k != null);

        setPlan((o) => ({ ...o, [aracKod]: yeniSira }));
        setRotaBilgileri((o) => ({
          ...o,
          [aracKod]: {
            saniye: json.toplamSaniye ?? 0,
            metre: json.toplamMetre ?? 0,
            trafik: json.trafik ?? "",
          },
        }));
      } catch (err) {
        setOptimizeHatalari((o) => ({
          ...o,
          [aracKod]:
            err instanceof Error ? err.message : "Optimizasyon başarısız.",
        }));
      } finally {
        setOptimizeEdilen(null);
      }
    },
    [aracDuraklari]
  );

  /**
   * Planı kaydet — ERP'de olmayan "hangi yük hangi araçla gitti" geçmişini
   * biriktiren tek yer. Aynı gün + araç için önceki kayıt sunucuda silinip
   * yeniden yazılır, çift kayıt olmaz.
   */
  const planiKaydet = useCallback(async () => {
    const gonderilecek = cikanAraclar
      .map((a) => {
        const liste = aracDuraklari(a.kod);
        if (liste.length === 0) return null;
        const d = dolulukHesapla(a, liste);
        const bilgi = rotaBilgileri[a.kod];
        const sofor = filo.atamalar[a.kod];
        return {
          aracKod: a.kod,
          // ERP'de araç verisi yok — "kim neyi sürdü" geçmişinin tek kaynağı
          // bu kayıt. Ad dondurularak yazılıyor ki kadro değişse de kalsın.
          soforKod: sofor?.kod ?? null,
          soforAd: sofor?.ad ?? null,
          duraklar: liste.map((x) => ({
            musteriKodu: x.musteriKodu,
            kg: x.kg,
            cuvalEsdeger: x.cuvalEsdeger,
          })),
          kgDoluluk: d.kgYuzde,
          cuvalDoluluk: d.cuvalYuzde,
          googleSureSn: bilgi?.saniye ?? null,
          googleMesafeM: bilgi?.metre ?? null,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);

    if (gonderilecek.length === 0) return;

    setKaydediliyor(true);
    setKayitDurumu(null);
    try {
      const res = await fetch("/api/rota/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planlar: gonderilecek }),
      });
      const json = (await res.json()) as {
        planSayisi?: number;
        durakSayisi?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Plan kaydedilemedi.");
      setKayitDurumu({
        tur: "ok",
        mesaj: `${formatNumber(json.planSayisi ?? 0)} araç planı kaydedildi.`,
      });
    } catch (err) {
      setKayitDurumu({
        tur: "hata",
        mesaj: err instanceof Error ? err.message : "Plan kaydedilemedi.",
      });
    } finally {
      setKaydediliyor(false);
    }
  }, [cikanAraclar, aracDuraklari, rotaBilgileri, filo.atamalar]);

  /**
   * Ekrandaki planın ölçümü. Elle düzenlenmiş plan da dahil — kullanıcı bir
   * durağı taşıdığında doluluk ve güzergâh anında güncellenir.
   */
  const mevcutMetrik = useMemo(
    () =>
      planMetrigi({
        yukler: cikanAraclar.map((arac) => {
          const d = aracDuraklari(arac.kod);
          return { arac, duraklar: d, doluluk: dolulukHesapla(arac, d) };
        }),
        yerlesmeyen: havuz.map((durak) => ({
          durak,
          neden: "arac-yok" as const,
        })),
      }),
    [cikanAraclar, aracDuraklari, havuz]
  );

  /**
   * Tercih alternatiflerinin ölçülen etkisi. Hiçbiri ağ çağrısı yapmaz —
   * "coğrafi mi doluluk mu" sorusu denemeden cevaplanabilsin diye.
   */
  const etkiSecenekleri = useMemo<EtkiSecenegi[]>(() => {
    const uret = (strateji: Tercihler["strateji"], uzakAyir: boolean) =>
      planMetrigi(
        planOlustur({
          duraklar,
          araclar: cikanAraclar,
          tumFilo: araclar,
          depo: DEPOT,
          strateji,
          uzakAyir,
        })
      );

    return [
      {
        etiket: "Coğrafi",
        metrik: uret("sweep", tercihler.uzakAyir),
        secili: tercihler.strateji === "sweep",
        onSec: () => tercihDegis({ strateji: "sweep" }),
      },
      {
        etiket: "Doluluk",
        metrik: uret("ffd", tercihler.uzakAyir),
        secili: tercihler.strateji === "ffd",
        onSec: () => tercihDegis({ strateji: "ffd" }),
      },
    ];
  }, [
    duraklar,
    cikanAraclar,
    araclar,
    tercihler.strateji,
    tercihler.uzakAyir,
    tercihDegis,
  ]);

  const deger = useMemo<RotaPlaniDegeri>(
    () => ({
      loading,
      error,
      duraklar,
      araclar,
      soforler,
      filo,
      ozet,
      tazele,
      tercihler,
      tercihDegis,
      plan,
      cikanAraclar,
      elenenAraclar,
      havuz,
      atananSayisi: atananlar.size,
      aracDuraklari,
      aracBul,
      rotalar,
      seciliArac,
      setSeciliArac,
      otomatikDagit,
      hepsiniTemizle,
      durakEkle,
      durakCikar,
      aracTemizle,
      optimizeEt,
      optimizeEdilen,
      rotaBilgileri,
      optimizeHatalari,
      mevcutMetrik,
      etkiSecenekleri,
      planiKaydet,
      kaydediliyor,
      kayitDurumu,
    }),
    [
      loading, error, duraklar, araclar, soforler, filo, ozet, tazele,
      tercihler, tercihDegis, plan, cikanAraclar, elenenAraclar, havuz,
      atananlar.size,
      aracDuraklari, aracBul, rotalar, seciliArac, otomatikDagit,
      hepsiniTemizle, durakEkle, durakCikar, aracTemizle, optimizeEt,
      optimizeEdilen, rotaBilgileri, optimizeHatalari, mevcutMetrik,
      etkiSecenekleri, planiKaydet, kaydediliyor, kayitDurumu,
    ]
  );

  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}

export function useRotaPlaniBaglami(): RotaPlaniDegeri {
  const deger = useContext(Baglam);
  if (!deger) {
    throw new Error(
      "useRotaPlaniBaglami yalnız RotaPlaniProvider içinde kullanılabilir."
    );
  }
  return deger;
}
