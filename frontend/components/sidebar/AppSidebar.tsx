"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { MenuIcon, PanelLeftCloseIcon, PinIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { AppSidebarNavItem } from "@/components/sidebar/AppSidebarNavItem";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { CelixionMark } from "@/components/brand/CelixionMark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { HARITA_KAPSAMI, MAIN_NAV, TOOLS_NAV } from "@/lib/app-sidebar-nav";
import { cn } from "@/lib/utils";

/**
 * Sabit (pinned) tercih. Eski "locus-sidebar-expanded" anahtarı korunur:
 * "1" = hover kapalı, ray yerleşimde geniş; aksi halde hover ile açılır.
 */
const PINNED_STORAGE_KEY = "locus-sidebar-expanded";
const EXPANDED_WIDTH = "var(--sidebar-w)";
const RAIL_WIDTH = "var(--sidebar-w-rail)";

const OPEN_EASE = "power3.out";
const CLOSE_EASE = "power3.out";
const OPEN_DURATION = 0.42;
const CLOSE_DURATION = 0.34;
const OPEN_DELAY = 0.09;
const CLOSE_DELAY = 0.16;

function usePinnedPreference(): [boolean, (next: boolean) => void, boolean] {
  const [pinned, setPinnedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    setPinnedState(window.localStorage.getItem(PINNED_STORAGE_KEY) === "1");
    setHydrated(true);
  }, []);

  function setPinned(next: boolean) {
    setPinnedState(next);
    window.localStorage.setItem(PINNED_STORAGE_KEY, next ? "1" : "0");
  }

  return [pinned, setPinned, hydrated];
}

function SidebarSectionLabel({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden",
        open
          ? "grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] delay-75 duration-300 ease-out"
          : "grid-rows-[0fr] opacity-0 duration-0"
      )}
    >
      <p className="overflow-hidden px-2.5 pt-4 pb-1.5 text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
        {children}
      </p>
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
  const coveragePct = Math.round(
    (HARITA_KAPSAMI.konumlanan / HARITA_KAPSAMI.toplam) * 100
  );

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground"
      style={{ fontFamily: "var(--font-inter)" }}
    >
      <div
        className="flex h-12 min-w-[var(--sidebar-w)] shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5"
        style={{ width: EXPANDED_WIDTH }}
      >
        <CelixionMark size={18} className="shrink-0 text-sidebar-foreground" />
        <span
          className={cn(
            "truncate whitespace-nowrap text-[13.5px] font-medium tracking-tight text-sidebar-foreground",
            revealed
              ? "min-w-0 flex-1 opacity-100 transition-opacity delay-75 duration-150 ease-out"
              : "pointer-events-none w-0 min-w-0 flex-none overflow-hidden opacity-0"
          )}
          aria-hidden={!revealed}
        >
          Locus
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
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-4">
          <SidebarSectionLabel open={revealed}>Navigasyon</SidebarSectionLabel>
          <div className="flex flex-col gap-0.5">
            {MAIN_NAV.map((item) => (
              <AppSidebarNavItem key={item.id} item={item} open={revealed} />
            ))}
          </div>

          {revealed ? null : (
            <div className="mx-2 my-3 border-t border-sidebar-border" />
          )}
          <SidebarSectionLabel open={revealed}>Araçlar</SidebarSectionLabel>
          <div className="flex flex-col gap-0.5">
            {TOOLS_NAV.map((item) => (
              <AppSidebarNavItem key={item.id} item={item} open={revealed} />
            ))}
          </div>
        </nav>

        <div className="shrink-0 border-t border-sidebar-border px-5 py-3">
          <motion.div
            initial={false}
            animate={
              revealed
                ? { height: "auto", opacity: 1, marginBottom: 12 }
                : { height: 0, opacity: 0, marginBottom: 0 }
            }
            transition={{ duration: revealed ? 0.28 : 0, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="tracking-[0.06em] uppercase">Kapsam</span>
              <span className="font-mono tabular-nums">
                {HARITA_KAPSAMI.konumlanan}/{HARITA_KAPSAMI.toplam}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${coveragePct}%`,
                  backgroundColor: "var(--metric-chart-bar)",
                }}
              />
            </div>
          </motion.div>

          <div className="flex items-center gap-2">
            <LogoutButton className="shrink-0 text-muted-foreground" />
            <motion.div
              initial={false}
              animate={
                revealed
                  ? { opacity: 1, width: "auto" }
                  : { opacity: 0, width: 0 }
              }
              transition={{
                duration: revealed ? 0.22 : 0,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex min-w-0 items-center gap-2 overflow-hidden"
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[10px] font-medium text-sidebar-accent-foreground">
                PG
              </div>
              <span className="truncate text-[13px] text-sidebar-foreground">
                Patigo
              </span>
            </motion.div>
          </div>
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
