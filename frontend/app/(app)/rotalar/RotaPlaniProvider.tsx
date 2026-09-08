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
  type FiloSecimi,
  type Sofor,
} from "@/lib/rota/atama";
import { bolgele, type Bolge } from "@/lib/rota/bolge";
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
  /** Otomatik dağıtımın kullandığı filo. Elle yükleme buna bağlı DEĞİL. */
  cikanAraclar: RotaAraci[];
  havuz: RotaDuragi[];
  atananSayisi: number;
  /** Günün coğrafi bölgeleri — havuz gruplaması ve araç rozetleri için. */
  bolgeler: Bolge[];
  /** Bir durağın bölgesi; havuzda ve araç kartında aynı ad görünsün. */
  durakBolgesi: Map<string, Bolge>;
  /** Bölge kodu → araç kodu. Kullanıcının o günlük sabitlemeleri. */
  sabitlemeler: Record<string, string>;
  /** Bölgeyi bir araca sabitle; `null` sabitlemeyi kaldırır. */
  bolgeSabitle: (bolgeKod: string, aracKod: string | null) => void;
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
   * OTOMATİK DAĞITIMIN kullandığı filo — "kullanılabilir araçlar" değil.
   *
   * `filoSec` yükü karşılayan en küçük filoyu seçiyor ve şoför sayısını
   * aşamıyor (3 şoför → günde en fazla 3 araç). Bu seçim yalnız otomatik
   * dağıtımı bağlar; filodaki HER araca elle yük konabilir (bkz. rotalar
   * sayfasındaki araç kartları). Eskiden seçilmeyen araç soluklaşıp
   * tıklanamaz oluyordu ve sağlam bir araç "devre dışı" gibi görünüyordu.
   */
  const cikanAraclar = filo.secilen;

  /**
   * Bölge birleştirme eşiği — motordaki (`bolgeAta`) kuralın aynısı: çıkan
   * filonun en küçük aracının dörtte biri. İki yerde farklı olursa ekranda
   * görünen bölge ile plana giren bölge ayrışır.
   */
  const birlestirmeEsigi = useMemo(() => {
    const kapasiteler = cikanAraclar.map((a) => a.cuvalKapasite).filter((k) => k > 0);
    return kapasiteler.length > 0 ? Math.min(...kapasiteler) * 0.25 : 0;
  }, [cikanAraclar]);

  /**
   * Bölge sabitlemeleri — OTURUMLUK, localStorage'a yazılmıyor.
   *
   * Sabitleme bölge koduna bağlı; havuz değiştikçe (yeni sipariş, tarih
   * penceresi) bölgeler yeniden kuruluyor ve kodlar kayabiliyor. Kalıcı
   * saklamak, ertesi gün başka bir bölgeyi sabitlemiş gibi görünmeye yol açar.
   */
  const [sabitlemeler, setSabitlemeler] = useState<Record<string, string>>({});

  const bolgeSabitle = useCallback((bolgeKod: string, aracKod: string | null) => {
    setSabitlemeler((o) => {
      const sonraki = { ...o };
      if (aracKod == null) delete sonraki[bolgeKod];
      else sonraki[bolgeKod] = aracKod;
      return sonraki;
    });
  }, []);

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

  /**
   * Günün bölgeleri — havuz gruplaması ve araç kartlarındaki bölge rozetleri
   * aynı kümelemeyi kullansın diye TEK yerde hesaplanıyor. Dağıtım motoru da
   * aynı `bolgele`'yi çağırıyor; ekran ile plan ayrışmasın.
   */
  const bolgeler = useMemo(
    () => bolgele(duraklar, DEPOT, { birlestirmeEsigiCuval: birlestirmeEsigi }),
    [duraklar, birlestirmeEsigi]
  );

  /** musteriKodu → bölge adı. */
  const durakBolgesi = useMemo(() => {
    const m = new Map<string, Bolge>();
    for (const b of bolgeler) {
      for (const d of b.duraklar) m.set(d.musteriKodu, b);
    }
    return m;
  }, [bolgeler]);

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

  /**
   * Haritada ve ölçümde filonun TAMAMI var — otomatik dağıtımın seçtiği filo
   * değil. Elle yüklenen bir araç (ör. otomatikte kullanılmayan Isuzu 3D)
   * haritadan ve kayıttan düşmemeli.
   */
  const rotalar = useMemo<HaritaRotasi[]>(
    () =>
      araclar.map((a, i) => ({
        aracKod: a.kod,
        aracAd: a.ad,
        renk: aracRengi(i),
        duraklar: aracDuraklari(a.kod),
      })),
    [araclar, aracDuraklari]
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
      sabitlemeler,
    });
    const sonraki: Plan = {};
    for (const yuk of sonuc.yukler) {
      sonraki[yuk.arac.kod] = yuk.duraklar.map((d) => d.musteriKodu);
    }
    setPlan(sonraki);
    setRotaBilgileri({});
    setOptimizeHatalari({});
  }, [
    duraklar,
    cikanAraclar,
    araclar,
    tercihler.strateji,
    tercihler.uzakAyir,
    sabitlemeler,
  ]);

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
    const gonderilecek = araclar
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
  }, [araclar, aracDuraklari, rotaBilgileri, filo.atamalar]);

  /**
   * Ekrandaki planın ölçümü. Elle düzenlenmiş plan da dahil — kullanıcı bir
   * durağı taşıdığında doluluk ve güzergâh anında güncellenir.
   */
  const mevcutMetrik = useMemo(
    () =>
      planMetrigi({
        yukler: araclar.map((arac) => {
          const d = aracDuraklari(arac.kod);
          return { arac, duraklar: d, doluluk: dolulukHesapla(arac, d) };
        }),
        yerlesmeyen: havuz.map((durak) => ({
          durak,
          neden: "arac-yok" as const,
        })),
      }),
    [araclar, aracDuraklari, havuz]
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
        etiket: "Bölge",
        metrik: uret("bolge", tercihler.uzakAyir),
        secili: tercihler.strateji === "bolge",
        onSec: () => tercihDegis({ strateji: "bolge" }),
      },
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
      havuz,
      atananSayisi: atananlar.size,
      bolgeler,
      durakBolgesi,
      sabitlemeler,
      bolgeSabitle,
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
      tercihler, tercihDegis, plan, cikanAraclar, havuz,
      atananlar.size, bolgeler, durakBolgesi, sabitlemeler, bolgeSabitle,
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
