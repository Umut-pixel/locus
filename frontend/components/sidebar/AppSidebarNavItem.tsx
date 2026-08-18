"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";

import type { SidebarNavItem } from "@/lib/app-sidebar-nav";
import { cn } from "@/lib/utils";

/**
 * Ana navigasyon / araç satırı — aktif, hover ve nested çocuk state'lerini tek yerde yönetir.
 * `href`'i olan öğeler gerçek Link; yoksa henüz sayfası olmayan yer tutucu buton.
 * `open`: etiketler her zaman DOM'da (clip ile açılır); çocuklar yükseklik animasyonuyla.
 */
export function AppSidebarNavItem({
  item,
  open = true,
}: {
  item: SidebarNavItem;
  open?: boolean;
}) {
  const pathname = usePathname();
  const childActive = item.children?.some((c) => c.href === pathname) ?? false;
  const active = (Boolean(item.href) && pathname === item.href) || childActive;

  return (
    <div>
      <NavRow
        label={item.label}
        icon={item.icon}
        href={item.href}
        active={active}
        reveal={open}
      />
      {item.children && item.children.length > 0 ? (
        <motion.div
          initial={false}
          animate={
            open
              ? { height: "auto", opacity: 1 }
              : { height: 0, opacity: 0 }
          }
          transition={{
            duration: open ? 0.32 : 0,
            ease: [0.16, 1, 0.3, 1],
            delay: open ? 0.06 : 0,
          }}
          className="overflow-hidden"
          inert={!open}
        >
          <div className="mt-0.5 mb-1 ml-4 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
            {item.children.map((child) => (
              <NavRow
                key={child.id}
                label={child.label}
                icon={child.icon}
                href={child.href}
                active={Boolean(child.href) && pathname === child.href}
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
}: {
  label: string;
  icon: LucideIcon;
  href?: string;
  active: boolean;
  nested?: boolean;
  reveal?: boolean;
}) {
  const className = cn(
    "group flex items-center rounded-md text-left outline-none transition-colors duration-150",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
    reveal
      ? cn(
          "w-full gap-2.5 px-2.5",
          nested ? "h-8 text-[12.5px]" : "h-9 text-[13px]",
          active
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )
      : cn(
          "size-9 shrink-0 justify-center px-0",
          nested && "size-8",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-border"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )
  );

  const content = (
    <>
      <Icon
        className={cn(
          "shrink-0",
          nested ? "size-3.5" : "size-4",
          active
            ? "text-sidebar-accent-foreground"
            : "text-muted-foreground group-hover:text-sidebar-accent-foreground"
        )}
      />
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

  if (href) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} title={label} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" title={label} className={className}>
      {content}
    </button>
  );
}
