"use client";

import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ExternalLinkIcon, MapPinnedIcon, XIcon } from "lucide-react";
import { animate, motion, useMotionValue } from "motion/react";

import type { PanelAnchor } from "@/components/map/CustomerDetailPanel";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { PotansiyelHarita } from "@/lib/types";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 280;
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
}

export const PotansiyelDetailCard = memo(function PotansiyelDetailCard({
  potansiyel,
  anchor,
  containerRef,
  onClose,
}: PotansiyelDetailCardProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const reanchorRef = useRef(true);
  const [panelHeight, setPanelHeight] = useState(260);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const posX = useMotionValue(0);
  const posY = useMotionValue(0);

  useEffect(() => {
    reanchorRef.current = true;
  }, [potansiyel.id, anchor.x, anchor.y]);

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
  }, [potansiyel.id, potansiyel.google_types, potansiyel.kalite_bayragi]);

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

  const place = [potansiyel.ilce, potansiyel.il].filter(Boolean).join(", ");
  const extras = useMemo(
    () => secondaryTypes(potansiyel.primary_type, potansiyel.google_types),
    [potansiyel.primary_type, potansiyel.google_types]
  );
  const mapsHref = useMemo(() => googleMapsUrl(potansiyel), [potansiyel]);

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "pointer-events-auto absolute z-20 rounded-2xl border border-border/80 bg-card/95 shadow-lg backdrop-blur-md",
        isCompact && "max-h-[min(50dvh,22rem)] overflow-y-auto"
      )}
      style={{
        width,
        left: 0,
        top: 0,
        x: posX,
        y: posY,
      }}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.12em] text-teal-700/90 uppercase dark:text-teal-300/90">
            Potansiyel
          </p>
          <h2 className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug">
            {potansiyel.isim ?? "İsimsiz"}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Kapat"
          onClick={onClose}
          className="size-7 shrink-0 rounded-full"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <dl className="flex flex-col gap-2 px-3.5 py-3 text-xs">
        <Row label="Tür" value={typeLabel(potansiyel.primary_type)} />
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
        <Row label="Konum" value={place || "—"} />
        <Row label="Adres" value={potansiyel.adres ?? "—"} />
        <Row label="Tarama" value={formatDate(potansiyel.tarandigi_tarih)} />
        {potansiyel.kalite_bayragi === "suspicious_name" ? (
          <Row label="Not" value="Şüpheli isim — düşük güven" />
        ) : null}
      </dl>

      <div className="border-t border-border/60 px-3.5 py-2.5">
        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-border/80 bg-secondary px-3 text-xs font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary/80"
          )}
        >
          <MapPinnedIcon className="size-3.5" />
          Google Maps’te aç
          <ExternalLinkIcon className="size-3 opacity-60" />
        </a>
      </div>
    </motion.div>
  );
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-mono text-[12px] leading-snug break-words">
        {value}
      </dd>
    </div>
  );
}
