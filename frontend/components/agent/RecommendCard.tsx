"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { RecommendBlock } from "@/lib/agent-blocks";

function Meter({ signal, tone }: { signal: number; tone: string }) {
  return (
    <span className="flex items-end gap-0.5">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-full transition-colors duration-300"
          style={{
            height: 10,
            background: bar < signal ? tone : "var(--line-strong)",
          }}
        />
      ))}
    </span>
  );
}

function toneFor(signal: number): string {
  if (signal >= 3) return "var(--ink-green)";
  if (signal >= 2) return "var(--ink-orange)";
  return "var(--ink-3)";
}

export type RecommendAccept = {
  key: string;
  question: string;
  short: string;
  body: string;
};

export function RecommendCard({
  block,
  onAccept,
}: {
  block: RecommendBlock;
  onAccept?: (choice: RecommendAccept) => void;
}) {
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const active = block.options[selected] ?? block.options[0];
  if (!active) return null;
  const others = block.options.map((o, i) => ({ o, i })).filter(({ i }) => i !== selected);

  return (
    <div className="w-full max-w-xl overflow-hidden rounded-[14px] bg-card shadow-agent">
      <div className="px-4 pt-4 pb-3">
        <span className="text-[14px] font-medium text-ink">{block.question}</span>
        <p
          key={active.key}
          className="mt-1.5 min-h-10 text-[13px] leading-relaxed text-ink-2"
          style={{ animation: "fade-in 180ms ease-out both" }}
        >
          {active.body}
        </p>
      </div>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line bg-card px-2 py-2">
            <p className="px-1.5 pb-1 text-[11px] font-medium text-ink-3">Diğer seçenekler</p>
            {others.map(({ o, i }) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  setSelected(i);
                  setAccepted(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-[8px] px-1.5 py-1.5 text-left transition-colors duration-100 hover:bg-hover"
              >
                <Meter signal={o.signal} tone={toneFor(o.signal)} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{o.short}</span>
                <span className="shrink-0 text-[11px] text-ink-3">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
        <span className="flex items-center gap-2">
          <Meter signal={active.signal} tone={toneFor(active.signal)} />
          <span className="text-[12.5px] font-medium text-ink-2">{active.label}</span>
        </span>
        <span className="flex items-center gap-2">
          {others.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={open}
              onClick={() => setOpen((c) => !c)}
              className="px-2.5 text-[12.5px]"
            >
              Alternatifler
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={accepted ? "secondary" : "default"}
            className="text-[12.5px]"
            onClick={() => {
              setAccepted(true);
              onAccept?.({
                key: active.key,
                question: block.question,
                short: active.short,
                body: active.body,
              });
            }}
          >
            {accepted ? "Onaylandı" : active.cta}
          </Button>
        </span>
      </div>
    </div>
  );
}
