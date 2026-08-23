"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  HouseIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  PinIcon,
  Trash2Icon,
} from "lucide-react";
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
  const router = useRouter();
  const activeId = pathname === "/home" ? params.get("k") : null;
  const onFreshHome = pathname === "/home" && !activeId;
  const { items, loading, remove, togglePin } = useKonusmalar();
  const [expanded, setExpanded] = useState(false);

  const hidden = items.length > SIDEBAR_KONUSMA_PREVIEW;
  const visible = expanded || !hidden ? items : items.slice(0, SIDEBAR_KONUSMA_PREVIEW);

  return (
    <div className="flex flex-col gap-0.5 pb-1">
      <RailLink
        href="/home"
        label={activeId ? "Ana sayfa" : "Yeni konuşma"}
        icon={activeId ? HouseIcon : MessageSquarePlusIcon}
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
              pinned={item.sabitlendi}
              onPin={() => void togglePin(item.id, !item.sabitlendi)}
              onDelete={() => {
                void remove(item.id);
                if (activeId === item.id) router.push("/home");
              }}
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
  icon: LucideIcon;
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
  pinned,
  onPin,
  onDelete,
}: {
  href: string;
  label: string;
  active: boolean;
  pinned: boolean;
  onPin: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  return (
    <div className={SIDEBAR_ROW}>
      <span aria-hidden style={{ width: ICON_RAIL_WIDTH }} />
      <div
        className={cn(
          "group/chat relative mr-3 flex h-8 min-w-0 items-center rounded-md",
          "transition-colors duration-150",
          active
            ? "bg-black/[0.06] dark:bg-white/[0.08]"
            : "hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
        )}
      >
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          title={label}
          onClick={(e) => {
            e.preventDefault();
            router.push(href);
          }}
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-[12.5px] outline-none",
            "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
            active
              ? "font-medium text-sidebar-foreground"
              : "font-medium text-muted-foreground group-hover/chat:text-sidebar-foreground",
            pinned ? "pr-8" : "pr-1.5",
            "group-hover/chat:pr-[52px] group-focus-within/chat:pr-[52px]"
          )}
        >
          <MessageSquareIcon className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </Link>
        <div className="absolute top-1/2 right-0.5 z-[1] flex -translate-y-1/2 items-center">
          <RowAction
            label={pinned ? "Sabitlemeyi kaldır" : "Başa sabitle"}
            pressed={pinned}
            onClick={onPin}
            className={cn(
              "pointer-events-none text-muted-foreground opacity-0",
              "group-hover/chat:pointer-events-auto group-hover/chat:opacity-100",
              "group-focus-within/chat:pointer-events-auto group-focus-within/chat:opacity-100",
              "[@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
              pinned && "pointer-events-auto opacity-100 text-sidebar-foreground"
            )}
          >
            <PinIcon className={cn("size-3.5", pinned && "fill-current")} />
          </RowAction>
          <RowAction
            label="Konuşmayı sil"
            onClick={onDelete}
            className={cn(
              "pointer-events-none text-muted-foreground opacity-0",
              "hover:text-red-600 dark:hover:text-red-400",
              "group-hover/chat:pointer-events-auto group-hover/chat:opacity-100",
              "group-focus-within/chat:pointer-events-auto group-focus-within/chat:opacity-100",
              "[@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
            )}
          >
            <Trash2Icon className="size-3.5" />
          </RowAction>
        </div>
      </div>
    </div>
  );
}

function RowAction({
  label,
  pressed,
  onClick,
  className,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md outline-none",
        "transition-opacity duration-150",
        "hover:bg-black/[0.06] dark:hover:bg-white/[0.08]",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
        className
      )}
    >
      {children}
    </button>
  );
}
