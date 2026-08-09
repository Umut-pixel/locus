"use client";

import { useEffect, useState, type FocusEvent } from "react";
import { MenuIcon, PinIcon, PinOffIcon, type LucideIcon } from "lucide-react";

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
import {
  HARITA_KAPSAMI,
  MAIN_NAV,
  PINNED_ITEMS,
  RECENT_ITEMS,
  TOOLS_NAV,
} from "@/lib/app-sidebar-nav";
import { cn } from "@/lib/utils";

const PINNED_STORAGE_KEY = "locus-sidebar-pinned";
const COLLAPSED_WIDTH = "4rem";
const EXPANDED_WIDTH = "16rem";

/** Pin tercihi localStorage'da — SSR-safe: ilk paint'te false, hydrate sonrası gerçek değer. */
function usePinnedPreference(): [boolean, (next: boolean) => void] {
  const [pinned, setPinnedState] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(PINNED_STORAGE_KEY) === "1") {
      setPinnedState(true);
    }
  }, []);

  function setPinned(next: boolean) {
    setPinnedState(next);
    window.localStorage.setItem(PINNED_STORAGE_KEY, next ? "1" : "0");
  }

  return [pinned, setPinned];
}

function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pt-4 pb-1.5 text-[10.5px] font-medium tracking-[0.14em] text-muted-foreground/70 uppercase first:pt-3">
      {children}
    </p>
  );
}

function SidebarListButton({
  label,
  icon: Icon,
}: {
  label: string;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      title={label}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/60"
    >
      {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

interface SidebarBodyProps {
  /** İkon rayı modu — etiketler, alt gruplar ve Sabitlenenler/Sohbet gizlenir. */
  collapsed?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  showPinToggle?: boolean;
}

/** Masaüstü rayı ve mobil sheet aynı gövdeyi kullanır. */
function SidebarBody({
  collapsed = false,
  pinned = false,
  onTogglePin,
  showPinToggle = true,
}: SidebarBodyProps) {
  const coveragePct = Math.round(
    (HARITA_KAPSAMI.konumlanan / HARITA_KAPSAMI.toplam) * 100
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
      style={{ fontFamily: "var(--font-inter)" }}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-sidebar-border py-3.5",
          collapsed ? "justify-center px-0" : "px-4"
        )}
      >
        <CelixionMark size={20} className="shrink-0 text-sidebar-foreground" />
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight text-sidebar-foreground">
              Locus
            </span>
            {showPinToggle ? (
              <button
                type="button"
                onClick={onTogglePin}
                title={pinned ? "Sabitlemeyi kaldır" : "Sidebar'ı sabitle"}
                aria-label={pinned ? "Sabitlemeyi kaldır" : "Sidebar'ı sabitle"}
                aria-pressed={pinned}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md outline-none transition-colors duration-150",
                  "focus-visible:ring-3 focus-visible:ring-sidebar-ring/60",
                  pinned
                    ? "text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )}
              >
                {pinned ? (
                  <PinOffIcon className="size-3.5" />
                ) : (
                  <PinIcon className="size-3.5" />
                )}
              </button>
            ) : null}
          </>
        )}
      </div>

      <nav
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4",
          collapsed ? "px-2" : "px-2.5"
        )}
      >
        {collapsed ? (
          <div className="h-3" />
        ) : (
          <SidebarSectionLabel>Navigasyon</SidebarSectionLabel>
        )}
        <div className="flex flex-col gap-0.5">
          {MAIN_NAV.map((item) => (
            <AppSidebarNavItem key={item.id} item={item} collapsed={collapsed} />
          ))}
        </div>

        {collapsed ? (
          <div className="mt-3 border-t border-sidebar-border pt-3" />
        ) : (
          <SidebarSectionLabel>Araçlar</SidebarSectionLabel>
        )}
        <div className="flex flex-col gap-0.5">
          {TOOLS_NAV.map((item) => (
            <AppSidebarNavItem key={item.id} item={item} collapsed={collapsed} />
          ))}
        </div>

        {collapsed ? null : (
          <>
            <SidebarSectionLabel>Sabitlenenler</SidebarSectionLabel>
            <div className="flex flex-col gap-0.5">
              {PINNED_ITEMS.map((item) => (
                <SidebarListButton key={item.id} label={item.label} icon={item.icon} />
              ))}
            </div>

            <SidebarSectionLabel>Sohbet geçmişi</SidebarSectionLabel>
            <div className="flex flex-col gap-0.5">
              {RECENT_ITEMS.map((item) => (
                <SidebarListButton key={item.id} label={item.label} />
              ))}
            </div>
          </>
        )}
      </nav>

      <div
        className={cn(
          "shrink-0 border-t border-sidebar-border",
          collapsed ? "flex flex-col items-center py-3" : "p-3"
        )}
      >
        {collapsed ? (
          <LogoutButton className="text-muted-foreground" />
        ) : (
          <>
            <div className="mb-2.5 rounded-xl bg-black/20 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-muted-foreground">
                <span>Harita kapsamı</span>
                <span className="font-mono tabular-nums">
                  {HARITA_KAPSAMI.konumlanan}/{HARITA_KAPSAMI.toplam}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${coveragePct}%`,
                    backgroundColor: "var(--metric-chart-bar)",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[10px] font-medium text-sidebar-accent-foreground">
                  PT
                </div>
                <span className="truncate text-[12.5px] text-sidebar-foreground">
                  Peritas ekibi
                </span>
              </div>
              <LogoutButton className="shrink-0 text-muted-foreground" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Masaüstü sol ray — Supabase tarzı davranış:
 * varsayılan ikon rayı (collapsed) → hover'da geçici genişler (overlay, FilterPanel/harita
 * kaymaz) → pin ile kalıcı genişler (sticky, gerçek layout genişliği).
 */
export function AppSidebar({ className }: { className?: string }) {
  const [pinned, setPinned] = usePinnedPreference();
  const [hovering, setHovering] = useState(false);
  const expanded = pinned || hovering;

  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setHovering(false);
    }
  }

  return (
    <div
      className={cn(
        "relative hidden shrink-0 transition-[width] duration-150 ease-out lg:block",
        className
      )}
      style={{ width: pinned ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={handleBlur}
    >
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-20 overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-150 ease-out",
          expanded ? "w-64" : "w-16",
          !pinned && expanded ? "shadow-2xl" : ""
        )}
      >
        <SidebarBody
          collapsed={!expanded}
          pinned={pinned}
          onTogglePin={() => setPinned(!pinned)}
        />
      </aside>
    </div>
  );
}

/** Mobil — lg altında görünen tetikleyici + soldan açılan sheet. Her zaman tam genişlik, pin yok. */
export function AppSidebarMobileTrigger({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            className={cn(
              "pointer-events-auto size-10 rounded-full border shadow-md lg:hidden",
              className
            )}
            aria-label="Menüyü aç"
          />
        }
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0 sm:max-w-72" showCloseButton={false}>
        <SheetHeader className="sr-only">
          <SheetTitle>Menü</SheetTitle>
        </SheetHeader>
        <SidebarBody showPinToggle={false} />
      </SheetContent>
    </Sheet>
  );
}
