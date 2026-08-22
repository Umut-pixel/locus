"use client";

import { useEffect, useState } from "react";

import type { ContextChunk } from "@/lib/agent-trace";
import { cn } from "@/lib/utils";

export function ContextCards({ chunks }: { chunks: ContextChunk[] }) {
  const [chipsShown, setChipsShown] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setChipsShown(true), 400);
    return () => clearTimeout(t);
  }, [chunks.length]);

  if (chunks.length === 0) return null;

  return (
    <div className="flex w-full max-w-xl flex-col gap-2">
      <div className="flex items-center gap-2 px-0.5" style={{ animation: "fade-in 400ms ease-out both" }}>
        <span className="text-[13px] font-semibold text-ink">Kaynaklar</span>
        <span className="inline-flex h-5 items-center rounded-md bg-inset px-1.5 text-[11.5px] font-medium text-ink-2 shadow-hairline tabular-nums">
          {chunks.length}
        </span>
      </div>
      {chunks.map((chunk, i) => (
        <div
          key={chunk.id}
          className="overflow-hidden rounded-[14px] bg-card shadow-agent"
          style={{ animation: `fade-up 400ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both` }}
        >
          <div className="flex items-center gap-2.5 border-b border-line px-3 py-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
              <span className="truncate">{chunk.title}</span>
            </span>
            <span className="ml-auto shrink-0 text-[12px] text-ink-3 tabular-nums">{chunk.chars}</span>
          </div>
          <p className="px-3 pt-2 pb-1 text-[12.5px] leading-relaxed text-ink-2">{chunk.body}</p>
          <div className="px-3 pb-3">
            <span
              className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-inset px-2 text-[12px] font-medium text-ink-2 shadow-btn"
              style={{
                opacity: chipsShown ? 1 : 0,
                transform: chipsShown ? "scale(1)" : "scale(0.95)",
                transition: "opacity 300ms, transform 300ms",
                transitionDelay: `${i * 80}ms`,
              }}
            >
              <span
                className={cn(
                  "flex size-3.5 items-center justify-center rounded-[4px] text-[7px] font-bold text-white",
                  chunk.tone
                )}
              >
                {chunk.badge}
              </span>
              <span className="truncate">{chunk.source}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
