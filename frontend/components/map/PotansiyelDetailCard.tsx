"use client";

import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  GripHorizontalIcon,
  MapPinnedIcon,
  XIcon,
} from "lucide-react";
import { animate, motion, useDragControls, useMotionValue } from "motion/react";
import { Typography } from "@heroui/react";

import type { PanelAnchor } from "@/components/map/CustomerDetailPanel";
import { EntityNotesButton } from "@/components/map/EntityNotesButton";
import { FavoriHeartButton } from "@/components/map/FavoriHeartButton";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { PotansiyelHarita } from "@/lib/types";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 304;
const ANCHOR_GAP = 18;
const EDGE_MARGIN = 12;
const COMPACT_BREAKPOINT = 640;

const heightTween = {
  type: "tween" as const,
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const,
};

const TYPE_LABELS: Record<string, string> = {
  pet_store: "Petshop",
  veterinary_care: "Veteriner",
  pet_care: "Pet bakım",
  store: "Mağaza",
  manufacturer: "Üretici",
  liquor_store: "İçki marketi",
  supermarket: "Süpermarket",
  grocery_store: "Market",
  general_store: "Genel mağaza",
  food_store: "Gıda mağazası",
  pharmacy: "Eczane",
  convenience_store: "Bakkal",
};

/** Google Places gürültü tipleri — kartta gösterme. */
const NOISE_TYPES = new Set([
  "point_of_interest",
  "establishment",
  "food",
  "health",
]);

function typeLabel(primary: string | null): string {
  if (!primary) return "—";
  return TYPE_LABELS[primary] ?? primary.replace(/_/g, " ");
}

function secondaryTypes(
  primary: string | null,
  types: string[] | null
): string[] {
  if (!types?.length) return [];
  return types
    .filter((t) => t !== primary && !NOISE_TYPES.has(t))
    .slice(0, 4)
    .map((t) => typeLabel(t));
}

/** Google Maps — place_id varsa derin link, yoksa koordinat. */
export function googleMapsUrl(p: PotansiyelHarita): string {
  if (p.kaynak_id) {
    const q = encodeURIComponent(p.isim ?? p.adres ?? "Konum");
    return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${encodeURIComponent(p.kaynak_id)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
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

interface PotansiyelDetailCardProps {
  potansiyel: PotansiyelHarita;
  anchor: PanelAnchor;
  containerRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  /** Haritadan gizlendi mi (geri alınabilir). */
  isGizlenen?: boolean;
  onToggleGizle?: (potansiyel: PotansiyelHarita) => void | Promise<void>;
  /** Ortak "sonra bak" listesinde mi. */
  isFavori?: boolean;
  favoriNot?: string | null;
  onToggleFavori?: (potansiyel: PotansiyelHarita) => void | Promise<void>;
  onUpdateFavoriNot?: (
    potansiyel: PotansiyelHarita,
    notMetni: string | null
  ) => void | Promise<void>;
}

export const PotansiyelDetailCard = memo(function PotansiyelDetailCard({
  potansiyel,
  anchor,
  containerRef,
  onClose,
  isGizlenen = false,
  onToggleGizle,
  isFavori = false,
  favoriNot = null,
  onToggleFavori,
  onUpdateFavoriNot,
}: PotansiyelDetailCardProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const reanchorRef = useRef(true);
  const draggedRef = useRef(false);
  const dragControls = useDragControls();
  const [panelHeight, setPanelHeight] = useState(260);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [hideError, setHideError] = useState<string | null>(null);
  const [favoriBusy, setFavoriBusy] = useState(false);
  const [favoriError, setFavoriError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState(favoriNot ?? "");
  const [noteSaving, setNoteSaving] = useState(false);
  const noteTimerRef = useRef(0);
  const posX = useMotionValue(0);
  const posY = useMotionValue(0);

  useEffect(() => {
    reanchorRef.current = true;
    draggedRef.current = false;
    setHiding(false);
    setHideError(null);
    setFavoriBusy(false);
    setFavoriError(null);
    setNoteDraft(favoriNot ?? "");
  }, [potansiyel.id, anchor.x, anchor.y, favoriNot]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setContainerSize({ width: r.width, height: r.height });
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

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    if (h > 0) setPanelHeight(h);
  }, [
    potansiyel.id,
    potansiyel.google_types,
    potansiyel.kalite_bayragi,
    isFavori,
    noteDraft,
    favoriError,
    hideError,
  ]);

  const containerW = containerSize.width;
  const containerH = containerSize.height;
  const isCompact = containerW > 0 && containerW < COMPACT_BREAKPOINT;
  const width = isCompact
    ? Math.max(0, containerW - EDGE_MARGIN * 2)
    : PANEL_WIDTH;

  useLayoutEffect(() => {
    if (containerW <= 0 || containerH <= 0) return;

    if (isCompact) {
      posX.set(EDGE_MARGIN);
      const top = Math.max(EDGE_MARGIN, containerH - panelHeight - EDGE_MARGIN);
      posY.set(top);
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
    potansiyel.id,
    anchor.x,
    anchor.y,
    containerW,
    containerH,
    panelHeight,
    width,
    isCompact,
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

  const place = [potansiyel.ilce, potansiyel.il].filter(Boolean).join(", ");
  const extras = useMemo(
    () => secondaryTypes(potansiyel.primary_type, potansiyel.google_types),
    [potansiyel.primary_type, potansiyel.google_types]
  );
  const mapsHref = useMemo(() => googleMapsUrl(potansiyel), [potansiyel]);

  const handleToggleGizle = async () => {
    if (!onToggleGizle || hiding) return;
    setHiding(true);
    setHideError(null);
    try {
      await onToggleGizle(potansiyel);
    } catch (err) {
      setHideError(
        err instanceof Error ? err.message : "Gizleme güncellenemedi"
      );
    } finally {
      setHiding(false);
    }
  };

  const handleToggleFavori = async () => {
    if (!onToggleFavori || favoriBusy) return;
    setFavoriBusy(true);
    setFavoriError(null);
    try {
      await onToggleFavori(potansiyel);
    } catch (err) {
      setFavoriError(
        err instanceof Error ? err.message : "Favori güncellenemedi"
      );
    } finally {
      setFavoriBusy(false);
    }
  };

  const handleNoteChange = (value: string) => {
    setNoteDraft(value);
    if (!onUpdateFavoriNot || !isFavori) return;
    window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(() => {
      const trimmed = value.trim().slice(0, 280);
      const next = trimmed || null;
      if (next === (favoriNot ?? null)) return;
      setNoteSaving(true);
      void Promise.resolve(onUpdateFavoriNot(potansiyel, next))
        .catch((err) => {
          setFavoriError(
            err instanceof Error ? err.message : "Not kaydedilemedi"
          );
        })
        .finally(() => setNoteSaving(false));
    }, 450);
  };

  useEffect(() => {
    return () => window.clearTimeout(noteTimerRef.current);
  }, []);

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
        style={{ x: posX, y: posY, width, left: 0, top: 0 }}
        className={cn(
          "pointer-events-auto absolute flex max-h-[min(85dvh,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]",
          isCompact && "max-h-[min(55dvh,24rem)] overflow-y-auto",
          dragging && "cursor-grabbing select-none touch-none"
        )}
      >
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
              Potansiyel
              {place ? ` · ${place}` : ""}
            </p>
            <Typography.Heading level={6} className="mt-1 line-clamp-2">
              {potansiyel.isim ?? "İsimsiz"}
            </Typography.Heading>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <EntityNotesButton
              entityKind="potansiyel"
              potansiyelId={potansiyel.id}
            />
            {onToggleFavori ? (
              <FavoriHeartButton
                active={isFavori}
                busy={favoriBusy}
                onToggle={() => void handleToggleFavori()}
              />
            ) : null}
            {onToggleGizle ? (
              <button
                type="button"
                onClick={() => void handleToggleGizle()}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={hiding}
                aria-pressed={isGizlenen}
                aria-label={
                  isGizlenen ? "Gizlemeyi kaldır" : "Haritadan gizle"
                }
                className={cn(
                  "flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors sm:size-8",
                  isGizlenen
                    ? "text-slate-300 hover:bg-slate-400/10"
                    : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                  hiding && "opacity-60"
                )}
              >
                {isGizlenen ? (
                  <EyeIcon className="size-4" />
                ) : (
                  <EyeOffIcon className="size-4" />
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Paneli kapat"
              className="flex size-10 cursor-pointer items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 sm:size-8"
            >
              <XIcon className="size-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        <dl className="flex flex-col gap-2 px-4 pt-3 pb-1 text-xs">
          <MetricRow label="Tür" value={typeLabel(potansiyel.primary_type)} />
          {extras.length > 0 ? (
            <div className="flex items-start justify-between gap-3">
              <dt className="shrink-0 pt-0.5 text-muted-foreground">Etiket</dt>
              <dd className="flex min-w-0 flex-wrap justify-end gap-1">
                {extras.map((label) => (
                  <span
                    key={label}
                    className="rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          <MetricRow label="Adres" value={potansiyel.adres ?? "—"} wrap />
          <MetricRow
            label="Tarama"
            value={formatDate(potansiyel.tarandigi_tarih)}
          />
          {potansiyel.kalite_bayragi === "suspicious_name" ? (
            <MetricRow label="Not" value="Şüpheli isim — düşük güven" wrap />
          ) : null}
        </dl>

        <div className="mt-auto shrink-0 space-y-2 border-t bg-muted/30 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {isFavori && onUpdateFavoriNot ? (
            <div className="space-y-1">
              <label
                htmlFor={`favori-not-${potansiyel.id}`}
                className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
              >
                Not{noteSaving ? " · kaydediliyor…" : ""}
              </label>
              <textarea
                id={`favori-not-${potansiyel.id}`}
                value={noteDraft}
                onChange={(e) => handleNoteChange(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                rows={2}
                maxLength={280}
                placeholder="Pazartesi ara, rute ekle…"
                className="w-full resize-none rounded-md border border-border/70 bg-background/80 px-2.5 py-1.5 text-[11px] leading-snug outline-none placeholder:text-muted-foreground/60 focus:border-amber-500/50"
              />
            </div>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            className="w-full rounded-md"
            render={
              <a href={mapsHref} target="_blank" rel="noopener noreferrer" />
            }
          >
            <MapPinnedIcon className="size-3.5" />
            Google Maps’te aç
            <ExternalLinkIcon className="size-3 opacity-60" />
          </Button>
          {onToggleGizle && isGizlenen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full rounded-md"
              disabled={hiding}
              onClick={() => void handleToggleGizle()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <EyeIcon className="size-3.5" />
              {hiding ? "Güncelleniyor…" : "Gizlemeyi kaldır"}
            </Button>
          ) : null}
          {favoriError ? (
            <p className="text-[10px] leading-snug text-destructive">
              {favoriError}
            </p>
          ) : null}
          {hideError ? (
            <p className="text-[10px] leading-snug text-destructive">{hideError}</p>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
});

function MetricRow({
  label,
  value,
  wrap,
}: {
  label: string;
  value: string;
  wrap?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={
          wrap
            ? "min-w-0 text-right font-mono text-[12px] leading-snug break-words"
            : "truncate text-right font-mono tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}
