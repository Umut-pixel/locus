"use client";

import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/ThemeProvider";

export function ThemeToggle({
  className,
  size = "icon-sm",
}: {
  className?: string;
  size?: "icon-sm" | "icon";
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      onClick={toggleTheme}
      className={className}
      aria-label={isDark ? "Açık moda geç" : "Koyu moda geç"}
      title={isDark ? "Açık moda geç" : "Koyu moda geç"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
