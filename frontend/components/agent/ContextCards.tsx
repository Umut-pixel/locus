"use client";

import { ChevronRightIcon } from "lucide-react";

import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ContextChunk } from "@/lib/agent-trace";

export function ContextCards({ chunks }: { chunks: ContextChunk[] }) {
  if (chunks.length === 0) return null;

  const ids = chunks.map((c) => c.id).join();

  return (
    <Collapsible key={ids} defaultOpen={false} className="w-full max-w-xl">
      <CollapsibleTrigger className="group flex h-7 w-fit items-center gap-1 rounded-[6px] px-1 text-[11.5px] text-ink-3 outline-none transition-colors hover:bg-hover-2 hover:text-ink-2">
        <ChevronRightIcon className="size-3 shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-90" />
        <span>Kaynaklar</span>
        <span className="tabular-nums">{chunks.length}</span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <ul className="mt-0.5 flex flex-col gap-0.5 pb-0.5">
          {chunks.map((chunk) => (
            <li key={chunk.id} className="flex min-w-0 items-baseline gap-2 px-1 py-0.5">
              <span className="shrink-0 font-mono text-[10px] tracking-wide text-ink-3">
                {chunk.badge}
              </span>
              <span className="min-w-0 truncate text-[12px] text-ink">{chunk.title}</span>
              {chunk.source !== chunk.title ? (
                <span className="min-w-0 truncate font-mono text-[11px] text-ink-3" title={chunk.source}>
                  {chunk.source}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </CollapsiblePanel>
    </Collapsible>
  );
}
