"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleAlertIcon,
  ClipboardCheckIcon,
  LoaderIcon,
  RouteIcon,
  TruckIcon,
} from "lucide-react";
import gsap from "gsap";
import { useReducedMotion } from "motion/react";

import {
  karneOzeti,
  type Kriter,
  type KriterAnahtari,
  type KriterDurumu,
} from "@/lib/rota/kriter";
import { GsapCollapse } from "@/components/ui/gsap-collapse";
import { formatKg, formatNumber } from "@/lib/format";
import { dolulukTonu } from "@/lib/rota/doluluk-renk";
import { cn } from "@/lib/utils";

/** Odaklanılan aracın güncel doluluğu — karnenin en üstünde, her zaman görünür. */
export interface AktifDoluluk {
  aracKod: string;
  aracAd: string;
  yuzde: number;
  kg: number;
  /** İstiap haddi teyitli değilse null — o zaman yalnız çuval yüzdesi bağlayıcı. */
  kapasiteKg: number | null;
  asim: boolean;
}

/** Bir ekle/çıkar eyleminin öncesi/sonrası — geçici rozet bunun için. */
export interface DolulukFarki {
  aracKod: string;
  eskiYuzde: number;
  yeniYuzde: number;
  /** `Date.now()` — art arda gelen aynı yüzdeli olaylarda bile rozeti yeniden tetiklemek için `key`. */
  zaman: number;
}

interface PlanKarnesiProps {
  kriterler: Kriter[];
  /**
   * Satıra tıklanınca hangi kriterin vurgulanacağı; `null` vurguyu kaldırır.
   * Nesne değil ANAHTAR taşınıyor: kriterler her plan değişiminde yeniden
   * hesaplandığı için saklanan bir `suclular` nesnesi bayatlar.
   */
  onVurgula: (anahtar: KriterAnahtari | null) => void;
  /** Şu an vurgulanan kriter — satır seçili görünür. */
  vurgulanan: KriterAnahtari | null;
  /** `null` ise hiçbir araca odaklanılmamış — satır hiç gösterilmez. */
  aktifDoluluk: AktifDoluluk | null;
  /** Son ekle/çıkar eyleminin farkı — rozet kendi kendine animasyonla kaybolur. */
  dolulukFarki: DolulukFarki | null;
  /** Rozet solma animasyonunu bitirince çağrılır — state'i temizlemek için. */
  onDolulukFarkiBitti: () => void;
  /**
   * Odaklanılan aracın güzergahını Google Routes ile yeniden sıralar.
   * `null` ise düğme hiç gösterilmez (kayıtlı mod, ya da 2'den az durak).
   */
  onOptimizeEt: (() => void | Promise<void>) | null;
  optimizeEdiliyor: boolean;
  className?: string;
}

const DURUM_SINIFI: Record<KriterDurumu, string> = {
  iyi: "text-muted-foreground",
  dikkat: "text-caution",
  sorun: "text-destructive",
};

/**
 * Yüzde taşıyan satırlarda (şu an yalnız "Yük riski") "iyi" nötr gri değil
 * YEŞİL — "aşım yok" olumlu bir sonuç, gri kalırsa fark edilmiyordu. Diğer
 * kriterlerin "iyi"si (DURUM_SINIFI) BİLEREK nötr kalıyor, burası değişmiyor.
 */
const YUZDE_DURUM_SINIFI: Record<KriterDurumu, string> = {
  iyi: "text-success",
  dikkat: "text-caution",
  sorun: "text-destructive",
};

const DURUM_ETIKETI: Record<KriterDurumu, string> = {
  iyi: "sorun yok",
  dikkat: "dikkat",
  sorun: "sorun",
};

/** Kaynak rozeti — ölçülen sessiz, tahmin ve eksik veri açıkça söyleniyor. */
function KaynakRozeti({ kaynak }: { kaynak: Kriter["kaynak"] }) {
  if (kaynak === "olculen") return null;
  return (
    <span
      className="shrink-0 rounded border border-border/70 px-1 py-px text-[9.5px] tracking-wide text-muted-foreground uppercase"
      title={
        kaynak === "tahmini"
          ? "Vekil bir ölçüyle temsil ediliyor — gerçek değer bu değil."
          : "Bu kriter için veri yok; hesaplanamıyor."
      }
    >
      {kaynak === "tahmini" ? "tahmini" : "veri yok"}
    </span>
  );
}

/**
 * Plan karnesi — haritanın üstünde, "bu plan sahaya çıkar mı".
 *
 * Neden HARİTADA: karar mekânsal. Planlama ekranı haritanın yokluğunu telafi
 * etmek için altı ayrı sayısal vekil (yayılım, bölünmüş bölge, bölge km'si…)
 * üretmişti; tam ekran harita ise araç listesi ve küçük bir çipten ibaretti.
 * Ölçüm, sonucun görüldüğü yerde duruyor artık.
 *
 * Satıra tıklamak `suclular`'ı haritada vurgular: sayıyı okuyup aracı elle
 * aramak yerine sorun doğrudan gösteriliyor.
 */
export function PlanKarnesi({
  kriterler,
  onVurgula,
  vurgulanan,
  aktifDoluluk,
  dolulukFarki,
  onDolulukFarkiBitti,
  onOptimizeEt,
  optimizeEdiliyor,
  className,
}: PlanKarnesiProps) {
  const [acik, setAcik] = useState(true);

  const dolulukSatiri = aktifDoluluk ? (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border/40 px-3">
      <TruckIcon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
        Doluluk — {aktifDoluluk.aracAd}
      </span>
      {onOptimizeEt ? (
        <button
          type="button"
          onClick={() => void onOptimizeEt()}
          disabled={optimizeEdiliyor}
          title="Bu aracın güzergahını Google Routes ile yeniden sırala"
          className="flex shrink-0 items-center gap-1 rounded border border-border/70 px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
        >
          {optimizeEdiliyor ? (
            <LoaderIcon className="size-3 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            <RouteIcon className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
          )}
          Optimize et
        </button>
      ) : null}
      {dolulukFarki && dolulukFarki.aracKod === aktifDoluluk.aracKod ? (
        <FarkRozeti key={dolulukFarki.zaman} fark={dolulukFarki} onBitti={onDolulukFarkiBitti} />
      ) : null}
      <span
        className="shrink-0 font-mono text-[11.5px] tabular-nums"
        style={{ color: dolulukTonu(aktifDoluluk.yuzde) }}
      >
        %{Math.round(aktifDoluluk.yuzde)} · {formatKg(Math.round(aktifDoluluk.kg))}
        {aktifDoluluk.kapasiteKg != null ? ` / ${formatKg(Math.round(aktifDoluluk.kapasiteKg))}` : ""}
      </span>
    </div>
  ) : null;

  if (kriterler.length === 0) {
    return (
      <div className={cn("flex min-w-0 flex-col", className)}>
        {dolulukSatiri}
        <div className="px-3 py-2 text-[12px] text-muted-foreground">
          Henüz dağıtım yok — planlama ekranından yükü araçlara dağıtın.
        </div>
      </div>
    );
  }

  const ozet = karneOzeti(kriterler);
  const OzetIkon =
    ozet.durum === "sorun"
      ? CircleAlertIcon
      : ozet.durum === "dikkat"
        ? AlertTriangleIcon
        : CheckCircle2Icon;

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {dolulukSatiri}

      <button
        type="button"
        onClick={() => setAcik((o) => !o)}
        aria-expanded={acik}
        className="flex h-10 shrink-0 items-center gap-2 px-3 text-left transition-colors hover:bg-accent/30"
      >
        <ClipboardCheckIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Plan karnesi
        </span>
        <span className={cn("flex items-center gap-1 text-[11.5px]", DURUM_SINIFI[ozet.durum])}>
          <OzetIkon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          {ozet.sorun > 0
            ? `${ozet.sorun} sorun`
            : ozet.dikkat > 0
              ? `${ozet.dikkat} dikkat`
              : "temiz"}
        </span>
        <span className="min-w-0 flex-1" />
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            acik && "rotate-180"
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>

      <GsapCollapse open={acik} className="border-t border-border/40">
        <ul className="flex flex-col">
          {kriterler.map((k) => {
            const vurgulanabilir =
              k.suclular.araclar.length > 0 || k.suclular.duraklar.length > 0;
            const secili = vurgulanan === k.anahtar;
            return (
              <li key={k.anahtar} className="border-b border-border/25 last:border-b-0">
                <KriterSatiri
                  kriter={k}
                  secili={secili}
                  vurgulanabilir={vurgulanabilir}
                  onSec={() => onVurgula(secili ? null : k.anahtar)}
                />
              </li>
            );
          })}
        </ul>
      </GsapCollapse>
    </div>
  );
}

/**
 * Bir ekle/çıkar eyleminin öncesi/sonrası farkını gösteren geçici rozet.
 * GSAP ile belirip (`fromTo`), bir süre kalıp, kendiliğinden solup kayboluyor
 * — kaybolma bitince `onBitti` çağrılır ki üst bileşen state'i temizlesin.
 * Artan yüzde `--success`, azalan `--destructive` — ev rengi konvansiyonu.
 */
function FarkRozeti({ fark, onBitti }: { fark: DolulukFarki; onBitti: () => void }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const bittiRef = useRef(onBitti);
  bittiRef.current = onBitti;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.killTweensOf(el);

    if (reduced) {
      gsap.set(el, { opacity: 1 });
      const t = window.setTimeout(() => bittiRef.current(), 1800);
      return () => window.clearTimeout(t);
    }

    gsap.fromTo(
      el,
      { opacity: 0, y: -4, scale: 0.92 },
      { opacity: 1, y: 0, scale: 1, duration: 0.24, ease: "power2.out" }
    );
    const t = window.setTimeout(() => {
      gsap.to(el, {
        opacity: 0,
        y: -4,
        duration: 0.35,
        ease: "power2.in",
        onComplete: () => bittiRef.current(),
      });
    }, 2600);
    return () => {
      window.clearTimeout(t);
      gsap.killTweensOf(el);
    };
    // Yalnız mount'ta kurulsun — her yeni fark, `key`'le (çağıran tarafta
    // aracKod+yeniYuzde) yeniden mount edilip baştan tetikleniyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const delta = Math.round(fark.yeniYuzde - fark.eskiYuzde);
  const artti = delta > 0;
  const azaldi = delta < 0;

  return (
    <span
      ref={ref}
      style={{ opacity: 0 }}
      className={cn(
        "shrink-0 rounded px-1 py-px font-mono text-[10.5px] font-semibold tabular-nums",
        artti ? "bg-success/15 text-success" : azaldi ? "bg-destructive/15 text-destructive" : "text-muted-foreground"
      )}
    >
      {artti ? "+" : ""}
      {delta}%
    </span>
  );
}

/**
 * "Otomatik kaydedildi" — her taslak yazımında (otomatik ya da "Kaydet"
 * düğmesiyle elle, ikisi de aynı yola çıkıyor) beliren küçük, kendiliğinden
 * kaybolan rozet. Genel `toastManager`'ı bilerek kullanmıyor: her ~1,5
 * saniyelik düzenlemede bir tetiklendiği için normal toast yığını hızla
 * kirlenirdi — bu yalnız Kaydet düğmesinin yanında duran sessiz bir onay.
 */
export function KayitRozeti({ zaman }: { zaman: number }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.killTweensOf(el);

    if (reduced) {
      gsap.set(el, { opacity: 1 });
      const t = window.setTimeout(() => gsap.to(el, { opacity: 0, duration: 0.2 }), 1600);
      return () => window.clearTimeout(t);
    }

    gsap.fromTo(el, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" });
    const t = window.setTimeout(() => {
      gsap.to(el, { opacity: 0, y: 4, duration: 0.3, ease: "power2.in" });
    }, 2000);
    return () => {
      window.clearTimeout(t);
      gsap.killTweensOf(el);
    };
    // `key={zaman}` çağıran tarafta her yeni kayıtta yeniden mount ediyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zaman]);

  return (
    <span
      ref={ref}
      style={{ opacity: 0 }}
      className="shrink-0 text-[11px] text-muted-foreground"
    >
      Otomatik kaydedildi
    </span>
  );
}

/**
 * "Rota hesaplanıyor…" — bir ya da daha fazla araç Google Routes'tan cevap
 * beklerken görünen kart, plan karnesinin HEMEN ÜSTÜNDE ayrı bir kart olarak.
 * Optimize artık yalnız düğmeyle değil kendiliğinden de tetiklendiği için
 * (bkz. RotaPlaniProvider) arka planda bir şey olduğu görünür olmalı — aksi
 * halde kullanıcı süre neden hâlâ "ölçülmedi" diye sorar. Çalışırken solup
 * kaybolmuyor, `calisanSayisi` 0'a düşene kadar sabit kalıyor.
 */
export function OptimizeCalisiyorKart({ calisanSayisi }: { calisanSayisi: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <LoaderIcon
        className="size-3.5 shrink-0 animate-spin text-muted-foreground"
        strokeWidth={2}
        aria-hidden
      />
      <span className="text-[12px] text-foreground">
        {calisanSayisi <= 1
          ? "Rota hesaplanıyor…"
          : `${calisanSayisi} araç için rota hesaplanıyor…`}
      </span>
    </div>
  );
}

/**
 * "Rota güncellendi" — `OptimizeCalisiyorKart` kapanır kapanmaz kısa bir süre
 * gösterilen onay, `KayitRozeti` ile aynı GSAP fade deseni. `onBitti` çağıran
 * tarafın state'ini temizliyor ki kart sonsuza dek (görünmez de olsa) takılı
 * kalmasın — `dolulukFarki`/`FarkRozeti` çiftinin aynısı.
 */
export function OptimizeTamamKart({ onBitti }: { onBitti: () => void }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const bittiRef = useRef(onBitti);
  bittiRef.current = onBitti;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.killTweensOf(el);

    if (reduced) {
      gsap.set(el, { opacity: 1 });
      const t = window.setTimeout(() => bittiRef.current(), 1600);
      return () => window.clearTimeout(t);
    }

    gsap.fromTo(el, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" });
    const t = window.setTimeout(() => {
      gsap.to(el, {
        opacity: 0,
        y: -4,
        duration: 0.3,
        ease: "power2.in",
        onComplete: () => bittiRef.current(),
      });
    }, 1800);
    return () => {
      window.clearTimeout(t);
      gsap.killTweensOf(el);
    };
    // Yalnız mount'ta kurulsun — çağıran taraf her yeni tamamlanmada `key`
    // ile yeniden mount ediyor (`KayitRozeti`teki desenin aynısı).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ref} style={{ opacity: 0 }} className="flex items-center gap-2 px-3 py-2.5">
      <CheckCircle2Icon className="size-3.5 shrink-0 text-success" strokeWidth={2} aria-hidden />
      <span className="text-[12px] text-foreground">Rota güncellendi</span>
    </div>
  );
}

function KriterSatiri({
  kriter,
  secili,
  vurgulanabilir,
  onSec,
}: {
  kriter: Kriter;
  secili: boolean;
  vurgulanabilir: boolean;
  onSec: () => void;
}) {
  const [aciklamaAcik, setAciklamaAcik] = useState(false);

  const govde = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        {/*
          Durum yalnız renkle anlatılmıyor: ikon + `sr-only` metin var.
          Modülün geri kalanında bu ayrım yoktu (amber sayı = uyarı).
        */}
        <StatusIkon durum={kriter.durum} />
        <span className="min-w-0 truncate text-[12px] text-foreground">
          {kriter.ad}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <KaynakRozeti kaynak={kriter.kaynak} />
        <span
          className={cn(
            "font-mono text-[11.5px] tabular-nums",
            // Yüzde taşıyan satırda (Yük riski) "iyi" gri değil yeşil —
            // "aşım yok" olumlu bir sonuç, sürekli gradyan yerine ayrık
            // durum rengi kullanılıyor (bkz. YUZDE_DURUM_SINIFI).
            kriter.yuzde == null
              ? kriter.durum === "iyi"
                ? "text-muted-foreground"
                : DURUM_SINIFI[kriter.durum]
              : YUZDE_DURUM_SINIFI[kriter.durum]
          )}
        >
          {kriter.deger}
        </span>
      </span>
    </>
  );

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => {
          setAciklamaAcik((o) => !o);
          if (vurgulanabilir) onSec();
        }}
        aria-expanded={aciklamaAcik}
        title={
          vurgulanabilir
            ? `${kriter.ad} — ilgili araç ve durakları haritada göster`
            : kriter.ad
        }
        className={cn(
          "flex w-full min-w-0 items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors",
          secili ? "bg-accent/50" : "hover:bg-accent/30"
        )}
      >
        {govde}
      </button>

      {/*
        Açıklama görünür metin, `title` değil: bu cümleler kararın gerekçesi
        ve dokunmatikte/ekran okuyucuda kaybolmamalı.
      */}
      <GsapCollapse open={aciklamaAcik}>
        <p className="px-3 pb-2 text-[11px] leading-relaxed text-muted-foreground">
          {kriter.aciklama}
        </p>
      </GsapCollapse>
    </div>
  );
}

function StatusIkon({ durum }: { durum: KriterDurumu }) {
  const Ikon =
    durum === "sorun"
      ? CircleAlertIcon
      : durum === "dikkat"
        ? AlertTriangleIcon
        : CheckCircle2Icon;
  return (
    <>
      <Ikon
        className={cn("size-3.5 shrink-0", DURUM_SINIFI[durum])}
        strokeWidth={2}
        aria-hidden
      />
      <span className="sr-only">{DURUM_ETIKETI[durum]}:</span>
    </>
  );
}
