"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, MoonIcon, SunIcon } from "lucide-react";

import { LogoutButton } from "@/components/auth/LogoutButton";
import {
  SidebarIconCell,
  SidebarLabel,
} from "@/components/sidebar/AppSidebarNavItem";
import { useTheme } from "@/components/theme/ThemeProvider";
import { SIDEBAR_ROW, sidebarTween } from "@/lib/sidebar-layout";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

export function SidebarProfileFooter({ open }: { open: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ left: 0, bottom: 0, width: 192 });
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) setMenuOpen(false);
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!menuOpen) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords({
        left: open ? rect.left : rect.right + 8,
        bottom: window.innerHeight - rect.top + 6,
        width: open ? Math.max(rect.width, 180) : 192,
      });
    }
    function onPointer(event: PointerEvent) {
      const t = event.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, open]);

  return (
    <div ref={wrapRef} className="shrink-0 border-t border-sidebar-border py-2">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        title={open ? undefined : "Hesap"}
        className={cn(
          SIDEBAR_ROW,
          "h-9 rounded-md text-left outline-none transition-colors duration-150",
          "hover:bg-black/[0.04] dark:hover:bg-white/[0.04]",
          "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
        )}
      >
        <SidebarIconCell className="h-9">
          <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-accent text-[10px] font-semibold tracking-wide text-sidebar-accent-foreground">
            PE
          </span>
        </SidebarIconCell>
        <SidebarLabel
          visible={open}
          className="flex items-center justify-between gap-1 pr-3 text-[13px] font-medium text-sidebar-foreground"
        >
          <span className="min-w-0 truncate">
            Peritas ekibi
            <span className="mt-0 block truncate text-[11px] font-normal text-muted-foreground">
              Patigo
            </span>
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              menuOpen && "rotate-180"
            )}
          />
        </SidebarLabel>
      </button>

      {menuOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                position: "fixed",
                left: coords.left,
                bottom: coords.bottom,
                width: coords.width,
              }}
              className="z-[200] overflow-hidden rounded-lg border border-sidebar-border bg-popover py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  toggleTheme();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-popover-foreground hover:bg-muted"
              >
                {isDark ? (
                  <SunIcon className="size-3.5" />
                ) : (
                  <MoonIcon className="size-3.5" />
                )}
                {isDark ? "Açık moda geç" : "Koyu moda geç"}
              </button>
              <div className="mx-2 my-1 h-px bg-border" />
              <LogoutButton
                showLabel
                className="h-9 w-full justify-start rounded-none px-3 text-[13px] text-muted-foreground hover:text-foreground"
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function SidebarCoverage({
  open,
  located,
  total,
}: {
  open: boolean;
  located: number | null;
  total: number | null;
}) {
  const ready = located != null && total != null && total > 0;
  const pct = ready ? Math.round((located / total) * 100) : 0;
  return (
    <motion.div
      initial={false}
      animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
      transition={sidebarTween(open)}
      className="overflow-hidden"
      aria-hidden={!open}
    >
      <div className={SIDEBAR_ROW}>
        <span aria-hidden />
        <div className="flex flex-col justify-center pr-3 pt-1.5 pb-2">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            <span>Kapsam</span>
            <span className="font-mono font-medium tracking-normal tabular-nums">
              {ready ? `${located}/${total}` : "—"}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                backgroundColor: "var(--metric-chart-bar)",
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
