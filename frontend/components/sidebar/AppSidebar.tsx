"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChevronDownIcon, MenuIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { AppSidebarNavItem, SidebarIconCell, SidebarLabel } from "@/components/sidebar/AppSidebarNavItem";
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
  ICON_RAIL_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
  SIDEBAR_ROW,
  SIDEBAR_WIDTH_TRANSITION,
} from "@/lib/sidebar-layout";
import {
  useCollapsedSections,
  usePinnedPreference,
} from "@/lib/sidebar-preference";
import { cn } from "@/lib/utils";

const HOVER_OPEN_DELAY_MS = 10;
const HOVER_CLOSE_DELAY_MS = 80;

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
  return (
    <div
      className={cn(
        SIDEBAR_ROW,
        "mb-1 h-7 transition-opacity duration-150",
        open ? "opacity-100 delay-75" : "pointer-events-none opacity-0"
      )}
      aria-hidden={!open}
    >
      <span aria-hidden style={{ width: ICON_RAIL_WIDTH }} />
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 items-center justify-between pr-3 text-left outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
          aria-expanded={!collapsed}
          tabIndex={open ? 0 : -1}
        >
          <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {children}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              collapsed && "-rotate-90"
            )}
          />
        </button>
      ) : (
        <span className="pr-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {children}
        </span>
      )}
    </div>
  );
}

interface SidebarBodyProps {
  open?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  showExpandToggle?: boolean;
}

function SidebarBody({
  open = true,
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
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
      style={
        {
          width: SIDEBAR_EXPANDED_WIDTH,
          minWidth: SIDEBAR_EXPANDED_WIDTH,
          ["--sidebar-rail" as string]: `${ICON_RAIL_WIDTH}px`,
          fontFamily: "var(--font-inter)",
        } as CSSProperties
      }
    >
      <div className="flex h-12 shrink-0 items-center border-b border-sidebar-border">
        <div className="min-w-0 flex-1">
          <div className={cn(SIDEBAR_ROW, "h-12")}>
            <SidebarIconCell className="h-12">
              <CelixionMark size={18} className="text-sidebar-foreground" />
            </SidebarIconCell>
            <SidebarLabel visible={open} className="min-w-0 pr-1">
              <span className="block truncate text-[13.5px] font-semibold tracking-tight text-sidebar-foreground">
                Locus
              </span>
              <span className="block truncate text-[11px] font-normal text-muted-foreground">
                Peritas ekibi
              </span>
            </SidebarLabel>
          </div>
        </div>
        {showExpandToggle ? (
          <button
            type="button"
            onClick={onTogglePin}
            title={pinned ? "Sabitlemeyi kaldır" : "Kenar çubuğunu sabitle"}
            aria-label={pinned ? "Sabitlemeyi kaldır" : "Kenar çubuğunu sabitle"}
            aria-pressed={pinned}
            tabIndex={open ? 0 : -1}
            className={cn(
              "mr-2 flex size-7 shrink-0 items-center justify-center rounded-md outline-none",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
              "transition-opacity duration-200 ease-out",
              pinned ? "text-sidebar-foreground" : "text-muted-foreground",
              open ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            {pinned ? (
              <PanelLeftCloseIcon className="size-3.5" />
            ) : (
              <PanelLeftOpenIcon className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-2 pb-3">
        {NAV_SECTIONS.map((section, sectionIndex) => {
          const sectionCollapsed =
            open && section.collapsible
              ? Boolean(collapsedSections[section.id])
              : false;

          return (
            <div key={section.id} className={cn(sectionIndex > 0 && "mt-3")}>
              <SidebarSectionLabel
                open={open}
                collapsible={section.collapsible}
                collapsed={sectionCollapsed}
                onToggle={() => toggleSection(section.id)}
              >
                {section.label}
              </SidebarSectionLabel>
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
                <div className="flex flex-col gap-0.5 pb-1">
                  {section.items.map((item) => (
                    <AppSidebarNavItem
                      key={item.id}
                      item={item}
                      open={open}
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
        <div className="pb-1">
          {FOOTER_NAV.map((item) => (
            <AppSidebarNavItem key={item.id} item={item} open={open} />
          ))}
        </div>
        <SidebarCoverage
          open={open}
          located={HARITA_KAPSAMI.konumlanan}
          total={HARITA_KAPSAMI.toplam}
        />
        <SidebarProfileFooter open={open} />
      </div>
    </div>
  );
}

/**
 * Sabit overlay + yerleşim spacer.
 * İç kabuk her zaman expanded genişlikte; dış `motion` genişliği kırpar.
 * Kapanışta satır düzeni değişmez — ikonlar yerinde kalır.
 */
export function AppSidebar({ className }: { className?: string }) {
  const [pinned, setPinned, hydrated] = usePinnedPreference();
  const [peek, setPeek] = useState(false);
  const reduceMotion = useReducedMotion();
  const openTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const open = pinned || peek;
  const railWidth = pinned ? SIDEBAR_EXPANDED_WIDTH : ICON_RAIL_WIDTH;
  const panelWidth = open ? SIDEBAR_EXPANDED_WIDTH : ICON_RAIL_WIDTH;
  const tween = reduceMotion ? { duration: 0 } : SIDEBAR_WIDTH_TRANSITION;

  const clearHoverTimers = useCallback(() => {
    if (openTimeoutRef.current !== null) {
      window.clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearHoverTimers(), [clearHoverTimers]);

  useEffect(() => {
    if (pinned) setPeek(true);
  }, [pinned]);

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
    if (pinned) return;
    clearHoverTimers();
    if (reduceMotion) {
      setPeek(next);
      return;
    }
    const delay = next ? HOVER_OPEN_DELAY_MS : HOVER_CLOSE_DELAY_MS;
    const id = window.setTimeout(() => {
      setPeek(next);
      openTimeoutRef.current = null;
      closeTimeoutRef.current = null;
    }, delay);
    if (next) openTimeoutRef.current = id;
    else closeTimeoutRef.current = id;
  }

  if (!hydrated) {
    return <div className="hidden w-[52px] shrink-0 lg:block" aria-hidden />;
  }

  return (
    <>
      <motion.div
        aria-hidden
        className="hidden shrink-0 lg:block"
        initial={false}
        animate={{ width: railWidth }}
        transition={tween}
      />
      <motion.aside
        className={cn(
          "fixed inset-y-0 left-0 hidden h-full max-h-dvh overflow-hidden lg:block",
          open ? "z-[80]" : "z-[60]",
          "border-r border-sidebar-border bg-sidebar",
          open && !pinned
            ? "shadow-[4px_0_32px_-8px_rgba(0,0,0,0.18)] dark:shadow-[6px_0_40px_-12px_rgba(0,0,0,0.55)]"
            : "shadow-none",
          className
        )}
        initial={false}
        animate={{ width: panelWidth }}
        transition={tween}
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
        <SidebarBody
          open={open}
          pinned={pinned}
          onTogglePin={() => {
            if (pinned) setPeek(true);
            setPinned(!pinned);
          }}
        />
      </motion.aside>
    </>
  );
}

export function AppSidebarMobileTrigger({
  className,
  embedded = false,
}: {
  className?: string;
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
