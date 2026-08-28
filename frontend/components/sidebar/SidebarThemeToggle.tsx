"use client";

import { useRef } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

import {
  SidebarIconCell,
  SidebarLabel,
} from "@/components/sidebar/AppSidebarNavItem";
import { useTheme } from "@/components/theme/ThemeProvider";
import { SIDEBAR_ROW } from "@/lib/sidebar-layout";
import { spinThemeIcon } from "@/lib/theme-transition";
import { cn } from "@/lib/utils";

export function SidebarThemeToggle({ open }: { open: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const iconRef = useRef<HTMLSpanElement>(null);
  const isDark = theme === "dark";
  const label = isDark ? "Açık tema" : "Koyu tema";

  function onToggle() {
    const nextDark = !isDark;
    spinThemeIcon(iconRef.current, nextDark);
    toggleTheme();
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? undefined : label}
      aria-label={label}
      className={cn(
        SIDEBAR_ROW,
        "group relative h-8 text-left outline-none transition-colors duration-150",
        "text-muted-foreground hover:text-sidebar-foreground",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
        open && "rounded-md hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
      )}
    >
      <SidebarIconCell
        className={cn(
          "h-8 rounded-md",
          !open && "group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.04]"
        )}
      >
        <span ref={iconRef} className="flex size-4 items-center justify-center">
          {isDark ? (
            <SunIcon className="size-4 text-muted-foreground group-hover:text-sidebar-foreground" />
          ) : (
            <MoonIcon className="size-4 text-muted-foreground group-hover:text-sidebar-foreground" />
          )}
        </span>
      </SidebarIconCell>
      <SidebarLabel visible={open} className="relative z-[1] pr-3 text-[13px]">
        {label}
      </SidebarLabel>
    </button>
  );
}
