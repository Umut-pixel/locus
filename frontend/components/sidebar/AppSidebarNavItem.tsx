"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";

import type { SidebarNavItem } from "@/lib/app-sidebar-nav";
import { isNavItemActive } from "@/lib/app-sidebar-nav";
import { cn } from "@/lib/utils";

/**
 * Ana navigasyon satırı.
 * `open`: etiketler clip ile açılır; nested çocuklar yükseklik animasyonuyla
 * içeri girer — sidebar genişlerken konum smooth kayar.
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
  const childActive = item.children?.some((c) => isNavItemActive(pathname, c.href)) ?? false;
  const active = isNavItemActive(pathname, item.href) || childActive;

  return (
    <div>
      <NavRow
        label={item.label}
        icon={item.icon}
        href={item.href}
        active={active}
        reveal={open}
        live={live}
      />
      {item.children && item.children.length > 0 ? (
        <motion.div
          initial={false}
          animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{
            duration: open ? 0.32 : 0,
            ease: [0.16, 1, 0.3, 1],
            delay: open ? 0.06 : 0,
          }}
          className="overflow-hidden"
          inert={!open}
        >
          <div className="mt-0.5 mb-1 ml-[18px] flex flex-col gap-0.5 border-l border-sidebar-border/80 pl-3">
            {item.children.map((child) => (
              <NavRow
                key={child.id}
                label={child.label}
                icon={child.icon}
                href={child.href}
                active={isNavItemActive(pathname, child.href)}
                nested
                reveal={open}
              />
            ))}
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
  nested = false,
  reveal = true,
  live = false,
}: {
  label: string;
  icon: LucideIcon;
  href?: string;
  active: boolean;
  nested?: boolean;
  reveal?: boolean;
  live?: boolean;
}) {
  const className = cn(
    "group relative flex items-center rounded-md text-left outline-none",
    "transition-colors duration-150",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
    reveal
      ? cn(
          "w-full gap-2.5 px-2.5",
          nested ? "h-8 text-[12.5px]" : "h-8 text-[13px]",
          active
            ? "bg-black/[0.06] font-medium text-sidebar-foreground dark:bg-white/[0.08]"
            : "font-medium text-muted-foreground hover:bg-black/[0.04] hover:text-sidebar-foreground dark:hover:bg-white/[0.04]"
        )
      : cn(
          "size-8 shrink-0 justify-center px-0",
          nested && "size-7",
          active
            ? "bg-black/[0.06] text-sidebar-foreground ring-1 ring-sidebar-border dark:bg-white/[0.08]"
            : "text-muted-foreground hover:bg-black/[0.04] hover:text-sidebar-foreground dark:hover:bg-white/[0.04]"
        )
  );

  const content = (
    <>
      {active && reveal ? (
        <span
          aria-hidden
          className="absolute top-1/2 left-0 z-10 h-3.5 w-[2px] -translate-y-1/2 rounded-r-full bg-sidebar-foreground/70"
        />
      ) : null}
      <span className="relative shrink-0">
        <Icon
          className={cn(
            "shrink-0",
            nested ? "size-3.5" : "size-4",
            active
              ? "text-sidebar-foreground"
              : "text-muted-foreground group-hover:text-sidebar-foreground"
          )}
        />
        {live ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-amber-400 shadow-[0_0_0_2px_var(--sidebar)] animate-pulse"
          />
        ) : null}
      </span>
      <span
        className={cn(
          "truncate whitespace-nowrap",
          reveal
            ? "min-w-0 flex-1 opacity-100 delay-100 duration-200"
            : "sr-only"
        )}
      >
        {label}
      </span>
    </>
  );

  const node = href ? (
    <Link href={href} aria-current={active ? "page" : undefined} title={label} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" title={label} className={className}>
      {content}
    </button>
  );

  return node;
}
