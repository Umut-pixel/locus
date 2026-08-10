"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import type { SidebarNavItem } from "@/lib/app-sidebar-nav";
import { cn } from "@/lib/utils";

/**
 * Ana navigasyon / araç satırı — aktif, hover ve nested çocuk state'lerini tek yerde yönetir.
 * `href`'i olan öğeler gerçek Link; yoksa henüz sayfası olmayan yer tutucu buton.
 * `collapsed`: ikon rayı modu — etiket ve çocuklar gizlenir, native `title` tooltip'i kalır.
 */
export function AppSidebarNavItem({
  item,
  collapsed = false,
}: {
  item: SidebarNavItem;
  collapsed?: boolean;
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
        collapsed={collapsed}
      />
      {!collapsed && item.children && item.children.length > 0 ? (
        <div className="mt-px mb-0.5 ml-[0.9rem] flex flex-col gap-px border-l border-sidebar-border pl-2.5">
          {item.children.map((child) => (
            <NavRow
              key={child.id}
              label={child.label}
              icon={child.icon}
              href={child.href}
              active={Boolean(child.href) && pathname === child.href}
              nested
            />
          ))}
        </div>
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
  collapsed = false,
}: {
  label: string;
  icon: LucideIcon;
  href?: string;
  active: boolean;
  nested?: boolean;
  collapsed?: boolean;
}) {
  const className = cn(
    "group flex w-full items-center rounded-md text-left outline-none transition-colors duration-150",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
    // Sabit yükseklik: collapsed'ta metin satırı olmadığı için py ile hizalamak
    // expanded haliyle (ikon + metin satır yüksekliği) farklı boy verir — h-* ile
    // her iki modda da aynı satır boyu garanti edilir.
    nested ? "h-7" : "h-8",
    collapsed
      ? "justify-center px-0"
      : cn("gap-2 px-2", nested ? "text-[11.5px]" : "text-[12.5px]"),
    active
      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
  );

  const content = (
    <>
      <Icon
        className={cn(
          "shrink-0",
          nested ? "size-3" : "size-3.5",
          active
            ? "text-sidebar-accent-foreground"
            : "text-muted-foreground group-hover:text-sidebar-accent-foreground"
        )}
      />
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
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
