"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  memo,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GripHorizontalIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, animate, motion, useDragControls, useMotionValue } from "motion/react";

import { Button } from "@/components/ui/button";
import { SegmentBar } from "@/components/ui/segment-bar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatCurrency,
  formatCurrencyPrecise,
  formatDate,
  formatDateTime,
  formatKg,
  formatNumber,
} from "@/lib/format";
import {
  HASSASIYET_LABELS,
  RISK_COLORS,
  RISK_LABELS,
  RISK_ORDER,
  RISK_SHORT_LABELS,
} from "@/lib/risk-style";
import {
  AKSIYON_GUN,
  evaluateMusteriForm,
  esigeKalanGun,
  formDurumu,
  FORM_LABELS,
  OLAY_LABELS,
  type FormDurumu,
  type FormOlay,
  type MusteriSnapshotRow,
  type SnapshotMetrics,
} from "@/lib/snapshot-compare";
import {
  MUSTERI_SNAPSHOTLARI_TABLE,
  supabase,
} from "@/lib/supabase";
import type { MusteriHarita, RiskDurumu } from "@/lib/types";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 304;
const ANCHOR_GAP = 18;
const EDGE_MARGIN = 12;
const COMPACT_BREAKPOINT = 640;

const FORM_COLORS: Record<FormDurumu, string> = {
  ritimde: RISK_COLORS.saglikli,
  yaklasiyor: RISK_COLORS.izlenmeli,
  esik_asildi: RISK_COLORS.riskli,
  sessiz: RISK_COLORS.hic_teslimat_yok,
};

const OLAY_COLORS: Record<FormOlay, string> = {
  kazanim: RISK_COLORS.saglikli,
  uyari: RISK_COLORS.izlenmeli,
  aksiyon: RISK_COLORS.riskli,
  ritim: "var(--muted-foreground)",
  sessiz: RISK_COLORS.hic_teslimat_yok,
};

type PanelPage = "ozet" | "ritim" | "borclar" | "satis";

const PAGE_ORDER: PanelPage[] = ["ozet", "ritim", "borclar", "satis"];

const PAGE_INDEX: Record<PanelPage, number> = {
  ozet: 0,
  ritim: 1,
  borclar: 2,
  satis: 3,
};

const PAGE_LABELS: Record<PanelPage, string> = {
  ozet: "Özet",
  ritim: "Ritim",
  borclar: "Borçlar",
  satis: "Satış",
};

const pageSlideVariants = {
  enter: (direction: number) => ({
    x: direction === 0 ? 0 : direction > 0 ? 28 : -28,
    opacity: direction === 0 ? 1 : 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction === 0 ? 0 : direction < 0 ? 28 : -28,
    opacity: 0,
  }),
};

const pageSlideTransition = {
  x: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  opacity: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
};

const heightTween = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const,
};

const sheetSnapTween = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};

/** Mobil sheet peek (kimlik + sağlık) yaklaşık yükseklik — ölçü gelene kadar. */
const SHEET_PEEK_FALLBACK = 148;

const titleSlideVariants = {
  enter: (direction: number) => ({
    y: direction > 0 ? 4 : -4,
    opacity: 0,
  }),
  center: { y: 0, opacity: 1 },
  exit: (direction: number) => ({
    y: direction < 0 ? 4 : -4,
    opacity: 0,
  }),
};

export interface PanelAnchor {
  /** Seçim anındaki ekran konumu — pan/zoom ile güncellenmez. */
  x: number;
  y: number;
}

interface CustomerDetailPanelProps {
  musteri: MusteriHarita;
  anchor: PanelAnchor;
  containerRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onShowRoute: (rutKod: string) => void;
  riskLabels?: Record<RiskDurumu, string>;
}

export const CustomerDetailPanel = memo(function CustomerDetailPanel({
  musteri,
  anchor,
  containerRef,
  onClose,
  onShowRoute,
  riskLabels = RISK_LABELS,
}: CustomerDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pageMeasureRef = useRef<HTMLDivElement | null>(null);
  const reanchorRef = useRef(true);
  const draggedRef = useRef(false);
  const dragControls = useDragControls();
  const [panelHeight, setPanelHeight] = useState(380);
  const [pageContentHeight, setPageContentHeight] = useState(220);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [page, setPage] = useState<PanelPage>("ozet");
  const [pageDirection, setPageDirection] = useState(0);
  const [snapshot, setSnapshot] = useState<MusteriSnapshotRow | null>(null);
  const [snapLoading, setSnapLoading] = useState(true);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [sheetDragging, setSheetDragging] = useState(false);
  /** Snap animasyonu bitene kadar height kilitli kalsın. */
  const [sheetSnapLock, setSheetSnapLock] = useState(false);
  const peekChromeRef = useRef<HTMLDivElement | null>(null);
  const sheetDraggingRef = useRef(false);
  const expandedHRef = useRef(380);
  const peekHRef = useRef(SHEET_PEEK_FALLBACK);
  const sheetAnimRef = useRef<{ stop: () => void } | null>(null);
  const sheetDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startH: number;
    lastY: number;
    lastT: number;
    velocity: number;
    /** pending → sheet | page | scroll */
    mode: "pending" | "sheet" | "page" | "scroll";
    scrollEl: HTMLElement | null;
  } | null>(null);

  /** Konum (left/top) — transform `y` exit animasyonuyla çakışmasın. */
  const posX = useMotionValue(0);
  const posY = useMotionValue(0);
  const sheetH = useMotionValue(380);

  // Peek'teyken başka nokta seçilince ilk paint'te limited view'da kalmasın.
  const [sheetForKod, setSheetForKod] = useState(musteri.musteri_kodu);
  if (sheetForKod !== musteri.musteri_kodu) {
    setSheetForKod(musteri.musteri_kodu);
    setSheetExpanded(true);
    setSheetDragging(false);
    setSheetSnapLock(false);
    sheetDraggingRef.current = false;
    sheetDragRef.current = null;
    sheetAnimRef.current?.stop();
    sheetAnimRef.current = null;
  }

  const goToPage = (next: PanelPage) => {
    if (next === page) return;
    setPageDirection(PAGE_INDEX[next] - PAGE_INDEX[page]);
    setPage(next);
  };

  const goPrevPage = () => {
    const idx = PAGE_INDEX[page];
    if (idx <= 0) return;
    goToPage(PAGE_ORDER[idx - 1]);
  };

  const goNextPage = () => {
    const idx = PAGE_INDEX[page];
    if (idx >= PAGE_ORDER.length - 1) return;
    goToPage(PAGE_ORDER[idx + 1]);
  };

  const isFirstPage = page === PAGE_ORDER[0];
  const isLastPage = page === PAGE_ORDER[PAGE_ORDER.length - 1];

  useEffect(() => {
    reanchorRef.current = true;
    draggedRef.current = false;
    setPage("ozet");
    setPageDirection(0);
    setSheetExpanded(true);
    setSheetDragging(false);
    setSheetSnapLock(false);
    sheetDraggingRef.current = false;
    sheetDragRef.current = null;
    sheetAnimRef.current?.stop();
    sheetAnimRef.current = null;
    setSnapLoading(true);
    setSnapshot(null);

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from(MUSTERI_SNAPSHOTLARI_TABLE)
        .select(
          "musteri_kodu, risk_durumu, toplam_teslimat_sayisi, toplam_tutar, toplam_agirlik, son_teslimattan_gecen_gun, son_teslimat_tarihi, onceki_risk_durumu, onceki_toplam_teslimat_sayisi, onceki_toplam_tutar, onceki_toplam_agirlik, onceki_son_teslimattan_gecen_gun, onceki_son_teslimat_tarihi, olusturuldu"
        )
        .eq("musteri_kodu", musteri.musteri_kodu)
        .order("olusturuldu", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.warn("[CustomerDetailPanel] snapshot:", error.message);
        setSnapshot(null);
      } else {
        setSnapshot((data as MusteriSnapshotRow | null) ?? null);
      }
      setSnapLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [musteri.musteri_kodu]);

  useLayoutEffect(() => {
    const el = pageMeasureRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = el.offsetHeight;
        if (next > 0) setPageContentHeight((h) => (h === next ? h : next));
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [page, snapshot, snapLoading, musteri.musteri_kodu, musteri.yas_toplam, musteri.belge_net_ciro, musteri.belge_top_urun, musteri.belge_son_urun]);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (sheetDraggingRef.current) return;
        const next = el.offsetHeight;
        setPanelHeight((h) => (h === next ? h : next));
        const compact =
          containerSize.width > 0 && containerSize.width < COMPACT_BREAKPOINT;
        if (!compact) return;
        const peek = peekChromeRef.current?.offsetHeight;
        if (peek && peek > 80) peekHRef.current = peek;
        if (sheetExpanded) {
          // Peek yüksekliğini expanded sanma (müşteri değişiminde kilitli height kalıntısı).
          if (next > peekHRef.current + 40) {
            expandedHRef.current = next;
          }
        } else {
          sheetH.set(peekHRef.current);
        }
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [musteri.musteri_kodu, sheetExpanded, containerSize.width, sheetH]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setContainerSize((prev) => {
          const width = el.clientWidth;
          const height = el.clientHeight;
          if (prev.width === width && prev.height === height) return prev;
          return { width, height };
        });
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [containerRef]);

  const containerW = containerSize.width;
  const containerH = containerSize.height;
  const isCompact = containerW > 0 && containerW < COMPACT_BREAKPOINT;
  const width = isCompact
    ? Math.max(0, containerW - EDGE_MARGIN * 2)
    : PANEL_WIDTH;
  /** Sürüklerken gövde mount kalsın — yükseklik clip ile küçülür. */
  const showSheetBody = !isCompact || sheetExpanded || sheetDragging;
  const sheetHeightConstrained =
    isCompact && (sheetDragging || !sheetExpanded || sheetSnapLock);

  // İlk açılış / müşteri değişimi: yerleşim. Sayfa geçişinde y'yi sıçratma.
  useLayoutEffect(() => {
    if (containerW <= 0 || containerH <= 0) return;

    // Mobil bottom-sheet: alta yaslı; yükseklik sheetH ile (sürükleme).
    if (isCompact) {
      posX.set(EDGE_MARGIN);
      reanchorRef.current = false;
      return;
    }

    if (draggedRef.current) return;

    if (reanchorRef.current) {
      const pos = computeAutoPosition({
        isCompact,
        anchor,
        containerW,
        containerH,
        panelHeight,
        panelWidth: width || PANEL_WIDTH,
      });
      // İlk açılışta anında yerleştir; müşteri değişiminde yumuşak kaydır.
      const firstOpen = posX.get() === 0 && posY.get() === 0;
      if (firstOpen) {
        posX.set(pos.left);
        posY.set(pos.top);
      } else {
        void animate(posX, pos.left, heightTween);
        void animate(posY, pos.top, heightTween);
      }
      reanchorRef.current = false;
      return;
    }

    const maxTop = Math.max(EDGE_MARGIN, containerH - panelHeight - EDGE_MARGIN);
    const current = posY.get();
    if (current > maxTop) {
      void animate(posY, maxTop, heightTween);
    }
  }, [
    musteri.musteri_kodu,
    anchor.x,
    anchor.y,
    containerW,
    containerH,
    panelHeight,
    width,
    isCompact,
    sheetExpanded,
    posX,
    posY,
  ]);

  const dragConstraints =
    containerW > 0 && containerH > 0
      ? {
          left: EDGE_MARGIN,
          top: EDGE_MARGIN,
          right: Math.max(EDGE_MARGIN, containerW - width - EDGE_MARGIN),
          bottom: Math.max(
            EDGE_MARGIN,
            containerH - panelHeight - EDGE_MARGIN
          ),
        }
      : undefined;

  const startDrag = (e: ReactPointerEvent) => {
    if (isCompact) return;
    dragControls.start(e);
  };

  const maxSheetHeight = () => {
    if (containerH <= 0) return expandedHRef.current;
    return Math.min(
      expandedHRef.current,
      Math.round(containerH * 0.85) - EDGE_MARGIN
    );
  };

  const snapSheetTo = (expand: boolean) => {
    const peek = peekHRef.current;
    const expanded = Math.max(maxSheetHeight(), peek + 80);
    const target = expand ? expanded : peek;
    sheetAnimRef.current?.stop();
    setSheetSnapLock(true);
    setSheetExpanded(expand);
    sheetDraggingRef.current = false;
    setSheetDragging(false);
    const controls = animate(sheetH, target, sheetSnapTween);
    sheetAnimRef.current = controls;
    void controls.then(() => {
      if (sheetAnimRef.current === controls) {
        sheetAnimRef.current = null;
        setSheetSnapLock(false);
      }
    });
  };

  const endSheetDrag = () => {
    const drag = sheetDragRef.current;
    sheetDragRef.current = null;
    if (!drag) {
      sheetDraggingRef.current = false;
      setSheetDragging(false);
      return;
    }

    const peek = peekHRef.current;
    const expanded = Math.max(maxSheetHeight(), peek + 80);
    const h = sheetH.get();
    const span = Math.max(expanded - peek, 1);
    const progress = (h - peek) / span; // 0 peek → 1 expanded
    const v = drag.velocity; // px/ms; + = parmak aşağı
    const flickDown = v > 0.45;
    const flickUp = v < -0.45;
    const expand = flickUp ? true : flickDown ? false : progress >= 0.45;
    snapSheetTo(expand);
  };

  const beginSheetDrag = (
    e: ReactPointerEvent<HTMLDivElement>,
    startH: number
  ) => {
    const panel = panelRef.current;
    if (!panel) return;

    e.preventDefault();
    panel.setPointerCapture(e.pointerId);

    sheetH.set(startH);
    sheetDraggingRef.current = true;
    setSheetDragging(true);
    if (!sheetExpanded) setSheetExpanded(true);

    const prev = sheetDragRef.current;
    sheetDragRef.current = {
      pointerId: e.pointerId,
      startX: prev?.startX ?? e.clientX,
      startY: prev?.startY ?? e.clientY,
      startH,
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
      mode: "sheet",
      scrollEl: null,
    };
  };

  const onSheetPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isCompact) return;
    if (e.button != null && e.button !== 0) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button']")) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) return;

    const peek = peekChromeRef.current?.offsetHeight ?? peekHRef.current;
    if (peek > 80) peekHRef.current = peek;
    if (sheetExpanded) {
      expandedHRef.current = Math.max(panel.offsetHeight, peek + 80);
    }

    const startH = sheetExpanded ? panel.offsetHeight : peekHRef.current;
    const scrollEl = target?.closest(
      "[data-sheet-scroll]"
    ) as HTMLElement | null;

    // Yön belli olana kadar bekle: dikey = sheet/scroll, yatay = sayfa.
    sheetDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startH,
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
      mode: "pending",
      scrollEl,
    };
  };

  const onSheetPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = sheetDragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;

    if (drag.mode === "scroll" || drag.mode === "page") return;

    if (drag.mode === "pending") {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx < 10 && ady < 10) return;

      // Yatay baskın → sayfa değiştir (yalnızca mobilde, açık kartta).
      if (sheetExpanded && adx > ady * 1.15) {
        drag.mode = "page";
        return;
      }

      const scrollTop = drag.scrollEl?.scrollTop ?? 0;
      if (scrollTop > 0 && ady >= adx) {
        drag.mode = "scroll";
        return;
      }

      // Dikey → sheet yüksekliği
      if (ady >= adx) {
        if (dy > 6 || !sheetExpanded) {
          beginSheetDrag(e, drag.startH);
        } else if (dy < -6) {
          drag.mode = "scroll";
        }
      }
      return;
    }

    if (drag.mode !== "sheet") return;

    const now = performance.now();
    const dt = Math.max(now - drag.lastT, 1);
    const dyFinger = e.clientY - drag.lastY;
    drag.velocity = dyFinger / dt;
    drag.lastY = e.clientY;
    drag.lastT = now;

    const peek = peekHRef.current;
    const expanded = Math.max(maxSheetHeight(), peek + 80);
    const next = Math.min(
      expanded,
      Math.max(peek, drag.startH - (e.clientY - drag.startY))
    );
    sheetH.set(next);
  };

  const onSheetPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = sheetDragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;

    if (drag.mode === "page") {
      const dx = e.clientX - drag.startX;
      sheetDragRef.current = null;
      if (dx <= -48) goNextPage();
      else if (dx >= 48) goPrevPage();
      return;
    }

    if (drag.mode !== "sheet") {
      // Peek'te kısa dokunuş → aç
      if (
        drag.mode === "pending" &&
        !sheetExpanded &&
        Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 10
      ) {
        sheetDragRef.current = null;
        snapSheetTo(true);
        return;
      }
      sheetDragRef.current = null;
      return;
    }

    const travel = Math.abs(e.clientY - drag.startY);
    if (travel < 10 && Math.abs(drag.velocity) < 0.2) {
      sheetDragRef.current = null;
      snapSheetTo(true);
      return;
    }
    endSheetDrag();
  };

  const onSheetPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = sheetDragRef.current;
    if (drag && e.pointerId !== drag.pointerId) return;
    if (drag?.mode === "sheet") endSheetDrag();
    else sheetDragRef.current = null;
  };

  const accent = RISK_COLORS[musteri.risk_durumu];
  const hicTeslimat = musteri.risk_durumu === "hic_teslimat_yok";
  const gecikmeGun = musteri.son_teslimattan_gecen_gun;
  const gecikmeYuzde =
    !hicTeslimat && gecikmeGun != null
      ? Math.min(Math.round((gecikmeGun / AKSIYON_GUN) * 100), 999)
      : null;

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-20"
      initial={{ opacity: 0, y: isCompact ? 64 : 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: isCompact ? "110%" : 120 }}
      transition={{
        y: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
      }}
    >
    <motion.div
      ref={panelRef}
      drag={!isCompact}
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={isCompact ? undefined : dragConstraints}
      dragElastic={0.08}
      dragMomentum={!isCompact}
      dragTransition={{
        power: 0.22,
        timeConstant: 220,
        bounceStiffness: 420,
        bounceDamping: 36,
      }}
      onDragStart={() => {
        if (isCompact) return;
        draggedRef.current = true;
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onPointerDown={isCompact ? onSheetPointerDown : undefined}
      onPointerMove={isCompact ? onSheetPointerMove : undefined}
      onPointerUp={isCompact ? onSheetPointerUp : undefined}
      onPointerCancel={isCompact ? onSheetPointerCancel : undefined}
      style={
        isCompact
          ? {
              x: posX,
              width,
              left: 0,
              top: "auto",
              bottom: EDGE_MARGIN,
              height: sheetHeightConstrained ? sheetH : undefined,
            }
          : { x: posX, y: posY, width, left: 0, top: 0 }
      }
      className={cn(
        "pointer-events-auto absolute flex max-h-[min(85dvh,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]",
        isCompact && "cursor-grab touch-pan-y",
        (dragging || sheetDragging) && "cursor-grabbing select-none touch-none"
      )}
      aria-label={
        isCompact
          ? sheetExpanded
            ? "Kartı küçültmek için aşağı kaydırın"
            : "Kartı büyütmek için yukarı kaydırın"
          : undefined
      }
    >
      <div ref={peekChromeRef} className="shrink-0">
        <div
          onPointerDown={(e) => {
            if (!isCompact) startDrag(e);
          }}
          className={cn(
            "flex flex-col items-center",
            isCompact
              ? "pt-2.5 pb-1"
              : "cursor-grab touch-none pt-2.5 pb-0 active:cursor-grabbing"
          )}
        >
          <span className="flex h-5 items-center justify-center text-muted-foreground/50">
            {isCompact ? (
              <span className="h-1 w-9 rounded-full bg-muted-foreground/35" />
            ) : (
              <GripHorizontalIcon className="size-4" />
            )}
          </span>
        </div>

        <div
          onPointerDown={(e) => {
            if (!isCompact) startDrag(e);
          }}
          className={cn(
            "flex items-start justify-between gap-3 px-4",
            !isCompact && "cursor-grab touch-none active:cursor-grabbing"
          )}
        >
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              {musteri.musteri_kodu}
              {musteri.sehir ? ` · ${musteri.sehir}` : ""}
              {musteri.ilce ? ` / ${musteri.ilce}` : ""}
            </p>
            <h2
              className={cn(
                "mt-1 text-sm leading-snug font-medium",
                !sheetExpanded && !sheetDragging
                  ? "line-clamp-1"
                  : "line-clamp-2"
              )}
            >
              {musteri.unvan}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Paneli kapat"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
          >
            <XIcon className="size-4 stroke-[2.5]" />
          </button>
        </div>

        <div
          className={cn(
            "px-4 pt-2.5",
            !sheetExpanded && !sheetDragging
              ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              : "pb-1"
          )}
        >
          <RiskPeekSummary
            accent={accent}
            riskLabel={riskLabels[musteri.risk_durumu]}
            gecikmeYuzde={gecikmeYuzde}
            hicTeslimat={hicTeslimat}
            gecikmeGun={gecikmeGun}
            sonTeslimatTarihi={musteri.son_teslimat_tarihi}
            compact
          />
        </div>
      </div>

      {showSheetBody && (
        <>
      <div
        data-sheet-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="px-4 pt-2">
          <SegmentBar
            className="mt-0.5"
            segments={24}
            value={gecikmeYuzde != null ? gecikmeYuzde / 100 : 0}
            color={accent}
            label={
              gecikmeYuzde != null
                ? `Gecikme eşiğinin %${gecikmeYuzde}'i`
                : "Teslimat kaydı yok"
            }
          />
        </div>

        <div className="mx-4 mt-3.5 flex items-center gap-2 border-t pt-1">
          <div className="relative min-h-[1rem] min-w-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait" custom={pageDirection} initial={false}>
              <motion.span
                key={page}
                custom={pageDirection}
                variants={titleSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-x-0 top-0 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase"
              >
                {PAGE_LABELS[page]}
              </motion.span>
            </AnimatePresence>
          </div>
          <TooltipProvider delay={280}>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-disabled={isFirstPage}
                  onClick={goPrevPage}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Önceki sayfa"
                  className={cn(
                    "flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    isFirstPage && "cursor-default opacity-30 hover:bg-transparent"
                  )}
                >
                  <ChevronLeftIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={6}
                  className="px-2 py-1 font-mono text-[10px] tracking-wide uppercase"
                >
                  {isFirstPage
                    ? PAGE_LABELS.ozet
                    : PAGE_LABELS[PAGE_ORDER[PAGE_INDEX[page] - 1]]}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-disabled={isLastPage}
                  onClick={goNextPage}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Sonraki sayfa"
                  className={cn(
                    "flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    isLastPage &&
                      "cursor-default opacity-30 hover:bg-transparent"
                  )}
                >
                  <ChevronRightIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={6}
                  className="px-2 py-1 font-mono text-[10px] tracking-wide uppercase"
                >
                  {isLastPage
                    ? PAGE_LABELS[PAGE_ORDER[PAGE_ORDER.length - 1]]
                    : PAGE_LABELS[PAGE_ORDER[PAGE_INDEX[page] + 1]]}
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>

        <motion.div
          initial={false}
          animate={{ height: pageContentHeight }}
          transition={heightTween}
          className="relative overflow-hidden"
        >
          <AnimatePresence initial={false} custom={pageDirection} mode="sync">
            {page === "ozet" ? (
              <motion.div
                key="ozet"
                ref={pageMeasureRef}
                custom={pageDirection}
                variants={pageSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={pageSlideTransition}
                className="absolute inset-x-0 top-0 w-full px-4 py-3.5"
              >
                <dl className="flex flex-col gap-2 text-xs">
                  <MetricRow
                    label="Son teslimat"
                    value={formatDate(musteri.son_teslimat_tarihi)}
                    strong
                  />
                  <MetricRow
                    label="İlk teslimat"
                    value={formatDate(musteri.ilk_teslimat_tarihi)}
                  />
                  {musteri.belge_top_urun && (
                    <MetricRow
                      label="En çok satılan"
                      value={musteri.belge_top_urun}
                    />
                  )}
                  {musteri.belge_son_urun && (
                    <MetricRow
                      label="Son satılan"
                      value={musteri.belge_son_urun}
                    />
                  )}
                  {musteri.son_teslimattan_gecen_gun != null && (
                    <MetricRow
                      label="Geçen gün"
                      value={`${formatNumber(musteri.son_teslimattan_gecen_gun)} gün`}
                    />
                  )}
                  <MetricRow
                    label="Teslimat sayısı"
                    value={formatNumber(musteri.toplam_teslimat_sayisi)}
                  />
                  <MetricRow
                    label="Toplam ciro"
                    value={formatCurrency(musteri.toplam_tutar)}
                    strong
                  />
                  <MetricRow
                    label="Toplam ağırlık"
                    value={formatKg(musteri.toplam_agirlik)}
                  />
                  {musteri.yas_toplam != null && (
                    <MetricRow
                      label="Gecikmeli borç"
                      value={formatCurrencyPrecise(Number(musteri.yas_toplam))}
                      strong
                    />
                  )}
                  <MetricRow
                    label="Müşteri durumu"
                    value={musteri.durum ?? "—"}
                  />
                  <MetricRow label="Rut" value={musteri.rut_kod ?? "—"} />
                  <MetricRow
                    label="Son veri güncelleme"
                    value={formatDateTime(musteri.guncellendi)}
                  />
                  {musteri.geocode_hassasiyet && (
                    <MetricRow
                      label="Konum"
                      value={HASSASIYET_LABELS[musteri.geocode_hassasiyet]}
                    />
                  )}
                </dl>
              </motion.div>
            ) : page === "ritim" ? (
              <motion.div
                key="ritim"
                ref={pageMeasureRef}
                custom={pageDirection}
                variants={pageSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={pageSlideTransition}
                className="absolute inset-x-0 top-0 w-full px-4 py-3.5"
              >
                <DegisimPage
                  musteri={musteri}
                  snapshot={snapshot}
                  loading={snapLoading}
                />
              </motion.div>
            ) : page === "borclar" ? (
              <motion.div
                key="borclar"
                ref={pageMeasureRef}
                custom={pageDirection}
                variants={pageSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={pageSlideTransition}
                className="absolute inset-x-0 top-0 w-full px-4 py-3.5"
              >
                <BorclarPage musteri={musteri} />
              </motion.div>
            ) : (
              <motion.div
                key="satis"
                ref={pageMeasureRef}
                custom={pageDirection}
                variants={pageSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={pageSlideTransition}
                className="absolute inset-x-0 top-0 w-full px-4 py-3.5"
              >
                <SatisPage musteri={musteri} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <div className="shrink-0 border-t bg-muted/30 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          disabled={!musteri.rut_kod}
          onClick={() => musteri.rut_kod && onShowRoute(musteri.rut_kod)}
        >
          Rotada göster
        </Button>
      </div>
        </>
      )}
    </motion.div>
    </motion.div>
  );
});

function RiskPeekSummary({
  accent,
  riskLabel,
  gecikmeYuzde,
  hicTeslimat,
  gecikmeGun,
  sonTeslimatTarihi,
  compact = false,
}: {
  accent: string;
  riskLabel: string;
  gecikmeYuzde: number | null;
  hicTeslimat: boolean;
  gecikmeGun: number | null | undefined;
  sonTeslimatTarihi: string | null | undefined;
  compact?: boolean;
}) {
  const teslimatLine =
    hicTeslimat || gecikmeGun == null
      ? "Kayıtlı teslimat yok"
      : sonTeslimatTarihi
        ? `Son teslimat ${formatDate(sonTeslimatTarihi)} · ${formatNumber(gecikmeGun)} gün önce · eşik ${AKSIYON_GUN}`
        : `Son teslimat ${formatNumber(gecikmeGun)} gün önce · eşik ${AKSIYON_GUN} gün`;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <span
            className="font-mono text-[11px] tracking-wide uppercase"
            style={{ color: accent }}
          >
            {riskLabel}
          </span>
        </span>
        {gecikmeYuzde != null && (
          <span
            className={cn(
              "font-mono font-semibold tabular-nums",
              compact ? "text-base" : "text-lg"
            )}
            style={{ color: accent }}
          >
            %{gecikmeYuzde}
          </span>
        )}
      </div>
      {!compact && (
        <SegmentBar
          className="mt-2"
          segments={24}
          value={gecikmeYuzde != null ? gecikmeYuzde / 100 : 0}
          color={accent}
          label={
            gecikmeYuzde != null
              ? `Gecikme eşiğinin %${gecikmeYuzde}'i`
              : "Teslimat kaydı yok"
          }
        />
      )}
      <p
        className={cn(
          "font-mono text-[10px] tracking-wide text-muted-foreground uppercase",
          compact ? "mt-1 line-clamp-2" : "mt-1.5"
        )}
      >
        {teslimatLine}
      </p>
    </>
  );
}

function BorclarPage({ musteri }: { musteri: MusteriHarita }) {
  if (musteri.yas_toplam == null) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        Henüz yaşlandırma verisi yok. Bir{" "}
        <span className="text-foreground">ST Yaşlandırma</span> dosyası
        yükledikten sonra gecikmeli borç kırılımı burada görünür.
      </p>
    );
  }

  const toplam = Number(musteri.yas_toplam);
  const riskliTutar = Number(musteri.yas_riskli_tutar ?? 0);
  const riskli = Boolean(musteri.borc_riskli);
  const risksizTutar = Math.max(0, Math.round((toplam - riskliTutar) * 100) / 100);

  return (
    <div className="space-y-3.5">
      {riskli && (
        <div
          className="rounded-lg px-3 py-2"
          style={{
            background: `color-mix(in oklab, ${RISK_COLORS.riskli} 14%, transparent)`,
          }}
        >
          <p
            className="font-mono text-[10px] tracking-[0.12em] uppercase"
            style={{ color: RISK_COLORS.riskli }}
          >
            Riskli — 60+ hafta
          </p>
          <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
            {formatCurrencyPrecise(riskliTutar)}
          </p>
        </div>
      )}

      <dl className="flex flex-col gap-2 text-xs">
        <MetricRow
          label="Gecikmeli borç"
          value={formatCurrencyPrecise(toplam)}
          strong
        />
        <MetricRow
          label="Risk durumu"
          value={riskli ? "Riskli" : "Normal"}
        />
        <MetricRow
          label="Riskli borç (60+ hafta)"
          value={
            riskliTutar > 0.005
              ? formatCurrencyPrecise(riskliTutar)
              : "—"
          }
        />
        <MetricRow
          label="Risksiz borç (60 hafta altı)"
          value={
            risksizTutar > 0.005
              ? formatCurrencyPrecise(risksizTutar)
              : "—"
          }
        />
        {YAS_BUCKET_FIELDS.map(({ field, label }) => {
          const amount = Number(musteri[field] ?? 0);
          const isRiskBand =
            field === "hf_56_62" ||
            field === "hf_63_69" ||
            field === "hf_70_ustu";
          return (
            <MetricRow
              key={label}
              label={`${label} hafta${isRiskBand ? " · risk" : ""}`}
              value={
                amount > 0.005 ? formatCurrencyPrecise(amount) : "—"
              }
            />
          );
        })}
        <MetricRow label="ST" value={musteri.yas_st?.trim() || "—"} />
      </dl>
    </div>
  );
}

function formatDonem(
  bas: string | null | undefined,
  bit: string | null | undefined
): string {
  if (!bas && !bit) return "—";
  if (bas && bit && bas !== bit) {
    return `${formatDate(bas)} – ${formatDate(bit)}`;
  }
  return formatDate(bas ?? bit ?? null);
}

function SatisPage({ musteri }: { musteri: MusteriHarita }) {
  if (musteri.belge_net_ciro == null && musteri.belge_satir_sayisi == null) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        Henüz satış belgesi yok. Bir{" "}
        <span className="text-foreground">BelgeDetayRaporu</span> dosyası
        yükledikten sonra dönem satış özeti burada görünür.
      </p>
    );
  }

  return (
    <dl className="flex flex-col gap-2 text-xs">
      <MetricRow
        label="Dönem"
        value={formatDonem(musteri.belge_donem_bas, musteri.belge_donem_bit)}
      />
      <MetricRow
        label="Net ciro"
        value={formatCurrencyPrecise(Number(musteri.belge_net_ciro ?? 0))}
        strong
      />
      <MetricRow
        label="Brüt ciro"
        value={formatCurrencyPrecise(Number(musteri.belge_brut_ciro ?? 0))}
      />
      <MetricRow
        label="İskonto"
        value={formatCurrencyPrecise(Number(musteri.belge_iskonto_toplam ?? 0))}
      />
      <MetricRow
        label="Son işlem"
        value={formatDate(musteri.belge_son_islem_tarihi ?? null)}
        strong
      />
      {musteri.belge_vade_gunu != null && (
        <MetricRow
          label="Vade"
          value={`${formatNumber(musteri.belge_vade_gunu)} gün`}
        />
      )}
      <MetricRow
        label="Sipariş"
        value={formatNumber(musteri.belge_siparis_sayisi ?? 0)}
      />
      <MetricRow
        label="Fatura"
        value={formatNumber(musteri.belge_fatura_sayisi ?? 0)}
      />
      <MetricRow
        label="Satır"
        value={formatNumber(musteri.belge_satir_sayisi ?? 0)}
      />
      <MetricRow
        label="Promosyon satır"
        value={formatNumber(musteri.belge_promo_satir ?? 0)}
      />
      {(musteri.belge_iptal_satir ?? 0) > 0 && (
        <MetricRow
          label="İptal satır"
          value={formatNumber(musteri.belge_iptal_satir ?? 0)}
        />
      )}
      {musteri.belge_top_urun && (
        <MetricRow label="En çok ürün" value={musteri.belge_top_urun} />
      )}
      {musteri.belge_son_urun && (
        <MetricRow label="Son ürün" value={musteri.belge_son_urun} />
      )}
      {musteri.belge_top_urun_grup && (
        <MetricRow label="En çok marka" value={musteri.belge_top_urun_grup} />
      )}
      {musteri.belge_son_urun_grup && (
        <MetricRow label="Son marka" value={musteri.belge_son_urun_grup} />
      )}
      {musteri.belge_st_adi && (
        <MetricRow
          label="ST"
          value={
            musteri.belge_st_kodu
              ? `${musteri.belge_st_adi} (${musteri.belge_st_kodu})`
              : musteri.belge_st_adi
          }
        />
      )}
    </dl>
  );
}

function DegisimPage({
  musteri,
  snapshot,
  loading,
}: {
  musteri: MusteriHarita;
  snapshot: MusteriSnapshotRow | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        Ritim yükleniyor…
      </p>
    );
  }

  const onceki: SnapshotMetrics | null =
    snapshot?.onceki_risk_durumu != null
      ? {
          risk_durumu: snapshot.onceki_risk_durumu,
          toplam_teslimat_sayisi: snapshot.onceki_toplam_teslimat_sayisi ?? 0,
          toplam_tutar: Number(snapshot.onceki_toplam_tutar ?? 0),
          toplam_agirlik: Number(snapshot.onceki_toplam_agirlik ?? 0),
          son_teslimattan_gecen_gun: snapshot.onceki_son_teslimattan_gecen_gun,
          son_teslimat_tarihi: snapshot.onceki_son_teslimat_tarihi,
        }
      : null;

  const yeni: SnapshotMetrics = snapshot
    ? {
        risk_durumu: snapshot.risk_durumu,
        toplam_teslimat_sayisi: snapshot.toplam_teslimat_sayisi,
        toplam_tutar: Number(snapshot.toplam_tutar),
        toplam_agirlik: Number(snapshot.toplam_agirlik),
        son_teslimattan_gecen_gun: snapshot.son_teslimattan_gecen_gun,
        son_teslimat_tarihi: snapshot.son_teslimat_tarihi,
      }
    : {
        risk_durumu: musteri.risk_durumu,
        toplam_teslimat_sayisi: musteri.toplam_teslimat_sayisi,
        toplam_tutar: musteri.toplam_tutar,
        toplam_agirlik: musteri.toplam_agirlik,
        son_teslimattan_gecen_gun: musteri.son_teslimattan_gecen_gun,
        son_teslimat_tarihi: musteri.son_teslimat_tarihi,
      };

  const sonuc = evaluateMusteriForm(onceki, yeni);
  const formColor = FORM_COLORS[sonuc.form];
  const olayColor = OLAY_COLORS[sonuc.olay];
  const mesafe = esigeKalanGun(yeni.son_teslimattan_gecen_gun);
  const bandDegisti =
    onceki != null && onceki.risk_durumu !== yeni.risk_durumu;

  if (!onceki) {
    return (
      <div className="space-y-3.5">
        <FormHeader sonuc={sonuc} formColor={formColor} olayColor={olayColor} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Henüz önceki sevkiyat yüklemesi yok. Bir{" "}
          <span className="text-foreground">SevkiyatRaporuKup</span> dosyası
          yükledikten sonra kazanım / uyarı / aksiyon olayları burada görünür.
        </p>
        <BaskiBar baski={sonuc.baski} color={formColor} />
        <dl className="flex flex-col gap-2 text-xs">
          <MetricRow
            label="Son teslimat"
            value={formatDate(yeni.son_teslimat_tarihi)}
            strong
          />
          {musteri.ilk_teslimat_tarihi && (
            <MetricRow
              label="İlk teslimat"
              value={formatDate(musteri.ilk_teslimat_tarihi)}
            />
          )}
          {yeni.son_teslimattan_gecen_gun != null && (
            <MetricRow
              label="Geçen gün"
              value={`${formatNumber(yeni.son_teslimattan_gecen_gun)} gün`}
            />
          )}
        </dl>
        {mesafe != null && (
          <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Eşiğe {formatNumber(mesafe.kalan)} gün · hedef {mesafe.hedef}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <FormHeader sonuc={sonuc} formColor={formColor} olayColor={olayColor} />
      <BaskiBar baski={sonuc.baski} color={formColor} />
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {sonuc.mesaj}
        {sonuc.xp > 0 ? ` · +${sonuc.xp} XP` : ""}
        {sonuc.streak > 0 ? ` · streak ${sonuc.streak}` : ""}
      </p>

      {bandDegisti && (
        <RiskMiniBar
          onceki={onceki.risk_durumu}
          yeni={yeni.risk_durumu}
          label="Risk geçişi"
        />
      )}

      <dl className="flex flex-col gap-2 text-xs">
        <MetricRow
          label="Son teslimat"
          value={formatDate(yeni.son_teslimat_tarihi)}
          strong
        />
        {onceki?.son_teslimat_tarihi &&
          onceki.son_teslimat_tarihi !== yeni.son_teslimat_tarihi && (
            <ChangeRow
              label="Önceki tarih"
              from={formatDate(onceki.son_teslimat_tarihi)}
              to={formatDate(yeni.son_teslimat_tarihi)}
            />
          )}
        <MetricRow
          label="Durum"
          value={`${FORM_LABELS[formDurumu(onceki)]} → ${FORM_LABELS[sonuc.form]}`}
        />
        <MetricRow
          label="Gün"
          value={
            mesafe != null
              ? `${formatNumber(yeni.son_teslimattan_gecen_gun ?? 0)} · eşiğe ${formatNumber(mesafe.kalan)}`
              : yeni.son_teslimattan_gecen_gun != null
                ? `${formatNumber(yeni.son_teslimattan_gecen_gun)} · eşik aşıldı`
                : "—"
          }
        />
        <ChangeRow
          label="Ciro"
          from={formatCurrency(onceki.toplam_tutar)}
          to={formatCurrency(yeni.toplam_tutar)}
          strong
        />
        <ChangeRow
          label="Teslimat"
          from={formatNumber(onceki.toplam_teslimat_sayisi)}
          to={formatNumber(yeni.toplam_teslimat_sayisi)}
        />
        <ChangeRow
          label="Ağırlık"
          from={formatKg(onceki.toplam_agirlik)}
          to={formatKg(yeni.toplam_agirlik)}
        />
      </dl>
    </div>
  );
}

function FormHeader({
  sonuc,
  formColor,
  olayColor,
}: {
  sonuc: ReturnType<typeof evaluateMusteriForm>;
  formColor: string;
  olayColor: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="inline-flex flex-col gap-0.5">
        <span
          className="font-mono text-[11px] tracking-wide uppercase"
          style={{ color: formColor }}
        >
          {FORM_LABELS[sonuc.form]}
        </span>
        <span
          className="font-mono text-[10px] tracking-wide uppercase"
          style={{ color: olayColor }}
        >
          {OLAY_LABELS[sonuc.olay]}
        </span>
      </span>
      <span
        className="font-mono text-lg font-semibold tabular-nums"
        style={{ color: formColor }}
      >
        %{Math.round(sonuc.baski * 100)}
      </span>
    </div>
  );
}

function BaskiBar({ baski, color }: { baski: number; color: string }) {
  return (
    <div>
      <SegmentBar
        segments={24}
        value={baski}
        color={color}
        label={`Baskı %${Math.round(baski * 100)} — eşiğe yaklaşma`}
      />
      <p className="mt-1.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        Baskı · eşiğe yaklaşma (ceza değil)
      </p>
    </div>
  );
}

/** RiskDagilim tarzı ayrık blok bar — önceki → yeni risk vurgusu. */
function RiskMiniBar({
  onceki,
  yeni,
  label,
}: {
  onceki: RiskDurumu | null;
  yeni: RiskDurumu;
  label: string;
}) {
  const TOTAL = 24;
  const colors: string[] = Array(TOTAL).fill("var(--secondary)");

  if (onceki && onceki !== yeni) {
    const half = Math.floor(TOTAL / 2);
    for (let i = 0; i < half; i++) colors[i] = RISK_COLORS[onceki];
    for (let i = half; i < TOTAL; i++) colors[i] = RISK_COLORS[yeni];
  } else {
    for (let i = 0; i < TOTAL; i++) colors[i] = RISK_COLORS[yeni];
  }

  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <div className="flex gap-[2px]" role="img" aria-label={label}>
        {colors.map((color, i) => (
          <span
            key={i}
            className="h-1.5 min-w-0 flex-1 rounded-[1px] transition-colors duration-300 ease-out"
            style={{ backgroundColor: color, transitionDelay: `${Math.min(i, 10) * 6}ms` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {RISK_ORDER.filter((r) => r === onceki || r === yeni).map((risk) => (
          <span
            key={risk}
            className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground"
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: RISK_COLORS[risk] }}
            />
            {RISK_SHORT_LABELS[risk]}
            {onceki && onceki !== yeni
              ? risk === onceki
                ? " (önce)"
                : " (şimdi)"
              : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChangeRow({
  label,
  from,
  to,
  strong,
}: {
  label: string;
  from: string;
  to: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right font-mono tabular-nums",
          strong && "font-semibold"
        )}
      >
        <span className="text-muted-foreground">{from}</span>
        <span className="mx-1 text-muted-foreground/60">→</span>
        <span>{to}</span>
      </dd>
    </div>
  );
}

function computeAutoPosition({
  isCompact,
  anchor,
  containerW,
  containerH,
  panelHeight,
  panelWidth,
}: {
  isCompact: boolean;
  anchor: PanelAnchor;
  containerW: number;
  containerH: number;
  panelHeight: number;
  panelWidth: number;
}): { left: number; top: number } {
  if (isCompact) {
    return {
      left: EDGE_MARGIN,
      top: Math.max(EDGE_MARGIN, containerH - panelHeight - EDGE_MARGIN),
    };
  }

  let left = anchor.x + ANCHOR_GAP;
  if (containerW > 0 && left + panelWidth + EDGE_MARGIN > containerW) {
    left = anchor.x - ANCHOR_GAP - panelWidth;
  }
  left = clamp(
    left,
    EDGE_MARGIN,
    Math.max(EDGE_MARGIN, containerW - panelWidth - EDGE_MARGIN)
  );

  let top = anchor.y - panelHeight * 0.4;
  top = clamp(
    top,
    EDGE_MARGIN,
    Math.max(EDGE_MARGIN, containerH - panelHeight - EDGE_MARGIN)
  );

  return { left, top };
}

function MetricRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={
          strong
            ? "truncate text-right font-mono font-semibold tabular-nums"
            : "truncate text-right font-mono tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}

const YAS_BUCKET_FIELDS: Array<{
  field: keyof MusteriHarita;
  label: string;
}> = [
  { field: "hf_01_06", label: "01-06" },
  { field: "hf_07_13", label: "07-13" },
  { field: "hf_14_20", label: "14-20" },
  { field: "hf_21_27", label: "21-27" },
  { field: "hf_28_34", label: "28-34" },
  { field: "hf_35_41", label: "35-41" },
  { field: "hf_42_48", label: "42-48" },
  { field: "hf_49_55", label: "49-55" },
  { field: "hf_56_62", label: "56-62" },
  { field: "hf_63_69", label: "63-69" },
  { field: "hf_70_ustu", label: "70+" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
