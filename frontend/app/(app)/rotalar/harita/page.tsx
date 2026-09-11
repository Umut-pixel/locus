"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  LayersIcon,
  LoaderIcon,
  TruckIcon,
} from "lucide-react";

import {
  DurakDetayKarti,
  type DurakSecimi,
  type EklemeOnizlemesi,
} from "@/components/rota/DurakDetayKarti";
import {
  PlanKarnesi,
  type AktifDoluluk,
  type DolulukFarki,
} from "@/components/rota/PlanKarnesi";
import { aracRengi, RotaHaritasi, type HaritaRotasi } from "@/components/rota/RotaHaritasi";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { toastManager } from "@/components/ui/toast";
import { useKayitliPlanlar, type KayitliDurak } from "@/hooks/useKayitliPlanlar";
import { useRaporTazeligi } from "@/hooks/useMusteriRaporlama";
import { ROTA_REPORT_ID, type RotaAraci, type RotaDuragi } from "@/hooks/useRotaPlani";
import { formatKg, formatNumber } from "@/lib/format";
import { dolulukHesapla } from "@/lib/rota/atama";
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
   * değeri; sonrasında `odak` normal state, kullanıcı serbestçe değiştirebilir.
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

  /**
   * Karnede seçili satır. Yalnız ANAHTAR saklanıyor; suçlular her zaman güncel
   * `kriterler`den türetiliyor — plan değiştiğinde vurgu bayat kalmasın.
   */
  const [karneAnahtari, setKarneAnahtari] = useState<KriterAnahtari | null>(null);

  /** Tek araca odaklan — null ise hepsi görünür. */
  const [odak, setOdak] = useState<string | null>(() => odakAracParam);
  const [havuzGoster, setHavuzGoster] = useState(true);

  /** Haritada tıklanan durak — bilgi kartı bunun üzerine kurulur. */
  const [seciliDurak, setSeciliDurak] = useState<DurakSecimi | null>(null);
  const [cikariliyor, setCikariliyor] = useState(false);
  const [ekleniyorAracKod, setEkleniyorAracKod] = useState<string | null>(null);
  /** Son ekle/çıkar eyleminin öncesi/sonrası — karnedeki geçici rozet bunu okur. */
  const [dolulukFarki, setDolulukFarki] = useState<DolulukFarki | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    [gecmisMod, seciliDurak, ekleniyorAracKod, canli, hesaplaYuzde]
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

  // Odaklanılan araç plandan çıkarsa odak kendiliğinden düşsün.
  const gecerliOdak =
    odak != null && yuklu.some((r) => r.aracKod === odak) ? odak : null;

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

  /**
   * Odak ya da karne vurgusu değişince görünen küme değişir (`gorunenRotalar`/
   * `gorunenHavuz`) — açık durak kartı artık haritada hiç çizilmeyen bir
   * marker'a ait kalabilir. Aynı şekilde canlı/kayıtlı geçişinde de kapanır.
   */
  useEffect(() => {
    setSeciliDurak(null);
  }, [gecerliOdak, karneAnahtari, gecmisMod]);

  /**
   * Karne satırı seçilince harita o satırın suçlularını gösterir: sayıyı
   * okuyup aracı elle aramak yerine sorun doğrudan görünür. Araç odağı
   * (soldaki liste) daha spesifik olduğu için önceliği o alıyor. Kayıtlı
   * modda karne yok, bu yüzden bu blok hep boş kalır.
   */
  const secilenKriter =
    karneAnahtari != null
      ? (kriterler.find((k) => k.anahtar === karneAnahtari) ?? null)
      : null;
  const karneAraclari = secilenKriter?.suclular.araclar ?? [];
  const karneDuraklari = secilenKriter?.suclular.duraklar ?? [];

  const gorunenRotalar = gecerliOdak
    ? yuklu.filter((r) => r.aracKod === gecerliOdak)
    : karneAraclari.length > 0
      ? yuklu.filter((r) => karneAraclari.includes(r.aracKod))
      : yuklu;

  /**
   * Eskiden tek araca odaklanınca havuz tamamen gizleniyordu ("dikkat
   * dağıtır" gerekçesiyle). Artık gizlenmiyor: havuzdaki bir noktaya
   * tıklayıp "Rotaya ekle" ile doğrudan odaklanılan araca eklemek bu
   * görünürlüğe bağlı — `DurakDetayKarti`nin tek-hedef modu (bkz. `aktifArac`
   * aşağıda). Karne "yerleşmeyen durak" satırını gösteriyorsa o suçlularla
   * sınırlanır; aksi halde normal `havuzGoster` anahtarı geçerli.
   */
  const gorunenHavuz =
    karneDuraklari.length > 0
      ? havuz.filter((d) => karneDuraklari.includes(d.musteriKodu))
      : havuzGoster
        ? havuz
        : [];

  const odakla = (aracKod: string) =>
    setOdak((o) => (o === aracKod ? null : aracKod));

  const toplamDurak = gorunenRotalar.reduce((t, r) => t + r.duraklar.length, 0);

  return (
    <div ref={containerRef} className="relative isolate min-h-0 min-w-0 flex-1 overflow-hidden">
      <RotaHaritasi
        rotalar={gorunenRotalar}
        havuz={gorunenHavuz}
        onDurakSec={setSeciliDurak}
        onBosaTikla={() => setSeciliDurak(null)}
      />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between gap-2 p-2 sm:p-3 md:p-4">
        {/* Sol üst: geri + araç listesi — ikisi ayrı kart, DurakDetayKarti'yle aynı "her panel kendi camı" dili */}
        <div className="flex min-h-0 flex-col items-start gap-2">
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

            <div className="max-h-[60vh] min-h-0 overflow-y-auto">
              {yuklu.length === 0 ? (
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
                    const kg = r.duraklar.reduce((t, d) => t + d.kg, 0);
                    return (
                      <li key={r.aracKod}>
                        <button
                          type="button"
                          onClick={() => odakla(r.aracKod)}
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
                            {formatNumber(r.duraklar.length)} · {formatKg(Math.round(kg))}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {havuz.length > 0 ? (
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
            </div>

            {gecerliOdak != null ? (
              <button
                type="button"
                onClick={() => setOdak(null)}
                className="flex shrink-0 items-center gap-1.5 border-t border-border/40 px-2.5 py-2 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <LayersIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
                Tüm araçları göster
              </button>
            ) : null}
          </div>
        </div>

        {/*
          Sağ alt: plan karnesi + özet (yalnız CANLI modda — karne canlı plana
          göre hesaplanıyor, dondurulmuş bir günün yanında göstermek yanıltıcı
          olurdu). Kayıtlı modda yerine sade bir özet çipi var.
        */}
        <div className="flex justify-end">
          <div
            className={cn(
              "pointer-events-auto flex w-[min(100%,20rem)] min-w-0 flex-col overflow-hidden rounded-2xl",
              CAM
            )}
          >
            {!gecmisMod ? (
              <PlanKarnesi
                kriterler={kriterler}
                vurgulanan={karneAnahtari}
                onVurgula={(anahtar) => {
                  setKarneAnahtari(anahtar);
                  // Araç odağı karne vurgusunu ezmesin diye sıfırlanır.
                  if (anahtar != null) setOdak(null);
                }}
                aktifDoluluk={aktifDoluluk}
                dolulukFarki={dolulukFarki}
                onDolulukFarkiBitti={() => setDolulukFarki(null)}
              />
            ) : null}

            {yuklu.length > 0 ? (
              <div className="flex shrink-0 items-center gap-2 border-t border-border/40 px-3 py-1.5 first:border-t-0">
                <TruckIcon
                  className="size-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="font-mono text-[12px] text-foreground tabular-nums">
                  {formatNumber(gorunenRotalar.length)} araç ·{" "}
                  {formatNumber(toplamDurak)} durak
                </span>
                {karneAnahtari != null ? (
                  <button
                    type="button"
                    onClick={() => setKarneAnahtari(null)}
                    className="ml-auto shrink-0 text-[11.5px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    Vurguyu kaldır
                  </button>
                ) : null}
              </div>
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
        />
      ) : null}
    </div>
  );
}
