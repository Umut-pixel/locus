"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageSquareIcon, MessageSquarePlusIcon } from "lucide-react";
import { motion } from "motion/react";

import { SidebarIconCell, SidebarLabel } from "@/components/sidebar/AppSidebarNavItem";
import { useKonusmalar } from "@/hooks/useKonusmalar";
import { SIDEBAR_KONUSMA_PREVIEW } from "@/lib/agent-konusma";
import {
  ICON_RAIL_WIDTH,
  RAIL_PILL_INSET,
  RAIL_PILL_SIZE,
  SIDEBAR_EXPANDED_WIDTH,
  SIDEBAR_ROW,
  sidebarTween,
} from "@/lib/sidebar-layout";
import { cn } from "@/lib/utils";

export function KonusmalarNav({ open }: { open: boolean }) {
  return (
    <Suspense fallback={null}>
      <KonusmalarNavInner open={open} />
    </Suspense>
  );
}

function KonusmalarNavInner({ open }: { open: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const activeId = pathname === "/home" ? params.get("k") : null;
  const onFreshHome = pathname === "/home" && !activeId;
  const { items, loading } = useKonusmalar();
  const [expanded, setExpanded] = useState(false);

  const hidden = items.length > SIDEBAR_KONUSMA_PREVIEW;
  const visible = expanded || !hidden ? items : items.slice(0, SIDEBAR_KONUSMA_PREVIEW);

  return (
    <div className="flex flex-col gap-0.5 pb-1">
      <RailLink
        href="/home"
        label="Yeni konuşma"
        icon={MessageSquarePlusIcon}
        active={onFreshHome}
        open={open}
        clearQuery
      />
      {open ? (
        <>
          {loading && items.length === 0 ? (
            <p className="px-3 py-1.5 pl-[var(--sidebar-rail)] text-[12px] text-muted-foreground">
              Konuşmalar yükleniyor…
            </p>
          ) : null}
          {!loading && items.length === 0 ? (
            <p className="px-3 py-1.5 pl-[var(--sidebar-rail)] text-[12px] leading-snug text-muted-foreground">
              İlk soruyu yaz — konuşma burada durur.
            </p>
          ) : null}
          {visible.map((item) => (
            <ChatLink
              key={item.id}
              href={`/home?k=${item.id}`}
              label={item.baslik}
              active={activeId === item.id}
            />
          ))}
          {hidden ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={cn(
                "ml-[var(--sidebar-rail)] mr-3 flex h-7 items-center rounded-md px-1.5",
                "text-left text-[12px] font-medium text-muted-foreground",
                "outline-none hover:bg-black/[0.04] hover:text-sidebar-foreground",
                "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
                "dark:hover:bg-white/[0.04]"
              )}
            >
              {expanded
                ? "Daha az"
                : `Daha fazla · ${items.length - SIDEBAR_KONUSMA_PREVIEW}`}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RailLink({
  href,
  label,
  icon: Icon,
  active,
  open,
  clearQuery = false,
}: {
  href: string;
  label: string;
  icon: typeof MessageSquarePlusIcon;
  active: boolean;
  open: boolean;
  clearQuery?: boolean;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={open ? undefined : label}
      onClick={(e) => {
        if (!clearQuery) return;
        e.preventDefault();
        router.push(href);
      }}
      className={cn(
        SIDEBAR_ROW,
        "group relative h-8 text-left outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
        active
          ? "text-sidebar-foreground"
          : "text-muted-foreground hover:text-sidebar-foreground",
        open && !active && "hover:bg-black/[0.04] dark:hover:bg-white/[0.04]",
        open && "rounded-md"
      )}
    >
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
          !open && !active && "group-hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
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
    </Link>
  );
}

function ChatLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  const router = useRouter();
  return (
    <div className={SIDEBAR_ROW}>
      <span aria-hidden style={{ width: ICON_RAIL_WIDTH }} />
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        title={label}
        onClick={(e) => {
          e.preventDefault();
          router.push(href);
        }}
        className={cn(
          "mr-3 flex h-8 min-w-0 items-center gap-2 rounded-md px-1.5 text-left text-[12.5px] outline-none transition-colors duration-150",
          "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
          active
            ? "bg-black/[0.06] font-medium text-sidebar-foreground dark:bg-white/[0.08]"
            : "font-medium text-muted-foreground hover:bg-black/[0.04] hover:text-sidebar-foreground dark:hover:bg-white/[0.04]"
        )}
      >
        <MessageSquareIcon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    </div>
  );
}
