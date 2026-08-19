"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ChevronDownIcon, MenuIcon, PanelLeftCloseIcon, PinIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { AppSidebarNavItem } from "@/components/sidebar/AppSidebarNavItem";
import {
  SidebarCoverage,
  SidebarProfileFooter,
} from "@/components/sidebar/SidebarProfileFooter";
import { CelixionMark } from "@/components/brand/CelixionMark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  FOOTER_NAV,
  HARITA_KAPSAMI,
  NAV_SECTIONS,
} from "@/lib/app-sidebar-nav";
import { usePanoramaSyncStatus } from "@/hooks/usePanoramaSyncStatus";
import {
  useCollapsedSections,
  usePinnedPreference,
} from "@/lib/sidebar-preference";
import { cn } from "@/lib/utils";

const EXPANDED_WIDTH = "var(--sidebar-w)";
const RAIL_WIDTH = "var(--sidebar-w-rail)";

const OPEN_EASE = "power3.out";
const CLOSE_EASE = "power3.out";
const OPEN_DURATION = 0.42;
const CLOSE_DURATION = 0.34;
const OPEN_DELAY = 0.09;
const CLOSE_DELAY = 0.16;

function SidebarSectionLabel({
  open,
  collapsible,
  collapsed,
  onToggle,
  children,
}: {
  open: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const label = (
    <span className="px-2.5 pt-4 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </span>
  );

  return (
    <div
      className={cn(
        "grid overflow-hidden",
        open
          ? "grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] delay-75 duration-300 ease-out"
          : "grid-rows-[0fr] opacity-0 duration-0"
      )}
    >
      <div className="overflow-hidden">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-end justify-between pb-1 text-left outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
            aria-expanded={!collapsed}
          >
            {label}
            <ChevronDownIcon
              className={cn(
                "mb-1.5 mr-2 size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                collapsed && "-rotate-90"
              )}
            />
          </button>
        ) : (
          <p className="overflow-hidden px-2.5 pt-4 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {children}
          </p>
        )}
      </div>
    </div>
  );
}

interface SidebarBodyProps {
  /** İçerik henüz ray moduna düşmedi (kapanış clip'i bitene kadar true). */
  revealed?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  showExpandToggle?: boolean;
}

/** Masaüstü rayı ve mobil sheet aynı gövdeyi kullanır. */
function SidebarBody({
  revealed = true,
  pinned = true,
  onTogglePin,
  showExpandToggle = true,
}: SidebarBodyProps) {
  const { status } = usePanoramaSyncStatus();
  const panoramaLive = status.transformPending || Boolean(status.syncError);

  const defaultCollapsed = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const section of NAV_SECTIONS) {
      if (section.collapsible) map[section.id] = Boolean(section.defaultCollapsed);
    }
    return map;
  }, []);
  const [collapsedSections, toggleSection] = useCollapsedSections(defaultCollapsed);

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground"
      style={{ fontFamily: "var(--font-inter)" }}
    >
      <div
        className="flex h-12 min-w-[var(--sidebar-w)] shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3"
        style={{ width: EXPANDED_WIDTH }}
      >
        <CelixionMark size={18} className="ml-1.5 shrink-0 text-sidebar-foreground" />
        <span
          className={cn(
            "min-w-0 flex-1 overflow-hidden whitespace-nowrap",
            revealed
              ? "opacity-100 transition-opacity delay-75 duration-150 ease-out"
              : "pointer-events-none opacity-0"
          )}
          aria-hidden={!revealed}
        >
          <span className="block truncate text-[13.5px] font-semibold tracking-tight text-sidebar-foreground">
            Locus
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            Peritas ekibi
          </span>
        </span>
        {showExpandToggle ? (
          <button
            type="button"
            onClick={onTogglePin}
            title={pinned ? "Sabitlemeyi kaldır" : "Kenar çubuğunu sabitle"}
            aria-label={pinned ? "Sabitlemeyi kaldır" : "Kenar çubuğunu sabitle"}
            aria-pressed={pinned}
            tabIndex={revealed ? 0 : -1}
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md outline-none",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
              "transition-opacity ease-out",
              pinned ? "text-sidebar-foreground" : "text-muted-foreground",
              revealed
                ? "opacity-100 delay-100 duration-200"
                : "pointer-events-none opacity-0 duration-0"
            )}
          >
            {pinned ? (
              <PanelLeftCloseIcon className="size-3.5" />
            ) : (
              <PinIcon className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>

      <div
        className="flex min-h-0 min-w-[var(--sidebar-w)] flex-1 flex-col"
        style={{ width: EXPANDED_WIDTH }}
      >
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          {NAV_SECTIONS.map((section, sectionIndex) => {
            const sectionCollapsed =
              revealed && section.collapsible
                ? Boolean(collapsedSections[section.id])
                : false;

            return (
              <div key={section.id} className={cn(sectionIndex > 0 && "mt-1")}>
                <SidebarSectionLabel
                  open={revealed}
                  collapsible={section.collapsible}
                  collapsed={sectionCollapsed}
                  onToggle={() => toggleSection(section.id)}
                >
                  {section.label}
                </SidebarSectionLabel>
                {revealed ? null : sectionIndex > 0 ? (
                  <div className="mx-2 my-2.5 border-t border-sidebar-border" />
                ) : null}
                <motion.div
                  initial={false}
                  animate={
                    sectionCollapsed
                      ? { height: 0, opacity: 0 }
                      : { height: "auto", opacity: 1 }
                  }
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                  inert={sectionCollapsed}
                >
                  <div className="flex flex-col gap-0.5">
                    {section.items.map((item) => (
                      <AppSidebarNavItem
                        key={item.id}
                        item={item}
                        open={revealed}
                        live={item.liveKey === "panorama" ? panoramaLive : false}
                      />
                    ))}
                  </div>
                </motion.div>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0">
          <div className="px-2 pb-1">
            {FOOTER_NAV.map((item) => (
              <AppSidebarNavItem key={item.id} item={item} open={revealed} />
            ))}
          </div>
          <SidebarCoverage
            revealed={revealed}
            located={HARITA_KAPSAMI.konumlanan}
            total={HARITA_KAPSAMI.toplam}
          />
          <SidebarProfileFooter revealed={revealed} />
        </div>
      </div>
    </div>
  );
}

/**
 * Masaüstü sol ray.
 *
 *   • Unpinned: yerleşim ray genişliğinde kalır. Hover, paneli overlay olarak
 *     GSAP ile açar/kapar — genişliği yalnızca GSAP yazar (React style snap yok).
 *   • Pinned: overlay kilitlenir, yerleşim --sidebar-w'ye geçer.
 *
 * Açılışta `revealed` hemen true olur: etiketler ve nested alt öğeler
 * clip + yükseklik animasyonuyla konum değiştirir (kapanış anında gizlenir).
 */
export function AppSidebar({ className }: { className?: string }) {
  const [pinned, setPinned, hydrated] = usePinnedPreference();
  const [peek, setPeek] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const delayTween = useRef<gsap.core.Tween | null>(null);
  const didInit = useRef(false);
  const openRef = useRef(false);
  const open = pinned || peek;
  openRef.current = open;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !hydrated) return;

    const nextWidth = open ? EXPANDED_WIDTH : RAIL_WIDTH;
    const nextShadow =
      !pinned && open
        ? "8px 0 28px -8px rgba(20, 24, 36, 0.18)"
        : "0px 0px 24px 0px rgba(20, 24, 36, 0)";

    if (open) setRevealed(true);
    else setRevealed(false);

    if (!didInit.current) {
      gsap.set(panel, { width: nextWidth, boxShadow: nextShadow });
      setRevealed(open);
      didInit.current = true;
      return;
    }

    if (reduceMotion) {
      gsap.set(panel, { width: nextWidth, boxShadow: nextShadow });
      setRevealed(open);
      return;
    }

    gsap.to(panel, {
      width: nextWidth,
      boxShadow: nextShadow,
      duration: open ? OPEN_DURATION : CLOSE_DURATION,
      ease: open ? OPEN_EASE : CLOSE_EASE,
      overwrite: "auto",
      onStart() {
        panel.style.willChange = "width, box-shadow";
      },
      onComplete() {
        panel.style.willChange = "auto";
        if (!openRef.current) setRevealed(false);
      },
    });
  }, [open, pinned, reduceMotion, hydrated]);

  useEffect(() => {
    return () => {
      delayTween.current?.kill();
      if (panelRef.current) gsap.killTweensOf(panelRef.current);
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "[" || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (event.target as HTMLElement)?.isContentEditable) {
        return;
      }
      event.preventDefault();
      setPinned(!pinned);
      if (!pinned) setPeek(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, setPinned]);

  function schedulePeek(next: boolean) {
    delayTween.current?.kill();
    if (pinned || reduceMotion) {
      setPeek(next);
      return;
    }
    delayTween.current = gsap.delayedCall(
      next ? OPEN_DELAY : CLOSE_DELAY,
      () => setPeek(next)
    );
  }

  return (
    <aside
      className={cn(
        "relative z-30 hidden shrink-0 transition-[width] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] lg:block",
        pinned ? "overflow-hidden" : "overflow-visible",
        className
      )}
      style={{
        width: pinned ? EXPANDED_WIDTH : RAIL_WIDTH,
      }}
      onPointerEnter={() => schedulePeek(true)}
      onPointerLeave={() => schedulePeek(false)}
      onFocusCapture={() => schedulePeek(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          schedulePeek(false);
        }
      }}
      aria-expanded={open}
    >
      <div
        ref={panelRef}
        className="absolute inset-y-0 left-0 h-full w-[var(--sidebar-w-rail)] overflow-hidden border-r border-sidebar-border bg-sidebar"
      >
        <SidebarBody
          revealed={revealed}
          pinned={pinned}
          onTogglePin={() => {
            if (pinned) setPeek(true);
            setPinned(!pinned);
          }}
        />
      </div>
    </aside>
  );
}

/** Mobil — lg altında görünen tetikleyici + soldan açılan sheet. Her zaman tam genişlik. */
export function AppSidebarMobileTrigger({
  className,
  embedded = false,
}: {
  className?: string;
  /** Arama çubuğu içi — kenarlık/gölge yok. */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant={embedded ? "ghost" : "secondary"}
            size="icon"
            className={cn(
              "pointer-events-auto size-9 lg:hidden",
              embedded
                ? "rounded-full text-muted-foreground shadow-none hover:bg-muted/45 hover:text-foreground"
                : "rounded-lg border shadow-md",
              className
            )}
            aria-label="Menüyü aç"
          />
        }
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-64 gap-0 p-0 sm:max-w-64"
        showCloseButton={false}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Menü</SheetTitle>
        </SheetHeader>
        <SidebarBody showExpandToggle={false} />
      </SheetContent>
    </Sheet>
  );
}
