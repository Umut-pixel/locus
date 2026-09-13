"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
  GripHorizontalIcon,
  LayersIcon,
  LoaderIcon,
  MapIcon,
  SaveIcon,
  SendIcon,
  TruckIcon,
} from "lucide-react";

import { RotaHaritaAiBubble } from "@/components/agent/RotaHaritaAiBubble";
import {
  DurakDetayKarti,
  type DurakSecimi,
  type EklemeOnizlemesi,
} from "@/components/rota/DurakDetayKarti";
import {
  RotaHaritaEylemSaglayici,
  type HaritaEylemi,
} from "@/components/rota/RotaHaritaEylemBaglami";
import {
  RotaOnerisiSaglayici,
  type RotaOnerisiAdimCozum,
  type RotaOnerisiBaglamDegeri,
  type RotaOnerisiUygulamaSonucu,
} from "@/components/rota/RotaOnerisiBaglami";
import {
  KayitRozeti,
  OptimizeCalisiyorKart,
  OptimizeTamamKart,
  PlanKarnesi,
  type AktifDoluluk,
  type DolulukFarki,
} from "@/components/rota/PlanKarnesi";
import {
  aracRengi,
  RotaHaritasi,
  type HaritaOnizleme,
  type HaritaRotasi,
} from "@/components/rota/RotaHaritasi";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { GsapAutoHeight } from "@/components/ui/gsap-auto-height";
import { GsapCollapse } from "@/components/ui/gsap-collapse";
import { SegmentedSwitch } from "@/components/ui/segmented-switch";
import { toastManager } from "@/components/ui/toast";
import { useKayitliPlanlar, type KayitliDurak } from "@/hooks/useKayitliPlanlar";
import { useRaporTazeligi } from "@/hooks/useMusteriRaporlama";
import { ROTA_REPORT_ID, type RotaAraci, type RotaDuragi } from "@/hooks/useRotaPlani";
import { useSurukleblirKart } from "@/hooks/useSurukleblirKart";
import { googleMapsDirUrl } from "@/lib/depot";
import { formatNumber } from "@/lib/format";
import type { RotaOnerisiBlock } from "@/lib/agent-blocks";
import { dolulukHesapla } from "@/lib/rota/atama";
import type { RotaAgentBaglamGirdisi } from "@/lib/rota/agentBaglami";
import { bolgeRengi } from "@/lib/rota/bolge-renk";
import { bulanikBul } from "@/lib/rota/bulanikEslesme";
import { kriterleriHesapla, type KriterAnahtari } from "@/lib/rota/kriter";
import { cn } from "@/lib/utils";

import { useRotaPlaniBaglami } from "../RotaPlaniProvider";

/**
 * Harita üstü panellerin cam görünümü — `FilterPanel` (overlay) ve
 * `CustomerDetailPanel` ile aynı reçete, Harita sekmesiyle tek dil.
 */
const CAM =
  "border border-border/45 bg-popover/66 text-popover-foreground " +
  "shadow-[0_14px_40px_-16px_rgba(0,0,0,0.55)] backdrop-blur-[24px] backdrop-saturate-150";

function tarihMetni(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Haritanın görünüm filtresi — TEK bir seçim, dört mod. Eskiden `odak`
 * (araç) ve `karneAnahtari` (karne satırı) AYRI state'lerdi ve birbirini
 * "elle" temizliyorlardı (bir yeri seçince diğerini `null`'lamak gerekiyordu)
 * — bu senkronizasyonu unutan bir çağrı, iki filtrenin birden aktif kalıp
 * `gorunenRotalar`'ı beklenmedik şekilde boşaltmasına yol açabiliyordu.
 * Ayrı bir "bölge" modu da bu yüzden buraya, aynı ayrık birliğe eklendi.
 */
type GorunumFiltresi =
  | { tur: "hepsi" }
  | { tur: "arac"; aracKod: string }
  | { tur: "bolge"; bolgeKod: string }
  | { tur: "karne"; anahtar: KriterAnahtari };

/**
 * Kaydedilmiş bir durak — dondurulmuş kayıttan gelir, canlı `RotaDuragi`nin
 * yalnız bir kısmını taşır. Eksik alanlar (sipariş sayısı, brüt tutar, yaş)
 * haritanın hiç kullanmadığı alanlar; nötr varsayılanla dolduruluyor.
 */
function kayitliyiRotaDuraginaCevir(d: KayitliDurak): RotaDuragi {
  return {
    musteriKodu: d.musteriKodu,
    unvan: d.unvan ?? d.musteriKodu,
    lat: d.lat,
    lon: d.lon,
    kg: d.kg,
    cuvalEsdeger: d.cuvalEsdeger,
    olcusuzSatir: 0,
    ilce: d.ilce,
    sehir: d.sehir,
    riskDurumu: d.riskDurumu,
    siparisSayisi: 0,
    brutTutar: 0,
    yasGun: null,
  };
}

/**
 * Tam ekran rota haritası.
 *
 * Kabuk `app/(app)/harita/page.tsx` deseninin aynısı: full-bleed harita +
 * `pointer-events-none` overlay katmanı, panellerde `pointer-events-auto`.
 * Perde `RotaHaritasi` içindeki `revealStageVeil` ile kalkıyor — harita bu
 * rotaya girildiğinde mount edildiği için geçiş her seferinde oynuyor.
 *
 * İki mod var:
 * - CANLI (varsayılan): üzerinde çalışılan taslak, `RotaPlaniProvider`'dan.
 * - KAYITLI (`?gun=` ya da `?planId=` verilince): `Kaydedilenler` sekmesinden
 *   "haritada göster" ile açılan, o günkü DONDURULMUŞ plan — salt okunur,
 *   plan karnesi yok (karne canlı plana göre hesaplanıyor, dondurulmuş bir
 *   günün yanında göstermek yanıltıcı olurdu).
 */
export default function RotaHaritasiSayfasi() {
  const searchParams = useSearchParams();
  const gecmisGun = searchParams.get("gun");
  const gecmisPlanId = searchParams.get("planId");
  const gecmisMod = gecmisGun != null || gecmisPlanId != null;
  /**
   * Bölgeler panelindeki "Araca yükle" eylemi buraya `?odakArac=` ile
   * yönlendiriyor — ilk karede o aracı odaklanmış getirir. Yalnız BAŞLANGIÇ
   * değeri; sonrasında `filtre` normal state, kullanıcı serbestçe değiştirebilir.
   */
  const odakAracParam = searchParams.get("odakArac");

  const canli = useRotaPlaniBaglami();
  const kayitli = useKayitliPlanlar();

  /** Sipariş verisinin yaşı — güvenilirlik kriterine giriyor (yalnız canlı modda). */
  const { saatOnce } = useRaporTazeligi(ROTA_REPORT_ID);

  const kriterler = useMemo(
    () =>
      gecmisMod
        ? []
        : kriterleriHesapla({
            metrik: canli.mevcutMetrik,
            yukler: canli.mevcutSonuc.yukler,
            filo: canli.filo,
            yerlesmeyen: canli.mevcutSonuc.yerlesmeyen,
            rotaBilgileri: canli.rotaBilgileri,
            veriYasiSaat: saatOnce,
          }),
    [
      gecmisMod,
      canli.mevcutMetrik,
      canli.mevcutSonuc,
      canli.filo,
      canli.rotaBilgileri,
      saatOnce,
    ]
  );

  /** Görünüm filtresi — bkz. `GorunumFiltresi` tanımı. */
  const [filtre, setFiltre] = useState<GorunumFiltresi>(() =>
    odakAracParam ? { tur: "arac", aracKod: odakAracParam } : { tur: "hepsi" }
  );
  const [havuzGoster, setHavuzGoster] = useState(true);
  /** Sol üst karttaki liste sekmesi — araç/bölge filtresi + kayıtlı plan geçmişi aynı kartı paylaşıyor. */
  const [liste, setListe] = useState<"araclar" | "bolgeler" | "kaydedilenler">("araclar");
  /** Bölgeler ya da Kaydedilenler'den bir yere tıklanınca haritanın kayacağı hedef. */
  const [ucusHedefi, setUcusHedefi] = useState<{ noktalar: [number, number][]; zaman: number } | null>(
    null
  );

  /** Haritada tıklanan durak — bilgi kartı bunun üzerine kurulur. */
  const [seciliDurak, setSeciliDurak] = useState<DurakSecimi | null>(null);
  /**
   * `DurakDetayKarti`'nde önizlenen (henüz onaylanmamış) araç — haritada o
   * aracın soluk önizleme çizgisini çizebilmek için (bkz. `onizlemeHatti`).
   */
  const [onizlemeAracKod, setOnizlemeAracKod] = useState<string | null>(null);
  /**
   * Onaylanan önizlemenin DONMUŞ kopyası — `durakRotayaEkle` çağrılır
   * çağrılmaz durak zaten "mevcut" sayıldığı için `onizlemeHatti` anında
   * `null`a düşer, ama `RotaHaritasi`'deki gerçek rotanın canlanma animasyonu
   * (~1,1sn) sürerken soluk çizgi hâlâ görünür kalsın istiyoruz — opak
   * gerçek renk çizgisi onun ÜSTÜNDEN geçerek çizilsin diye (bkz.
   * `onaylaOnizlemeDondur`). Süre dolunca kendiliğinden temizlenir.
   */
  const [dondurulmusOnizleme, setDondurulmusOnizleme] = useState<HaritaOnizleme | null>(null);
  const dondurmaZamanlayiciRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (dondurmaZamanlayiciRef.current) clearTimeout(dondurmaZamanlayiciRef.current);
    };
  }, []);
  const [cikariliyor, setCikariliyor] = useState(false);
  const [ekleniyorAracKod, setEkleniyorAracKod] = useState<string | null>(null);
  /** Son ekle/çıkar eyleminin öncesi/sonrası — karnedeki geçici rozet bunu okur. */
  const [dolulukFarki, setDolulukFarki] = useState<DolulukFarki | null>(null);
  /**
   * Optimize edilmekte olan araç sayısı 0'a düşünce (`OptimizeCalisiyorKart`
   * kapanınca) kısa bir "Rota güncellendi" onayı göstermek için — yalnız
   * GEÇİŞİ (>0 → 0) yakalıyoruz, aksi halde ilk render'da (hiç optimize
   * çalışmamışken) da tetiklenirdi.
   */
  const [optimizeTamamZamani, setOptimizeTamamZamani] = useState<number | null>(null);
  const oncekiOptimizeSayisiRef = useRef(0);
  useEffect(() => {
    if (oncekiOptimizeSayisiRef.current > 0 && canli.optimizeEdilenler.length === 0) {
      setOptimizeTamamZamani(Date.now());
    }
    oncekiOptimizeSayisiRef.current = canli.optimizeEdilenler.length;
  }, [canli.optimizeEdilenler.length]);
  /** "Haritada göster" — Kaydet'in yanındaki düğme, araç başına Maps/gönder listesini açar. */
  const [haritaLinkleriAcik, setHaritaLinkleriAcik] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * Sol üst (Planlamaya dön + araç/bölge listesi) kart sürüklenebilir. Sağ
   * alttaki plan karnesi BİLEREK değil — karar kartı, yeri her seferinde
   * aynı olmalı, yanlışlıkla sürüklenip kaybolmamalı.
   */
  const solKart = useSurukleblirKart(containerRef);

  /**
   * AI balonu (sağ üst, `RotaHaritaAiBubble`) açılınca panele büyüyor ve
   * sabit bir `100dvh` oranıyla yükseklik alıyordu — plan karnesi (sağ alt)
   * içerik miktarına göre BÜYÜYEBİLEN, bağımsız bir kart olduğu için ikisi
   * aralarında boşluk bırakmadan çakışabiliyordu. Plan karnesi bloğunun üst
   * kenarını ölçüp balona veriyoruz ki panel kendi yüksekliğini ona göre sınırlasın.
   */
  const sagAltRef = useRef<HTMLDivElement>(null);
  const [sagAltUstY, setSagAltUstY] = useState<number | null>(null);
  useEffect(() => {
    const el = sagAltRef.current;
    if (!el) return;
    const guncelle = () => setSagAltUstY(el.getBoundingClientRect().top);
    guncelle();
    const ro = new ResizeObserver(guncelle);
    ro.observe(el);
    window.addEventListener("resize", guncelle);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", guncelle);
    };
  }, []);

  /** `Doluluk.baglayiciKisit`e göre bağlayıcı yüzde — modül genelinde tekrarlanan hesap. */
  const hesaplaYuzde = useCallback((arac: RotaAraci, liste: RotaDuragi[]): number => {
    const d = dolulukHesapla(arac, liste);
    return d.baglayiciKisit === "agirlik" ? (d.kgYuzde ?? d.cuvalYuzde) : d.cuvalYuzde;
  }, []);

  /**
   * Rotadan çıkar — KAYITLI moddaki dondurulmuş plana dokunmaz (o zaten
   * `canli.durakCikar` yerine kendi salt-okunur verisiyle gösteriliyor;
   * `gecmisMod` kontrolü burada yalnız düğmenin yanlışlıkla bugünün CANLI
   * taslağını değiştirmesini engelliyor).
   */
  const durakRotadanCikar = useCallback(async () => {
    if (gecmisMod || !seciliDurak?.rota || cikariliyor) return;
    const { durak, rota } = seciliDurak;
    setCikariliyor(true);
    try {
      const arac = canli.aracBul(rota.aracKod);
      const eskiListe = canli.aracDuraklari(rota.aracKod);
      const eskiYuzde = arac ? hesaplaYuzde(arac, eskiListe) : null;

      canli.durakCikar(durak.musteriKodu);

      if (arac && eskiYuzde != null) {
        const yeniListe = eskiListe.filter((d) => d.musteriKodu !== durak.musteriKodu);
        setDolulukFarki({
          aracKod: rota.aracKod,
          eskiYuzde,
          yeniYuzde: hesaplaYuzde(arac, yeniListe),
          zaman: Date.now(),
        });
      }
      toastManager.add({
        type: "success",
        title: `${durak.unvan} rotadan çıkarıldı`,
        description: `${rota.aracAd} — durak havuza geri döndü.`,
      });
    } finally {
      setCikariliyor(false);
      setSeciliDurak(null);
    }
  }, [gecmisMod, seciliDurak, cikariliyor, canli, hesaplaYuzde]);

  /**
   * Bir araca tıklanınca ÖNCE bu çağrılır — hiçbir şeyi değiştirmez, yalnız
   * "eklenirse ne olur" sorusunu cevaplar. `BolgeOzeti`nin toplu bölge
   * yüklemesindeki önizleme adımıyla aynı desen, tek durak için.
   */
  const durakEklemeOnizle = useCallback(
    (aracKod: string): EklemeOnizlemesi | null => {
      if (!seciliDurak || seciliDurak.rota != null) return null;
      const arac = canli.aracBul(aracKod);
      if (!arac) return null;
      const mevcutListe = canli.aracDuraklari(aracKod);
      if (mevcutListe.some((d) => d.musteriKodu === seciliDurak.durak.musteriKodu)) return null;
      const yeniListe = [...mevcutListe, seciliDurak.durak];
      const doluluk = dolulukHesapla(arac, yeniListe);
      const yuzde =
        doluluk.baglayiciKisit === "agirlik" ? (doluluk.kgYuzde ?? doluluk.cuvalYuzde) : doluluk.cuvalYuzde;
      return {
        aracAd: arac.ad,
        toplamDurak: yeniListe.length,
        kg: doluluk.kg,
        yuzde,
        asim: doluluk.asim,
      };
    },
    [seciliDurak, canli]
  );

  /**
   * Haritadaki soluk önizleme çizgisi — `onizlemeAracKod` set edildiğinde
   * (bkz. `DurakDetayKarti` → `onOnizlemeAracDegisti`) o aracın MEVCUT
   * durakları + önizlenen durak, bu sırayla. Araç henüz haritada çizili
   * değilse (bugün hiç durağı yoksa) `canli.rotalar`'da renk bulunamaz —
   * bir sonraki boş renk sırasını kullanır (`redraw`'ın atadığı sırayla aynı
   * mantık: dizideki konum → `aracRengi`).
   */
  const onizlemeHatti = useMemo<HaritaOnizleme | null>(() => {
    if (gecmisMod || !seciliDurak || seciliDurak.rota != null || !onizlemeAracKod) return null;
    const arac = canli.aracBul(onizlemeAracKod);
    if (!arac) return null;
    const mevcutListe = canli.aracDuraklari(onizlemeAracKod);
    if (mevcutListe.some((d) => d.musteriKodu === seciliDurak.durak.musteriKodu)) return null;
    const mevcutRota = canli.rotalar.find((r) => r.aracKod === onizlemeAracKod);
    const renk = mevcutRota?.renk ?? aracRengi(canli.rotalar.length);
    return {
      aracKod: onizlemeAracKod,
      renk,
      duraklar: [...mevcutListe, seciliDurak.durak],
    };
    // `canli`nin BÜTÜNÜ yerine gerçekten kullanılan parçalar listelendi:
    // `canli` ~1,5sn'de bir otomatik kayıt yüzünden yeni referans alıyor
    // (bkz. RotaPlaniProvider deger useMemo'su) — bütünü bağımlılığa koysak
    // harita önizleme çizgisini boşta beklerken bile birkaç saniyede bir
    // gereksiz yeniden canlandırırdı (bkz. `RotaHaritasi`'deki `revealRouteLine`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gecmisMod, seciliDurak, onizlemeAracKod, canli.aracBul, canli.aracDuraklari, canli.rotalar]);

  /**
   * Havuzdaki bir durağı bir araca ekle — `BolgeOzeti`'nin toplu yükleme
   * akışındaki AYNI stale-closure önlemi: `optimizeEt`'e `aracDuraklari`'nın
   * henüz güncellenmemiş (React state batching) hâli yerine elimizdeki taze
   * listeyi (`duraklarOverride`) veriyoruz.
   */
  const durakRotayaEkle = useCallback(
    async (aracKod: string) => {
      if (gecmisMod || !seciliDurak || seciliDurak.rota != null || ekleniyorAracKod != null) {
        return;
      }
      const { durak } = seciliDurak;
      const arac = canli.aracBul(aracKod);
      if (!arac) return;
      setEkleniyorAracKod(aracKod);
      try {
        const eskiListe = canli.aracDuraklari(aracKod);
        const eskiYuzde = hesaplaYuzde(arac, eskiListe);

        // Önizleme şeklini donduruyoruz — bkz. `dondurulmusOnizleme` yorumu.
        if (onizlemeHatti && onizlemeHatti.aracKod === aracKod) {
          setDondurulmusOnizleme(onizlemeHatti);
          if (dondurmaZamanlayiciRef.current) clearTimeout(dondurmaZamanlayiciRef.current);
          dondurmaZamanlayiciRef.current = setTimeout(() => setDondurulmusOnizleme(null), 1400);
        }

        canli.durakEkle(durak.musteriKodu, aracKod);
        const yeniListe = [...eskiListe, durak];

        setDolulukFarki({
          aracKod,
          eskiYuzde,
          yeniYuzde: hesaplaYuzde(arac, yeniListe),
          zaman: Date.now(),
        });
        toastManager.add({
          type: "success",
          title: `${durak.unvan} → ${arac.ad}`,
          description: "Rotaya eklendi, güzergah yeniden hesaplanıyor…",
        });
        const koordinatli = yeniListe.filter((d) => d.lat != null && d.lon != null);
        if (koordinatli.length >= 2) {
          await canli.optimizeEt(aracKod, yeniListe);
        }
      } finally {
        setEkleniyorAracKod(null);
        setSeciliDurak(null);
      }
    },
    [gecmisMod, seciliDurak, ekleniyorAracKod, canli, hesaplaYuzde, onizlemeHatti]
  );

  /** Kayıtlı günün/planın hangi tarihe ait olduğu — başlıkta gösterilecek. */
  const gecmisTarih = useMemo(() => {
    if (!gecmisMod) return null;
    if (gecmisGun) return gecmisGun;
    const plan = kayitli.gunler
      .flatMap((g) => g.planlar)
      .find((p) => p.id === gecmisPlanId);
    return plan?.planTarihi ?? null;
  }, [gecmisMod, gecmisGun, gecmisPlanId, kayitli.gunler]);

  /** Kayıtlı moddaki rotalar — o günün ya da o tek planın araçları. */
  const gecmisRotalar = useMemo<HaritaRotasi[]>(() => {
    if (!gecmisMod) return [];
    const planlar = gecmisPlanId
      ? kayitli.gunler
          .flatMap((g) => g.planlar)
          .filter((p) => p.id === gecmisPlanId)
      : (kayitli.gunler.find((g) => g.planTarihi === gecmisGun)?.planlar ?? []);

    return planlar.map((p, i) => ({
      aracKod: p.aracKod,
      aracAd: p.aracAd,
      renk: aracRengi(i),
      duraklar: p.duraklar
        .slice()
        .sort((a, b) => a.sira - b.sira)
        .map(kayitliyiRotaDuraginaCevir),
    }));
  }, [gecmisMod, gecmisGun, gecmisPlanId, kayitli.gunler]);

  const rotalar = gecmisMod ? gecmisRotalar : canli.rotalar;
  const havuz = gecmisMod ? ([] as RotaDuragi[]) : canli.havuz;
  const loading = gecmisMod ? kayitli.loading : canli.loading;

  const yuklu = useMemo(
    () => rotalar.filter((r) => r.duraklar.length > 0),
    [rotalar]
  );

  /**
   * Filtrenin GEÇERLİLİĞİ — hedefi plandan düşmüş bir filtre kendiliğinden
   * "hepsi"ye döner: araç plandan çıkarsa, karne satırı artık kimseyi
   * suçlamıyorsa, ya da bölge/karne modundayken kayıtlı plana geçilirse
   * (ikisi de yalnız CANLI planın o anki hesabına ait — dondurulmuş bir
   * günün yanında ne bölge kümesi ne kriter anlamlı, `araç` filtresi hariç:
   * o kayıtlı modda da geçerli, belirli bir aracın geçmiş rotasına bakmak
   * meşru bir ihtiyaç).
   */
  const gecerliFiltre = useMemo<GorunumFiltresi>(() => {
    if (filtre.tur === "arac") {
      return yuklu.some((r) => r.aracKod === filtre.aracKod) ? filtre : { tur: "hepsi" };
    }
    // `filtre` zaten "hepsi" ise AYNI referansı döndür — aksi halde her
    // render'da yeni bir nesne üretilir, alttaki self-heal effect'i bunu
    // "değişti" sanıp `setFiltre`'i sonsuz döngüye sokar (gecmisMod true
    // olduğu her karede yeniden tetiklenir).
    if (gecmisMod) return filtre.tur === "hepsi" ? filtre : { tur: "hepsi" };
    if (filtre.tur === "bolge") {
      return canli.bolgeler.some((b) => b.kod === filtre.bolgeKod) ? filtre : { tur: "hepsi" };
    }
    if (filtre.tur === "karne") {
      const k = kriterler.find((x) => x.anahtar === filtre.anahtar);
      const vurgulanabilir = k != null && (k.suclular.araclar.length > 0 || k.suclular.duraklar.length > 0);
      return vurgulanabilir ? filtre : { tur: "hepsi" };
    }
    return filtre;
  }, [filtre, gecmisMod, yuklu, canli.bolgeler, kriterler]);

  /**
   * "Self-heal" yalnız GÖRÜNTÜYE yansıyorsa yetmiyor: `gecerliFiltre` her
   * render'da hesaplanan TÜRETİLMİŞ bir değer, ama ham `filtre` state'i
   * kendiliğinden değişmiyor. Ör. Isuzu 3D'ye filtrelenmişken araç boşaltılırsa
   * görüntü "hepsi"ye döner (yukarıdaki memo) ama `filtre` hâlâ
   * `{tur:"arac",aracKod:"isuzu-3d"}` — araca yeniden yük konduğu AN, kullanıcı
   * hiçbir şeye tıklamadan filtre SESSİZCE kendiliğinden geri geliyordu (görülen
   * hata: "filtreleme bozuk", duraklar/araçlar sebepsiz görünüp kayboluyordu).
   * İyileşme burada GERÇEKTEN yazılıyor ki ham state bayat kalmasın.
   */
  useEffect(() => {
    if (gecerliFiltre !== filtre) setFiltre(gecerliFiltre);
  }, [gecerliFiltre, filtre]);

  const gecerliOdak = gecerliFiltre.tur === "arac" ? gecerliFiltre.aracKod : null;

  /**
   * Odaklanılan aracın tam kaydı — yalnız CANLI modda: `canli.aracBul` bugünün
   * taslağını okur, kayıtlı/dondurulmuş bir günün yanında anlamsız olurdu.
   * "Rotaya ekle"nin tek-hedef modu (`DurakDetayKarti.aktifArac`) VE plan
   * karnesindeki doluluk satırı aynı kaynaktan besleniyor.
   */
  const odakliArac = useMemo<RotaAraci | null>(
    () => (!gecmisMod && gecerliOdak != null ? canli.aracBul(gecerliOdak) : null),
    [gecmisMod, gecerliOdak, canli]
  );

  const aktifDoluluk = useMemo<AktifDoluluk | null>(() => {
    if (!odakliArac) return null;
    const liste = canli.aracDuraklari(odakliArac.kod);
    const yuzde = hesaplaYuzde(odakliArac, liste);
    const doluluk = liste.length > 0 ? dolulukHesapla(odakliArac, liste) : null;
    return {
      aracKod: odakliArac.kod,
      aracAd: odakliArac.ad,
      yuzde,
      kg: doluluk?.kg ?? 0,
      kapasiteKg: odakliArac.maxKg,
      asim: doluluk?.asim ?? false,
    };
  }, [odakliArac, canli, hesaplaYuzde]);

  /** Odaklanılan aracın sıralı durak listesi — AI bağlamı için (bkz. `agentBaglami.ts`). */
  const odakliAracBaglam = useMemo<RotaAgentBaglamGirdisi["odakliArac"]>(() => {
    if (!odakliArac) return null;
    return {
      ad: odakliArac.ad,
      duraklar: canli.aracDuraklari(odakliArac.kod).map((d) => ({
        unvan: d.unvan,
        ilce: d.ilce,
      })),
    };
  }, [odakliArac, canli]);

  /**
   * Filtre değişince görünen küme değişir (`gorunenRotalar`/`gorunenHavuz`)
   * — açık durak kartı artık haritada hiç çizilmeyen bir marker'a ait
   * kalabilir. Aynı şekilde canlı/kayıtlı geçişinde de kapanır.
   */
  useEffect(() => {
    setSeciliDurak(null);
  }, [gecerliFiltre, gecmisMod]);

  /**
   * Karne satırı seçilince harita o satırın suçlularını gösterir: sayıyı
   * okuyup aracı elle aramak yerine sorun doğrudan görünür.
   */
  const secilenKriter =
    gecerliFiltre.tur === "karne"
      ? (kriterler.find((k) => k.anahtar === gecerliFiltre.anahtar) ?? null)
      : null;

  /** Geçerli seçimin insan-okur açıklaması — AI bağlamı için (bkz. `agentBaglami.ts`). */
  const secimAciklamasi = useMemo<string | null>(() => {
    if (gecerliFiltre.tur === "arac") {
      const rota = yuklu.find((r) => r.aracKod === gecerliFiltre.aracKod);
      return rota ? `${rota.aracAd} aracı` : null;
    }
    if (gecerliFiltre.tur === "bolge") {
      const bolge = canli.bolgeler.find((b) => b.kod === gecerliFiltre.bolgeKod);
      return bolge ? `${bolge.ad} bölgesi` : null;
    }
    if (gecerliFiltre.tur === "karne") {
      return secilenKriter ? `${secilenKriter.ad} kriteri` : null;
    }
    return null;
  }, [gecerliFiltre, yuklu, canli.bolgeler, secilenKriter]);

  /**
   * Eskiden tek araca odaklanınca havuz tamamen gizleniyordu ("dikkat
   * dağıtır" gerekçesiyle). Artık gizlenmiyor: havuzdaki bir noktaya
   * tıklayıp "Rotaya ekle" ile doğrudan odaklanılan araca eklemek bu
   * görünürlüğe bağlı — `DurakDetayKarti`nin tek-hedef modu (bkz. `aktifArac`
   * aşağıda).
   */
  const { gorunenRotalar, gorunenHavuz } = useMemo(() => {
    if (gecerliFiltre.tur === "arac") {
      return {
        gorunenRotalar: yuklu.filter((r) => r.aracKod === gecerliFiltre.aracKod),
        gorunenHavuz: havuzGoster ? havuz : [],
      };
    }
    if (gecerliFiltre.tur === "bolge") {
      const buBolgede = (kod: string) => canli.durakBolgesi.get(kod)?.kod === gecerliFiltre.bolgeKod;
      return {
        // Bölgeye değen HER aracın TAM rotası gösterilir, yalnız o bölgedeki
        // durakları değil — şoför sahada zaten tüm rotayı görecek.
        gorunenRotalar: yuklu.filter((r) => r.duraklar.some((d) => buBolgede(d.musteriKodu))),
        gorunenHavuz: havuzGoster ? havuz.filter((d) => buBolgede(d.musteriKodu)) : [],
      };
    }
    if (gecerliFiltre.tur === "karne" && secilenKriter) {
      const { araclar, duraklar } = secilenKriter.suclular;
      return {
        gorunenRotalar: araclar.length > 0 ? yuklu.filter((r) => araclar.includes(r.aracKod)) : yuklu,
        gorunenHavuz:
          duraklar.length > 0
            ? havuz.filter((d) => duraklar.includes(d.musteriKodu))
            : havuzGoster
              ? havuz
              : [],
      };
    }
    // "hepsi" — varsayılan: bekleyen tüm siparişler aktif olarak görünür.
    return { gorunenRotalar: yuklu, gorunenHavuz: havuzGoster ? havuz : [] };
  }, [gecerliFiltre, secilenKriter, yuklu, havuz, havuzGoster, canli.durakBolgesi]);

  const araciFiltrele = (aracKod: string) =>
    setFiltre((f) => (f.tur === "arac" && f.aracKod === aracKod ? { tur: "hepsi" } : { tur: "arac", aracKod }));

  /**
   * Bölgeye tıklayınca filtrelemenin YANINDA harita da o bölgeye kayar —
   * yalnız hangi bölgede olduğunu değil, NEREDE olduğunu da göstersin.
   * Seçim kaldırılırken (aynı bölgeye ikinci tıklama) kaydırma yok, yalnız
   * yeni bir bölge SEÇİLİRKEN.
   */
  const bolgeyiFiltrele = (bolgeKod: string) => {
    const zatenSecili = filtre.tur === "bolge" && filtre.bolgeKod === bolgeKod;
    setFiltre(zatenSecili ? { tur: "hepsi" } : { tur: "bolge", bolgeKod });
    if (zatenSecili) return;
    const bolge = canli.bolgeler.find((b) => b.kod === bolgeKod);
    const noktalar = (bolge?.duraklar ?? [])
      .filter((d) => d.lat != null && d.lon != null)
      .map((d): [number, number] => [d.lon!, d.lat!]);
    if (noktalar.length > 0) setUcusHedefi({ noktalar, zaman: Date.now() });
  };

  /**
   * AI komut balonundan gelen eylemleri uygular. `bolgeyiFiltrele`/
   * `araciFiltrele`'nin aksine bilerek TOGGLE değil, her zaman SET —
   * streaming sırasında aynı blok iki kez işlenirse ya da kullanıcı benzer
   * bir isteği iki turda tekrarlarsa filtrenin kendi kendini sessizce
   * kapatmaması için. Eşleşme bulunamazsa sessizce yok sayılır.
   */
  const haritaEylemiUygula = useCallback(
    (eylem: HaritaEylemi) => {
      switch (eylem.eylem) {
        case "bolgeyi_filtrele": {
          if (!eylem.sorgu) return;
          const bolge = bulanikBul(canli.bolgeler, eylem.sorgu, (b) => b.ad);
          if (!bolge) return;
          setFiltre({ tur: "bolge", bolgeKod: bolge.kod });
          const noktalar = bolge.duraklar
            .filter((d) => d.lat != null && d.lon != null)
            .map((d): [number, number] => [d.lon!, d.lat!]);
          if (noktalar.length > 0) setUcusHedefi({ noktalar, zaman: Date.now() });
          break;
        }
        case "araci_filtrele": {
          if (!eylem.sorgu) return;
          // Yalnız o an yüklü/görünen araçlar arasında ara — havuzda bekleyen,
          // hiçbir yere atanmamış bir "araç" olmaz.
          const rota = bulanikBul(yuklu, eylem.sorgu, (r) => r.aracAd);
          if (!rota) return;
          setFiltre({ tur: "arac", aracKod: rota.aracKod });
          break;
        }
        case "sekmeyi_degistir": {
          if (!eylem.sekme) return;
          setListe(eylem.sekme);
          break;
        }
        case "karneyi_vurgula": {
          if (!eylem.anahtar) return;
          setFiltre({ tur: "karne", anahtar: eylem.anahtar as KriterAnahtari });
          break;
        }
        case "filtreyi_temizle":
          setFiltre({ tur: "hepsi" });
          break;
      }
    },
    [canli.bolgeler, yuklu]
  );

  /**
   * AI önerisindeki isimleri ekrandaki gerçek kayıtlara çözer — HİÇBİR ŞEYE
   * dokunmaz, yalnız `RotaOnerisiKarti`nin önizlemesi için. Kayıtlı (geçmiş)
   * moddayken hiçbir adım çözülmez: o mod salt-okunur, canlı taslakla
   * bağlantısı yok (bkz. `agentBaglami.ts`'in aynı kuralı).
   */
  const rotaOnerisiCozumle = useCallback(
    (block: RotaOnerisiBlock): RotaOnerisiAdimCozum[] => {
      if (gecmisMod) {
        return block.adimlar.map((adim) => ({
          ok: false,
          eylem: adim.eylem,
          hata: "Kayıtlı bir plan görüntüleniyor — değişiklik yalnız canlı taslakta yapılabilir.",
        }));
      }
      return block.adimlar.map((adim): RotaOnerisiAdimCozum => {
        if (adim.eylem === "durak_tasi") {
          const durak = bulanikBul(canli.duraklar, adim.durak ?? "", (d) => d.unvan);
          if (!durak) {
            return { ok: false, eylem: adim.eylem, hata: `"${adim.durak}" adında bir durak bulunamadı.` };
          }
          const hedefArac = bulanikBul(canli.araclar, adim.hedefArac ?? "", (a) => a.ad);
          if (!hedefArac) {
            return { ok: false, eylem: adim.eylem, hata: `"${adim.hedefArac}" adında bir araç bulunamadı.` };
          }
          const oncekiListe = canli.aracDuraklari(hedefArac.kod);
          const zatenVar = oncekiListe.some((d) => d.musteriKodu === durak.musteriKodu);
          const sonrakiListe = zatenVar ? oncekiListe : [...oncekiListe, durak];
          return {
            ok: true,
            eylem: "durak_tasi",
            musteriKodu: durak.musteriKodu,
            durakEtiket: durak.unvan,
            hedefAracKod: hedefArac.kod,
            hedefAracEtiket: hedefArac.ad,
            pozisyon: adim.pozisyon,
            dolulukOncesi: hesaplaYuzde(hedefArac, oncekiListe),
            dolulukSonrasi: hesaplaYuzde(hedefArac, sonrakiListe),
          };
        }
        if (adim.eylem === "durak_havuza_al") {
          const durak = bulanikBul(canli.duraklar, adim.durak ?? "", (d) => d.unvan);
          if (!durak) {
            return { ok: false, eylem: adim.eylem, hata: `"${adim.durak}" adında bir durak bulunamadı.` };
          }
          return { ok: true, eylem: "durak_havuza_al", musteriKodu: durak.musteriKodu, durakEtiket: durak.unvan };
        }
        // araci_optimize_et
        const hedefArac = bulanikBul(canli.araclar, adim.hedefArac ?? "", (a) => a.ad);
        if (!hedefArac) {
          return { ok: false, eylem: adim.eylem, hata: `"${adim.hedefArac}" adında bir araç bulunamadı.` };
        }
        return { ok: true, eylem: "araci_optimize_et", hedefAracKod: hedefArac.kod, hedefAracEtiket: hedefArac.ad };
      });
    },
    [gecmisMod, canli, hesaplaYuzde]
  );

  /**
   * Çözülmüş öneriyi canlı taslağa uygular. `canli.durakTasi`/`durakCikar`/
   * `optimizeEt` dışında HİÇBİR ŞEY çağırmaz — özellikle `canli.planiKaydet()`
   * (nihai, yıkıcı `/api/rota/plan` kaydı) asla burada tetiklenmez. Uygulanan
   * değişiklik mevcut 1,5sn debounce'lu autosave üzerinden kendiliğinden
   * `rota_taslaklari`ya (kaynak=harita-canli) yazılır — yeni persistence
   * kodu yok.
   */
  const rotaOnerisiUygula = useCallback(
    (cozumler: RotaOnerisiAdimCozum[]): RotaOnerisiUygulamaSonucu => {
      if (gecmisMod) {
        return { ok: false, mesaj: "Kayıtlı bir plan görüntülenirken öneri uygulanamaz." };
      }
      if (cozumler.length === 0 || cozumler.some((c) => !c.ok)) {
        return { ok: false, mesaj: "Bazı adımlar çözülemedi, hiçbir şey uygulanmadı." };
      }
      const oncekiPlan = canli.plan;
      for (const c of cozumler) {
        if (!c.ok) continue;
        if (c.eylem === "durak_tasi") canli.durakTasi(c.musteriKodu, c.hedefAracKod, c.pozisyon);
        else if (c.eylem === "durak_havuza_al") canli.durakCikar(c.musteriKodu);
        else void canli.optimizeEt(c.hedefAracKod);
      }
      return {
        ok: true,
        mesaj: "Uygulandı.",
        geriAl: () => canli.planiGeriYukle(oncekiPlan),
      };
    },
    [gecmisMod, canli]
  );

  const rotaOnerisiBaglamDegeri = useMemo<RotaOnerisiBaglamDegeri>(
    () => ({ cozumle: rotaOnerisiCozumle, uygula: rotaOnerisiUygula }),
    [rotaOnerisiCozumle, rotaOnerisiUygula]
  );

  /**
   * "Haritada göster" düğmesinin listesindeki her satır bunu çağırır —
   * cihaz destekliyorsa (çoğu mobil, bazı masaüstü tarayıcı) OS'in kendi
   * paylaşım sayfasını açar; desteklemiyorsa bağlantı panoya kopyalanır ki
   * WhatsApp/SMS'e elle yapıştırılabilsin. İkisi de "gönder" ihtiyacını
   * karşılıyor, Google Maps'te açmak (ayrı bir `<a target="_blank">`) zaten
   * kendi başına çalışıyor, bu yalnız o linki BAŞKASINA iletmek için.
   */
  const baglantiPaylas = async (url: string, baslik: string) => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: baslik, url });
        return;
      } catch {
        // Kullanıcı paylaşım sayfasını iptal etti — panoya kopyalamaya düş.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toastManager.add({
        type: "success",
        title: "Bağlantı kopyalandı",
        description: baslik,
      });
    } catch {
      toastManager.add({ type: "error", title: "Bağlantı kopyalanamadı" });
    }
  };

  /**
   * Kaydedilenler'den bir gün/plan seçilince (`?gun=`/`?planId=` navigasyonu)
   * harita o rotalara kaysın — `RotaHaritasi` artık mount'ta bir kez fit
   * ediyor, mod değişince kendiliğinden değil (bkz. RotaHaritasi üstteki not).
   */
  useEffect(() => {
    if (!gecmisMod) return;
    const noktalar: [number, number][] = [];
    for (const r of gecmisRotalar) {
      for (const d of r.duraklar) {
        if (d.lat != null && d.lon != null) noktalar.push([d.lon, d.lat]);
      }
    }
    if (noktalar.length > 0) setUcusHedefi({ noktalar, zaman: Date.now() });
    // Yalnız gerçek navigasyonda (gun/planId değişince) tetiklensin —
    // `gecmisRotalar` arka planda tazelenince değil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gecmisGun, gecmisPlanId]);

  const toplamDurak = gorunenRotalar.reduce((t, r) => t + r.duraklar.length, 0);

  /** "Bölgeler" sekmesi yalnız canlı modda ve bölge varsa anlamlı. */
  const bolgelerVar = !gecmisMod && canli.bolgeler.length > 0;
  /** Sekme geçersiz kalırsa (ör. bölgeler kayboldu) kendiliğinden "Araçlar"a döner. */
  const gecerliListe = liste === "bolgeler" && !bolgelerVar ? "araclar" : liste;

  return (
    <RotaHaritaEylemSaglayici value={haritaEylemiUygula}>
    <RotaOnerisiSaglayici value={rotaOnerisiBaglamDegeri}>
    <div ref={containerRef} className="relative isolate min-h-0 min-w-0 flex-1 overflow-hidden">
      <RotaHaritasi
        rotalar={gorunenRotalar}
        havuz={gorunenHavuz}
        onDurakSec={setSeciliDurak}
        onBosaTikla={() => setSeciliDurak(null)}
        ucusHedefi={ucusHedefi}
        onizleme={onizlemeHatti ?? dondurulmusOnizleme}
      />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between gap-2 p-2 sm:p-3 md:p-4">
        {/* Sol üst: geri + araç listesi — ikisi ayrı kart, DurakDetayKarti'yle aynı "her panel kendi camı" dili */}
        <div
          ref={solKart.cardRef}
          style={solKart.style}
          className="flex min-h-0 flex-col items-start gap-2"
        >
          <div
            {...solKart.tutamacProps}
            className="pointer-events-auto flex h-4 w-full items-center justify-center text-muted-foreground/40"
          >
            <GripHorizontalIcon className="size-3.5" aria-hidden />
          </div>
          <div
            className={cn(
              "pointer-events-auto flex shrink-0 items-center gap-2 rounded-2xl px-2.5 py-2",
              CAM
            )}
          >
            <AppSidebarMobileTrigger embedded />
            <Link
              href="/rotalar"
              className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeftIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="truncate">Planlamaya dön</span>
            </Link>
          </div>

          <div
            className={cn(
              "pointer-events-auto flex min-w-0 max-w-[20rem] flex-col overflow-hidden rounded-2xl",
              CAM
            )}
          >
            {/*
              Kayıtlı mod rozeti — bu haritanın CANLI taslak olmadığı, geçmişe
              dondurulmuş bir gün olduğu açık olmalı. Aksi halde "Kaydedilenler"
              sekmesinden gelen biri bugünün planını görüyor sanabilir.
            */}
            {gecmisMod ? (
              <div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 bg-accent/30 px-2.5 py-1.5">
                <ArchiveIcon className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                  Kaydedilmiş plan
                  {gecmisTarih ? ` — ${tarihMetni(gecmisTarih)}` : ""}
                </span>
                <Link
                  href="/rotalar/harita"
                  className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  title="Bugünkü canlı taslağa dön"
                >
                  Canlıya dön
                </Link>
              </div>
            ) : null}

            <div className="shrink-0 border-b border-border/40 px-2.5 py-1.5">
              <SegmentedSwitch
                value={gecerliListe}
                onChange={setListe}
                ariaLabel="Liste seçimi"
                options={[
                  { value: "araclar", label: "Araçlar" },
                  ...(bolgelerVar ? [{ value: "bolgeler" as const, label: "Bölgeler" }] : []),
                  { value: "kaydedilenler", label: "Kayıtlı" },
                ]}
              />
            </div>

            <div className="max-h-[60vh] min-h-0 overflow-y-auto">
              <GsapAutoHeight>
                {gecerliListe === "bolgeler" ? (
                  <ul className="divide-y divide-border/30">
                    {canli.bolgeler.map((b) => {
                      const secili = gecerliFiltre.tur === "bolge" && gecerliFiltre.bolgeKod === b.kod;
                      const solgun = gecerliFiltre.tur === "bolge" && !secili;
                      return (
                        <li key={b.kod}>
                          <button
                            type="button"
                            onClick={() => bolgeyiFiltrele(b.kod)}
                            aria-pressed={secili}
                            className={cn(
                              "flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left transition-colors",
                              secili ? "bg-accent/50" : "hover:bg-accent/30",
                              solgun && "opacity-40"
                            )}
                            title={
                              secili
                                ? `${b.ad} — tıkla, tüm bölgelere dön`
                                : `${b.ad} — yalnız bu bölgeyi göster`
                            }
                          >
                            <span
                              className="size-2.5 shrink-0 rounded-full ring-2 ring-background/60"
                              style={{ background: bolgeRengi(b.kod) }}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                              {b.ad}
                            </span>
                            <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                              {formatNumber(b.duraklar.length)} ·{" "}
                              {formatNumber(Math.round(b.cuvalEsdeger))} çuval
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : gecerliListe === "kaydedilenler" ? (
                  kayitli.loading && kayitli.gunler.length === 0 ? (
                    <p className="flex items-center gap-2 px-2.5 py-3 text-[12px] text-muted-foreground">
                      <LoaderIcon className="size-3.5 shrink-0 animate-spin" strokeWidth={1.75} aria-hidden />
                      Yükleniyor…
                    </p>
                  ) : kayitli.gunler.length === 0 ? (
                    <p className="px-2.5 py-3 text-[12px] text-muted-foreground">
                      Henüz kaydedilmiş plan yok.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/30">
                      {kayitli.gunler.map((gun) => (
                        <li key={gun.planTarihi}>
                          <div className="flex items-center justify-between gap-2 bg-accent/20 px-2.5 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-foreground">
                              {tarihMetni(gun.planTarihi)}
                            </span>
                            <Link
                              href={`/rotalar/harita?gun=${encodeURIComponent(gun.planTarihi)}`}
                              className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                              title="O günün tüm araçlarını haritada göster"
                            >
                              Tümü
                            </Link>
                          </div>
                          <ul>
                            {gun.planlar.map((plan) => (
                              <li key={plan.id}>
                                <Link
                                  href={`/rotalar/harita?planId=${encodeURIComponent(plan.id)}`}
                                  className="flex min-w-0 items-center gap-2 py-2 pr-2.5 pl-4 text-left transition-colors hover:bg-accent/30"
                                  title={`${plan.aracAd} — haritada göster`}
                                >
                                  <TruckIcon
                                    className="size-3 shrink-0 text-muted-foreground"
                                    strokeWidth={1.75}
                                    aria-hidden
                                  />
                                  <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                                    {plan.aracAd}
                                  </span>
                                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                                    {formatNumber(plan.durakSayisi)} durak
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )
                ) : yuklu.length === 0 ? (
                  <p className="flex items-center gap-2 px-2.5 py-3 text-[12px] text-muted-foreground">
                    {loading ? (
                      <>
                        <LoaderIcon className="size-3.5 shrink-0 animate-spin" strokeWidth={1.75} aria-hidden />
                        Yükleniyor…
                      </>
                    ) : gecmisMod ? (
                      "Bu tarihte kayıtlı plan bulunamadı."
                    ) : (
                      "Henüz araca durak atanmadı — planlama ekranından dağıtın."
                    )}
                  </p>
                ) : (
                  <ul className="divide-y divide-border/30">
                    {yuklu.map((r) => {
                      const secili = gecerliOdak === r.aracKod;
                      const solgun = gecerliOdak != null && !secili;
                      const arac = canli.aracBul(r.aracKod);
                      const doluluk = arac ? dolulukHesapla(arac, r.duraklar) : null;
                      const yuzde =
                        doluluk == null
                          ? null
                          : doluluk.baglayiciKisit === "agirlik"
                            ? (doluluk.kgYuzde ?? doluluk.cuvalYuzde)
                            : doluluk.cuvalYuzde;
                      return (
                        <li key={r.aracKod}>
                          <button
                            type="button"
                            onClick={() => araciFiltrele(r.aracKod)}
                            aria-pressed={secili}
                            className={cn(
                              "flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left transition-colors",
                              secili ? "bg-accent/50" : "hover:bg-accent/30",
                              solgun && "opacity-40"
                            )}
                            title={
                              secili
                                ? `${r.aracAd} — tıkla, tüm araçlara dön`
                                : `${r.aracAd} — yalnız bu aracı göster`
                            }
                          >
                            <span
                              className="size-2.5 shrink-0 rounded-full ring-2 ring-background/60"
                              style={{ background: r.renk }}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                              {r.aracAd}
                            </span>
                            <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                              {formatNumber(r.duraklar.length)} ·{" "}
                              {formatNumber(Math.round(doluluk?.cuvalEsdeger ?? 0))} çuval
                              {yuzde != null ? ` · %${Math.round(yuzde)}` : ""}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {havuz.length > 0 && gecerliListe === "araclar" ? (
                  <button
                    type="button"
                    onClick={() => setHavuzGoster((o) => !o)}
                    aria-pressed={havuzGoster}
                    className={cn(
                      "flex w-full items-center gap-2 border-t border-border/40 px-2.5 py-2 text-left transition-colors hover:bg-accent/30",
                      !havuzGoster && "opacity-40"
                    )}
                    title={
                      gecerliOdak != null
                        ? "Atanmamış durakları göster/gizle — tıklayıp doğrudan bu araca ekleyebilirsiniz"
                        : "Atanmamış durakları göster/gizle"
                    }
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full border border-muted-foreground/60"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                      Atanmamış
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                      {formatNumber(havuz.length)}
                    </span>
                  </button>
                ) : null}
              </GsapAutoHeight>
            </div>

            {gecerliFiltre.tur !== "hepsi" ? (
              <button
                type="button"
                onClick={() => setFiltre({ tur: "hepsi" })}
                className="flex shrink-0 items-center gap-1.5 border-t border-border/40 px-2.5 py-2 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <LayersIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
                Tümünü göster
              </button>
            ) : null}
          </div>
        </div>

        {/*
          Sağ alt: plan karnesi + özet (yalnız CANLI modda — karne canlı plana
          göre hesaplanıyor, dondurulmuş bir günün yanında göstermek yanıltıcı
          olurdu). Kayıtlı modda yerine sade bir özet çipi var.
        */}
        <div ref={sagAltRef} className="flex flex-col items-end gap-2">
          {/*
            Optimize durumu — plan karnesinin HEMEN ÜSTÜNDE, aynı cam+genişlik.
            Optimize artık yalnız düğmeyle değil kendiliğinden de (bkz.
            RotaPlaniProvider) tetiklendiği için arka planda bir şey olduğu
            görünür olmalı, aksi halde süre neden "ölçülmedi" belirsiz kalırdı.
          */}
          {canli.optimizeEdilenler.length > 0 || optimizeTamamZamani != null ? (
            <div
              className={cn(
                "pointer-events-auto flex w-[min(100%,20rem)] min-w-0 flex-col overflow-hidden rounded-2xl",
                CAM
              )}
            >
              {canli.optimizeEdilenler.length > 0 ? (
                <OptimizeCalisiyorKart calisanSayisi={canli.optimizeEdilenler.length} />
              ) : (
                <OptimizeTamamKart
                  key={optimizeTamamZamani}
                  onBitti={() => setOptimizeTamamZamani(null)}
                />
              )}
            </div>
          ) : null}

          <div
            className={cn(
              "pointer-events-auto flex w-[min(100%,20rem)] min-w-0 flex-col overflow-hidden rounded-2xl",
              CAM
            )}
          >
            {!gecmisMod ? (
              <PlanKarnesi
                kriterler={kriterler}
                vurgulanan={gecerliFiltre.tur === "karne" ? gecerliFiltre.anahtar : null}
                onVurgula={(anahtar) =>
                  setFiltre(anahtar != null ? { tur: "karne", anahtar } : { tur: "hepsi" })
                }
                aktifDoluluk={aktifDoluluk}
                dolulukFarki={dolulukFarki}
                onDolulukFarkiBitti={() => setDolulukFarki(null)}
                onOptimizeEt={
                  odakliArac && canli.aracDuraklari(odakliArac.kod).length >= 2
                    ? () => canli.optimizeEt(odakliArac.kod)
                    : null
                }
                optimizeEdiliyor={
                  odakliArac != null && canli.optimizeEdilenler.includes(odakliArac.kod)
                }
              />
            ) : null}

            {yuklu.length > 0 ? (
              <>
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/40 px-3 py-1.5 first:border-t-0">
                  <TruckIcon
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="font-mono text-[12px] text-foreground tabular-nums">
                    {formatNumber(gorunenRotalar.length)} araç ·{" "}
                    {formatNumber(toplamDurak)} durak
                  </span>
                  {gecerliFiltre.tur === "karne" ? (
                    <button
                      type="button"
                      onClick={() => setFiltre({ tur: "hepsi" })}
                      className="shrink-0 text-[11.5px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    >
                      Vurguyu kaldır
                    </button>
                  ) : null}
                  {!gecmisMod ? (
                    <>
                      {/*
                        Otomatik kayıt her ~1,5sn'de bir kendiliğinden çalışıyor
                        (RotaPlaniProvider) — bu rozet HER yazımda (otomatik ya
                        da bu düğmeyle elle, ikisi aynı yola çıkıyor) beliriyor.
                        Genel toastManager'ı bilerek kullanmıyoruz: sık tetiklenen
                        bir onay için normal toast yığını hızla kirlenirdi.
                      */}
                      {canli.sonKayitZamani != null ? (
                        <KayitRozeti key={canli.sonKayitZamani} zaman={canli.sonKayitZamani} />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setHaritaLinkleriAcik((o) => !o)}
                        aria-pressed={haritaLinkleriAcik}
                        title="Güzergahı Google Maps'te aç ya da bağlantısını gönder"
                        className="ml-auto flex shrink-0 items-center gap-1 rounded border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                      >
                        <MapIcon className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
                        Haritada göster
                      </button>
                      <button
                        type="button"
                        onClick={() => void canli.taslakKaydet()}
                        disabled={canli.taslakKaydediliyor}
                        title="Taslağı şimdi kaydet — zaten kendiliğinden de kaydediliyor, sayfa yenilense de kaybolmaz"
                        className="flex shrink-0 items-center gap-1 rounded border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
                      >
                        {canli.taslakKaydediliyor ? (
                          <LoaderIcon className="size-3 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
                        ) : (
                          <SaveIcon className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
                        )}
                        Kaydet
                      </button>
                    </>
                  ) : null}
                </div>

                {/*
                  "Haritada göster" listesi — şu an görünen (filtreye uyan)
                  her araç için Google Maps bağlantısı: dışa link olarak aç,
                  ya da OS paylaşım sayfasından/panodan başka birine gönder.
                */}
                {!gecmisMod ? (
                  <GsapCollapse open={haritaLinkleriAcik} className="border-t border-border/40">
                    <ul className="flex flex-col divide-y divide-border/30">
                      {gorunenRotalar.map((r) => {
                        const konumlu = r.duraklar.filter(
                          (d): d is RotaDuragi & { lat: number; lon: number } =>
                            d.lat != null && d.lon != null
                        );
                        if (konumlu.length === 0) return null;
                        const url = googleMapsDirUrl(konumlu, {
                          includeDepot: true,
                          roundTrip: true,
                        });
                        return (
                          <li key={r.aracKod} className="flex min-w-0 items-center gap-2 px-3 py-1.5">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ background: r.renk }}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                              {r.aracAd}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                              {formatNumber(konumlu.length)} durak
                            </span>
                            <button
                              type="button"
                              onClick={() => void baglantiPaylas(url, r.aracAd)}
                              title={`${r.aracAd} — bağlantıyı gönder/kopyala`}
                              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <SendIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
                            </button>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              title={`${r.aracAd} — Google Maps'te aç`}
                              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <ExternalLinkIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </GsapCollapse>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {seciliDurak ? (
        <DurakDetayKarti
          // Durak değişince kart tamamen yeniden kurulsun — önizleme için
          // tıklanan araç gibi iç state bir öncekinden kalmasın.
          key={seciliDurak.durak.musteriKodu}
          secim={seciliDurak}
          containerRef={containerRef}
          filo={gecmisMod ? null : canli.araclar}
          aktifArac={odakliArac ? { kod: odakliArac.kod, ad: odakliArac.ad } : null}
          onClose={() => setSeciliDurak(null)}
          onRotadanCikar={gecmisMod ? null : durakRotadanCikar}
          onRotayaEklemeOnizle={gecmisMod ? null : durakEklemeOnizle}
          onRotayaEkle={gecmisMod ? null : durakRotayaEkle}
          cikariliyor={cikariliyor}
          ekleniyorAracKod={ekleniyorAracKod}
          onOnizlemeAracDegisti={gecmisMod ? undefined : setOnizlemeAracKod}
        />
      ) : null}

      <RotaHaritaAiBubble
        baglamGirdisi={{
          gecmisMod,
          gecmisTarihMetni: gecmisTarih ? tarihMetni(gecmisTarih) : null,
          aracAdlari: yuklu.map((r) => r.aracAd),
          bolgeAdlari: canli.bolgeler.map((b) => b.ad),
          secimAciklamasi,
          seciliDurakAdi: seciliDurak?.durak.unvan ?? null,
          odakliArac: odakliAracBaglam,
          metrik: canli.mevcutMetrik,
          kriterler,
          havuzSayisi: havuz.length,
          atananSayisi: canli.atananSayisi,
          sonKayitZamani: canli.sonKayitZamani,
          taslakKaydediliyor: canli.taslakKaydediliyor,
        }}
        altSinirY={sagAltUstY}
      />
    </div>
    </RotaOnerisiSaglayici>
    </RotaHaritaEylemSaglayici>
  );
}
