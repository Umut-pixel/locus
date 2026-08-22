"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Menu = { text: string; x: number; y: number; below: boolean };

function readSelection(root: HTMLElement): { text: string; rect: DOMRect } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const text = sel.toString().replace(/\s+/g, " ").trim();
  if (!text) return null;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { text, rect };
}

function place(rect: DOMRect): Pick<Menu, "x" | "y" | "below"> {
  const below = rect.top < 48;
  const x = Math.min(Math.max(rect.left + rect.width / 2, 56), window.innerWidth - 56);
  const y = below
    ? Math.min(rect.bottom + 8, window.innerHeight - 48)
    : Math.max(rect.top - 8, 8);
  return { x, y, below };
}

/**
 * Yanıt metninde seçim → sabit "Yanıtla" düğmesi.
 * Alıntı prompt'a düşer; agent yalnız o parçaya cevap verir.
 */
export function SelectionReply({
  enabled,
  onReply,
  children,
}: {
  enabled: boolean;
  onReply: (quote: string) => void;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  const sync = useCallback(() => {
    const root = rootRef.current;
    if (!enabled || !root) {
      setMenu(null);
      return;
    }
    const found = readSelection(root);
    if (!found) {
      setMenu(null);
      return;
    }
    setMenu({ text: found.text, ...place(found.rect) });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setMenu(null);
      return;
    }

    const onPointerUp = (event: PointerEvent) => {
      if (btnRef.current?.contains(event.target as Node)) return;
      requestAnimationFrame(sync);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
        return;
      }
      if (event.key === "Shift" || event.key.startsWith("Arrow")) sync();
    };
    const onScroll = () => setMenu(null);

    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [enabled, sync]);

  return (
    <div ref={rootRef} className="relative select-text">
      {children}
      {menu ? (
        <button
          ref={btnRef}
          type="button"
          aria-label="Seçilen metne yanıtla"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onReply(menu.text);
            window.getSelection()?.removeAllRanges();
            setMenu(null);
          }}
          className="fixed z-30 inline-flex items-center gap-1.5 rounded-[8px] bg-card px-2.5 py-1 text-[12px] font-medium text-ink shadow-raised hover:bg-hover"
          style={{
            left: menu.x,
            top: menu.y,
            transform: menu.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
            animation: "fade-in 140ms ease-out both",
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-ink-2"
            aria-hidden
          >
            <path d="M9 17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 5z" />
          </svg>
          Yanıtla
        </button>
      ) : null}
    </div>
  );
}
