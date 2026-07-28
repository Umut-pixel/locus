"use client";

import { MoonIcon, SunIcon } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <TooltipProvider delay={280}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "Açık temaya geç" : "Koyu temaya geç"}
          className={cn(
            "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            className
          )}
        >
          {isDark ? (
            <SunIcon className="size-3.5" />
          ) : (
            <MoonIcon className="size-3.5" />
          )}
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          sideOffset={6}
          className="px-2 py-1 font-mono text-[10px] tracking-wide uppercase"
        >
          {isDark ? "Açık" : "Koyu"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
