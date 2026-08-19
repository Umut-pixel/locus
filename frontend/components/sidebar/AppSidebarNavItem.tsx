"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";

import type { SidebarNavItem } from "@/lib/app-sidebar-nav";
import { isNavItemActive } from "@/lib/app-sidebar-nav";
import {
  ICON_RAIL_WIDTH,
  RAIL_PILL_INSET,
  RAIL_PILL_SIZE,
  SIDEBAR_EXPANDED_WIDTH,
  SIDEBAR_ROW,
  sidebarTween,
} from "@/lib/sidebar-layout";
import { cn } from "@/lib/utils";

export function SidebarLabel({
  visible,
  children,
  className,
}: {
  visible: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "min-w-0 select-none overflow-hidden whitespace-nowrap transition-opacity duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
        className
      )}
      aria-hidden={!visible}
    >
      {children}
    </span>
  );
}

export function SidebarIconCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("relative z-[1] flex shrink-0 items-center justify-center", className)}
      style={{ width: ICON_RAIL_WIDTH } as CSSProperties}
    >
      {children}
    </span>
  );
}

/**
 * İkonlar ray sütununda sabit. Subpage'ler yükseklik animasyonuyla yer açar /
 * kapanır — kapalıyken yer kaplamaz.
 */
export function AppSidebarNavItem({
  item,
  open = true,
  live = false,
}: {
  item: SidebarNavItem;
  open?: boolean;
  live?: boolean;
}) {
  const pathname = usePathname();
  const childActive =
    item.children?.some((c) => isNavItemActive(pathname, c.href)) ?? false;
  const active = isNavItemActive(pathname, item.href) || childActive;

  return (
    <div>
      <NavRow
        label={item.label}
        icon={item.icon}
        href={item.href}
        active={active}
        open={open}
        live={live}
      />
      {item.children && item.children.length > 0 ? (
        <motion.div
          initial={false}
          animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={sidebarTween(open)}
          className="overflow-hidden"
          inert={!open}
        >
          <div className={SIDEBAR_ROW}>
            <span aria-hidden />
            <div className="mt-0.5 mb-1 border-l border-sidebar-border/80 pl-3">
              <div className="flex flex-col gap-0.5">
                {item.children.map((child) => (
                  <NestedRow
                    key={child.id}
                    label={child.label}
                    icon={child.icon}
                    href={child.href}
                    active={isNavItemActive(pathname, child.href)}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}

function NavRow({
  label,
  icon: Icon,
  href,
  active,
  open,
  live = false,
}: {
  label: string;
  icon: LucideIcon;
  href?: string;
  active: boolean;
  open: boolean;
  live?: boolean;
}) {
  const className = cn(
    SIDEBAR_ROW,
    "group relative h-8 text-left outline-none transition-colors duration-150",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
    active
      ? "text-sidebar-foreground"
      : "text-muted-foreground hover:text-sidebar-foreground",
    open && !active && "hover:bg-black/[0.04] dark:hover:bg-white/[0.04]",
    open && "rounded-md"
  );

  const content = (
    <>
      {active ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 z-0 h-8 rounded-md bg-black/[0.06] dark:bg-white/[0.08]"
          initial={false}
          animate={{
            left: open ? 8 : RAIL_PILL_INSET,
            width: open ? SIDEBAR_EXPANDED_WIDTH - 16 : RAIL_PILL_SIZE,
          }}
          transition={sidebarTween(open)}
        />
      ) : null}
      {active && open ? (
        <span
          aria-hidden
          className="absolute top-1/2 left-0 z-[1] h-3.5 w-[2px] -translate-y-1/2 rounded-r-full bg-sidebar-foreground/70"
        />
      ) : null}
      <SidebarIconCell
        className={cn(
          "h-8 rounded-md",
          !open && !active && "group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.04]"
        )}
      >
        <Icon
          className={cn(
            "size-4",
            active
              ? "text-sidebar-foreground"
              : "text-muted-foreground group-hover:text-sidebar-foreground"
          )}
        />
        {live ? (
          <span
            aria-hidden
            className="absolute top-1.5 right-2.5 size-1.5 rounded-full bg-amber-400 shadow-[0_0_0_2px_var(--sidebar)] animate-pulse"
          />
        ) : null}
      </SidebarIconCell>
      <SidebarLabel
        visible={open}
        className={cn(
          "relative z-[1] pr-3 text-[13px]",
          active ? "font-medium text-sidebar-foreground" : "font-medium"
        )}
      >
        {label}
      </SidebarLabel>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        title={open ? undefined : label}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <button type="button" title={open ? undefined : label} className={className}>
      {content}
    </button>
  );
}

function NestedRow({
  label,
  icon: Icon,
  href,
  active,
}: {
  label: string;
  icon: LucideIcon;
  href?: string;
  active: boolean;
}) {
  const className = cn(
    "flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-[12.5px] outline-none transition-colors duration-150",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
    active
      ? "bg-black/[0.06] font-medium text-sidebar-foreground dark:bg-white/[0.08]"
      : "font-medium text-muted-foreground hover:bg-black/[0.04] hover:text-sidebar-foreground dark:hover:bg-white/[0.04]"
  );

  const content = (
    <>
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className}>
      {content}
    </button>
  );
}
