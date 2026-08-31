"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export type BrushSelection = { start: number; end: number };

export type BrushLayout = {
  /** Etkileşimin kaynağı — sürükleme matematiği ve seçili gün aralığı buradan. */
  selection: BrushSelection;
  /**
   * Çizim için yumuşatılmış seçim. Fırça ve ana grafik bunu kullanır; ikisi de
   * aynı tween'i okuduğu için birlikte kayarlar.
   */
  renderSelection: BrushSelection;
  onBrushSelectionChange: (selection: BrushSelection) => void;
  startIndex: number;
  endIndex: number;
  xDomainSlotCount: number;
};

type DragKind = "left" | "right" | "move" | "create";

/**
 * Time-range brush overlay. Parent must size this to the plot (not the axis
 * padding). `start`/`end` are 0–1 along the x-axis.
 */
export function ChartBrush({
  selection,
  renderSelection,
  onSelectionChange,
  blurPx = 1.5,
  fadeOuterEdges = true,
  minSpan = 0.08,
  useWindowMoveEvents = true,
}: {
  selection: BrushSelection;
  /** Boyama için yumuşatılmış değer; verilmezse `selection` kullanılır. */
  renderSelection?: BrushSelection;
  onSelectionChange: (selection: BrushSelection) => void;
  blurPx?: number;
  fadeOuterEdges?: boolean;
  minSpan?: number;
  useWindowMoveEvents?: boolean;
}) {
  // Sürükleme her zaman ham seçimden hesaplanır — tutamacı yakaladığın an
  // tween'in ortasındaki bir değere yapışmasın.
  const start = clamp01(Math.min(selection.start, selection.end));
  const end = clamp01(Math.max(selection.start, selection.end));
  const paint = renderSelection ?? selection;
  const paintStart = clamp01(Math.min(paint.start, paint.end));
  const paintEnd = clamp01(Math.max(paint.start, paint.end));
  const dragRef = useRef<{
    kind: DragKind;
    originX: number;
    originStart: number;
    originEnd: number;
  } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onSelectionChange);
  onChangeRef.current = onSelectionChange;
  const stopDragRef = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);

  const fracFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  }, []);

  const applyDrag = useCallback(
    (clientX: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const frac = fracFromClientX(clientX);
      const span = Math.max(minSpan, 0.02);
      let nextStart = drag.originStart;
      let nextEnd = drag.originEnd;
      if (drag.kind === "left") {
        nextStart = Math.min(frac, drag.originEnd - span);
      } else if (drag.kind === "right") {
        nextEnd = Math.max(frac, drag.originStart + span);
      } else if (drag.kind === "move") {
        const width = drag.originEnd - drag.originStart;
        const delta = frac - drag.originX;
        nextStart = clamp01(drag.originStart + delta);
        nextEnd = nextStart + width;
        if (nextEnd > 1) {
          nextEnd = 1;
          nextStart = 1 - width;
        }
      } else if (frac < drag.originX) {
        nextStart = frac;
        nextEnd = Math.max(drag.originX, frac + span);
      } else {
        nextStart = Math.min(drag.originX, frac - span);
        nextEnd = frac;
      }
      if (nextEnd - nextStart < span) {
        if (drag.kind === "left" || (drag.kind === "create" && frac < drag.originX)) {
          nextStart = nextEnd - span;
        } else {
          nextEnd = nextStart + span;
        }
      }
      onChangeRef.current({
        start: clamp01(nextStart),
        end: clamp01(nextEnd),
      });
    },
    [fracFromClientX, minSpan]
  );

  const applyDragRef = useRef(applyDrag);
  applyDragRef.current = applyDrag;

  const lastTapRef = useRef(0);

  const beginDrag = (kind: DragKind, clientX: number) => {
    const now = performance.now();
    if ((kind === "create" || kind === "move") && now - lastTapRef.current < 380) {
      stopDragRef.current?.();
      lastTapRef.current = 0;
      onChangeRef.current({ start: 0, end: 1 });
      return;
    }
    lastTapRef.current = now;
    stopDragRef.current?.();
    dragRef.current = {
      kind,
      originX: fracFromClientX(clientX),
      originStart: start,
      originEnd: end,
    };
    setDragging(true);
    applyDragRef.current(clientX);

    // Window | HTMLDivElement birleşiminde addEventListener imzası taban
    // EventListener'a düşüyor; işleyicileri EventTarget seviyesinde tutuyoruz.
    const move: EventListener = (event) => {
      event.preventDefault();
      applyDragRef.current((event as PointerEvent).clientX);
    };
    const up: EventListener = () => stop();
    const target: EventTarget = useWindowMoveEvents
      ? window
      : trackRef.current ?? window;
    const stop = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      dragRef.current = null;
      setDragging(false);
      stopDragRef.current = null;
    };
    stopDragRef.current = stop;
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  useEffect(() => () => stopDragRef.current?.(), []);

  const leftPct = `${paintStart * 100}%`;
  const widthPct = `${(paintEnd - paintStart) * 100}%`;
  const blur = Math.max(0, Math.min(5, blurPx));

  return (
    <div
      ref={trackRef}
      className={cn(
        "absolute inset-0 touch-none select-none",
        dragging && "cursor-grabbing"
      )}
      role="group"
      aria-label="Tarih aralığı fırçası"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        beginDrag("create", event.clientX);
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        onSelectionChange({ start: 0, end: 1 });
      }}
    >
      <Dim side="left" width={leftPct} fade={fadeOuterEdges} blur={blur} />
      <Dim
        side="right"
        width={`${(1 - paintEnd) * 100}%`}
        fade={fadeOuterEdges}
        blur={blur}
      />

      <div
        className={cn(
          "absolute inset-y-0 cursor-grab",
          dragging && "cursor-grabbing"
        )}
        style={{ left: leftPct, width: widthPct }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          beginDrag("move", event.clientX);
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: "color-mix(in oklab, var(--chart-1) 10%, transparent)",
          }}
        />
      </div>

      <Handle
        pct={leftPct}
        dragging={dragging}
        label="Aralık başlangıcı"
        onPointerDown={(clientX) => beginDrag("left", clientX)}
      />
      <Handle
        pct={`${paintEnd * 100}%`}
        dragging={dragging}
        label="Aralık bitişi"
        onPointerDown={(clientX) => beginDrag("right", clientX)}
      />
    </div>
  );
}

function Dim({
  side,
  width,
  fade,
  blur,
}: {
  side: "left" | "right";
  width: string;
  fade: boolean;
  blur: number;
}) {
  const mask =
    side === "left"
      ? "linear-gradient(to right, transparent, black 14%)"
      : "linear-gradient(to left, transparent, black 14%)";
  return (
    <div
      className="pointer-events-none absolute inset-y-0 bg-background/65"
      style={{
        [side]: 0,
        width,
        backdropFilter: blur > 0 ? `blur(${blur}px)` : undefined,
        WebkitBackdropFilter: blur > 0 ? `blur(${blur}px)` : undefined,
        maskImage: fade ? mask : undefined,
        WebkitMaskImage: fade ? mask : undefined,
      }}
    />
  );
}

function Handle({
  pct,
  dragging,
  label,
  onPointerDown,
}: {
  pct: string;
  dragging: boolean;
  label: string;
  onPointerDown: (clientX: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "absolute top-0 bottom-0 z-10 flex w-4 -translate-x-1/2 cursor-ew-resize items-center justify-center border-0 bg-transparent p-0",
        dragging && "cursor-grabbing"
      )}
      style={{ left: pct }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        onPointerDown(event.clientX);
      }}
    >
      <span
        className="h-full w-px"
        style={{ background: "var(--chart-brush-border, var(--foreground))" }}
      />
      <span className="absolute left-1/2 top-1/2 h-7 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-background shadow-sm" />
    </button>
  );
}

export function ChartBrushLayout({
  pointCount,
  enabled,
  height,
  className,
  children,
  brushStrip,
}: {
  pointCount: number;
  enabled: boolean;
  height: number;
  className?: string;
  children: (layout: BrushLayout) => ReactNode;
  brushStrip: (layout: BrushLayout) => ReactNode;
}) {
  const n = Math.max(2, pointCount);
  const [selection, setSelection] = useState<BrushSelection>(() => lastWindow(n));
  const reduced = useReducedMotion();
  const renderSelection = useTweenedSelection(selection, Boolean(reduced));

  useEffect(() => {
    setSelection((prev) => clampSelection(prev, n));
  }, [n]);

  const layout: BrushLayout = {
    selection,
    renderSelection,
    onBrushSelectionChange: setSelection,
    startIndex: Math.round(selection.start * (n - 1)),
    endIndex: Math.round(selection.end * (n - 1)),
    xDomainSlotCount: n,
  };

  if (!enabled) {
    return <div className={className}>{children(fullLayout(n))}</div>;
  }

  return (
    <div className={className}>
      {children(layout)}
      <div className="relative shrink-0" style={{ height }}>
        {brushStrip(layout)}
      </div>
    </div>
  );
}

/**
 * Seçimi hedefine doğru yumuşatır. Fırça ve ana grafik aynı çıktıyı okuduğu
 * için birlikte kayarlar; sürükleme bırakıldığında pencere zıplamak yerine
 * yerine oturur.
 */
function useTweenedSelection(
  target: BrushSelection,
  reduced: boolean
): BrushSelection {
  const [render, setRender] = useState(target);
  // `start`/`end` yerine a/b: GSAP vars'inda ad cakismasi riski kalmasin.
  const proxyRef = useRef({ a: target.start, b: target.end });

  useLayoutEffect(() => {
    if (reduced) {
      proxyRef.current = { a: target.start, b: target.end };
      return;
    }
    const p = proxyRef.current;
    const tween = gsap.to(p, {
      a: target.start,
      b: target.end,
      // Kısa tutuluyor: tutamaç imlecin altından kaçmasın ama pencere de
      // gün gün zıplamasın.
      duration: 0.18,
      ease: "power2.out",
      overwrite: true,
      onUpdate: () => setRender({ start: p.a, end: p.b }),
    });
    return () => {
      tween.kill();
    };
  }, [target.start, target.end, reduced]);

  return reduced ? target : render;
}

function lastWindow(n: number): BrushSelection {
  const days = Math.min(21, n);
  const start = (n - days) / Math.max(1, n - 1);
  return { start, end: 1 };
}

function fullLayout(n: number): BrushLayout {
  return {
    selection: { start: 0, end: 1 },
    renderSelection: { start: 0, end: 1 },
    onBrushSelectionChange: () => {},
    startIndex: 0,
    endIndex: n - 1,
    xDomainSlotCount: n,
  };
}

function clampSelection(sel: BrushSelection, n: number): BrushSelection {
  const minSpan =
    Math.max(2, Math.min(7, Math.round(n * 0.05))) / Math.max(1, n - 1);
  let start = clamp01(sel.start);
  let end = clamp01(sel.end);
  if (end - start < minSpan) end = clamp01(start + minSpan);
  return { start, end };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
