"use client";

import { useLayoutEffect, useRef, useState } from "react";

import type { TraceRow } from "@/lib/agent-trace";
import { thinkingHeadline } from "@/lib/agent-trace";
import { cn } from "@/lib/utils";

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-red)" strokeWidth="2.5" strokeLinecap="round" className="shrink-0">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function ThinkingTrace({
  rows,
  working,
}: {
  rows: TraceRow[];
  working: boolean;
}) {
  const [manual, setManual] = useState<boolean | null>(null);
  const expanded = manual ?? false;
  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);
  const head = thinkingHeadline(rows, working);

  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [rows, expanded, working]);

  return (
    <div className="flex w-full max-w-xl flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManual((current) => !(current ?? false))}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-[8px] px-1.5 py-1 transition-colors duration-100 hover:bg-hover-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={working ? "var(--ink-2)" : "var(--ink-3)"}>
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
        <span role="status" className="contents">
          {working ? (
            <span
              className="bg-clip-text text-[13px] font-medium whitespace-nowrap text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
                backgroundSize: "200% 100%",
                animation: "shimmer-text 1.4s linear infinite",
              }}
            >
              {head.active}
            </span>
          ) : (
            <span className="text-[13px] font-medium whitespace-nowrap text-ink-2">
              {head.done}
            </span>
          )}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-400"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-4">
            <span
              aria-hidden
              className="absolute top-[-8px] left-[3px] w-px origin-top bg-line"
              style={{
                height: Math.max(0, lineHeight - 2),
                transform: expanded ? "scaleY(1)" : "scaleY(0)",
                transition: "transform 500ms cubic-bezier(0.23,1,0.32,1)",
              }}
            />
            <div ref={traceRef} className="flex flex-col gap-1 py-1">
              {rows.length === 0 && working ? (
                <div className="flex min-h-7 items-center gap-2 px-1.5">
                  <span
                    className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
                    style={{ animation: "spin 700ms linear infinite" }}
                  />
                  <span className="text-[12.5px] text-ink-2">Planı kuruyor</span>
                </div>
              ) : null}
              {rows.map((row, i) => (
                <div
                  key={row.id}
                  className="flex min-h-7 w-full items-center gap-2 rounded-[6px] px-1.5 py-0.5"
                  style={{
                    animation: `fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both`,
                  }}
                >
                  {row.status === "running" ? (
                    <span
                      className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
                      style={{ animation: "spin 700ms linear infinite" }}
                    />
                  ) : row.status === "error" ? (
                    <XIcon />
                  ) : (
                    <CheckIcon />
                  )}
                  <span className="min-w-0 truncate text-[12.5px] font-medium text-ink">
                    {row.primary}
                  </span>
                  {row.secondary ? (
                    <span
                      className={cn(
                        "min-w-0 truncate text-[11.5px] text-ink-3",
                        row.mono && "font-mono"
                      )}
                    >
                      {row.secondary}
                    </span>
                  ) : null}
                  {row.rows != null ? (
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-green tabular-nums">
                      {row.rows} satır
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
