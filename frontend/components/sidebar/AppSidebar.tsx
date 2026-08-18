"use client";

import { useEffect, useState, type FocusEvent } from "react";
import { MenuIcon, PanelLeftCloseIcon, PanelLeftIcon } from "lucide-react";

import { AppSidebarNavItem } from "@/components/sidebar/AppSidebarNavItem";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
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
 * Yeni anahtar: eski "locus-sidebar-pinned" varsayılanı DAR raydı; ray artık
 * varsayılan olarak geniş (ikon + etiket) açıldığı için eski kayıt okunsaydı
 * mevcut kullanıcılar yanlışlıkla dar rayda kalırdı.
 */
const EXPANDED_STORAGE_KEY = "locus-sidebar-expanded";
/** Genişlikler globals.css'te — bkz. --sidebar-w / --sidebar-w-rail (tek layout kaynağı). */
const EXPANDED_WIDTH = "var(--sidebar-w)";
const RAIL_WIDTH = "var(--sidebar-w-rail)";

/**
 * Ray genişlik tercihi localStorage'da. Varsayılan GENİŞ (ikon + etiket) —
 * SSR-safe: ilk paint'te geniş, hydrate sonrası kullanıcının kaydettiği değer.
 */
function useExpandedPreference(): [boolean, (next: boolean) => void] {
  const [expanded, setExpandedState] = useState(true);

  useEffect(() => {
    if (window.localStorage.getItem(EXPANDED_STORAGE_KEY) === "0") {
      setExpandedState(false);
    }
  }, []);

  function setExpanded(next: boolean) {
    setExpandedState(next);
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, next ? "1" : "0");
  }

  return [expanded, setExpanded];
}

function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pt-3 pb-1 text-[9.5px] font-medium tracking-[0.13em] text-muted-foreground uppercase first:pt-2">
      {children}
    </p>
  );
}

interface SidebarBodyProps {
  /** İkon rayı modu — etiketler ve alt gruplar gizlenir. */
  collapsed?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  showExpandToggle?: boolean;
}

/** Masaüstü rayı ve mobil sheet aynı gövdeyi kullanır. */
function SidebarBody({
  collapsed = false,
  expanded = true,
  onToggleExpand,
  showExpandToggle = true,
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
          "flex h-11 shrink-0 items-center gap-2 border-b border-sidebar-border",
          collapsed ? "justify-center px-0" : "px-2.5"
        )}
      >
        <CelixionMark size={17} className="shrink-0 text-sidebar-foreground" />
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium tracking-tight text-sidebar-foreground">
              Locus
            </span>
            {showExpandToggle ? (
              <button
                type="button"
                onClick={onToggleExpand}
                title={expanded ? "Rayı daralt" : "Rayı genişlet"}
                aria-label={expanded ? "Rayı daralt" : "Rayı genişlet"}
                aria-pressed={expanded}
                className={cn(
                  "flex size-5.5 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
                )}
              >
                {expanded ? (
                  <PanelLeftCloseIcon className="size-3.5" />
                ) : (
                  <PanelLeftIcon className="size-3.5" />
                )}
              </button>
            ) : null}
          </>
        )}
      </div>

      <nav
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3",
          collapsed ? "px-1.5" : "px-2"
        )}
      >
        {collapsed ? (
          <div className="h-2" />
        ) : (
          <SidebarSectionLabel>Navigasyon</SidebarSectionLabel>
        )}
        <div className="flex flex-col gap-px">
          {MAIN_NAV.map((item) => (
            <AppSidebarNavItem key={item.id} item={item} collapsed={collapsed} />
          ))}
        </div>

        {collapsed ? (
          <div className="mt-2 border-t border-sidebar-border pt-2" />
        ) : (
          <SidebarSectionLabel>Araçlar</SidebarSectionLabel>
        )}
        <div className="flex flex-col gap-px">
          {TOOLS_NAV.map((item) => (
            <AppSidebarNavItem key={item.id} item={item} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      <div
        className={cn(
          "shrink-0 border-t border-sidebar-border",
          collapsed ? "flex flex-col items-center py-2" : "p-2"
        )}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <ThemeToggle className="text-muted-foreground" />
            <LogoutButton className="text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mb-1.5 px-1">
              <div className="mb-1 flex items-center justify-between text-[9.5px] text-muted-foreground">
                <span className="tracking-[0.06em] uppercase">Kapsam</span>
                <span className="font-mono tabular-nums">
                  {HARITA_KAPSAMI.konumlanan}/{HARITA_KAPSAMI.toplam}
                </span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${coveragePct}%`,
                    backgroundColor: "var(--metric-chart-bar)",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[9px] font-medium text-sidebar-accent-foreground">
                  PG
                </div>
                <span className="truncate text-[11.5px] text-sidebar-foreground">
                  Patigo
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <ThemeToggle className="text-muted-foreground" />
                <LogoutButton className="text-muted-foreground" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Masaüstü sol ray. Genişlik daima --sidebar-w / --sidebar-w-rail'den gelir;
 * kabuk flex olduğu için içerik hiçbir yerde margin/offset hesaplamaz.
 *
 *   • Genişletilmiş (varsayılan): 184px ikon + etiket, flex akışında —
 *     içerik yan yana, üst üste binme yok.
 *   • Daraltılmış ray: 52px ikon rayı. Üzerine gelinince genişleyen panel
 *     OVERLAY olarak absolute konumlanır; flex genişliği 52px'te kaldığı için
 *     içerik sağa kaymaz ve Mapbox canvas'ı yeniden boyutlanmaz (sağ kenar
 *     artefaktının kaynağı buydu).
 */
export function AppSidebar({ className }: { className?: string }) {
  const [expanded, setExpanded] = useExpandedPreference();
  const [hovering, setHovering] = useState(false);

  const showOverlay = hovering && !expanded;

  function handleBlur(e: FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setHovering(false);
    }
  }

  return (
    <aside
      className={cn(
        "relative hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-150 ease-out lg:block",
        className
      )}
      style={{
        width: expanded ? EXPANDED_WIDTH : RAIL_WIDTH,
        // Overlay içeriğin ray genişliğini aşabilmesi için overflow açılır.
        overflow: showOverlay ? "visible" : "hidden",
        zIndex: showOverlay ? 50 : undefined,
      }}
      onMouseEnter={() => !expanded && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => !expanded && setHovering(true)}
      onBlur={handleBlur}
    >
      {showOverlay ? (
        <div
          className="absolute inset-y-0 left-0 overflow-hidden bg-sidebar"
          style={{
            width: EXPANDED_WIDTH,
            borderRight: "1px solid var(--color-sidebar-border)",
            boxShadow: "4px 0 20px -4px rgba(0,0,0,0.45)",
          }}
        >
          <SidebarBody
            collapsed={false}
            expanded={false}
            onToggleExpand={() => setExpanded(true)}
          />
        </div>
      ) : (
        <SidebarBody
          collapsed={!expanded}
          expanded={expanded}
          onToggleExpand={() => setExpanded(!expanded)}
        />
      )}
    </aside>
  );
}

/** Mobil — lg altında görünen tetikleyici + soldan açılan sheet. Her zaman tam genişlik. */
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
              "pointer-events-auto size-9 rounded-lg border shadow-md lg:hidden",
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
        className="w-60 gap-0 p-0 sm:max-w-60"
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
