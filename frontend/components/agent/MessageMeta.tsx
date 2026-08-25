"use client";

import { formatAgentModel, formatAgentStamp } from "@/lib/format";

export function MessageMeta({
  at,
  model,
}: {
  at?: string | null;
  model?: string | null;
}) {
  const stamp = formatAgentStamp(at);
  const label = formatAgentModel(model);
  if (!stamp && !label) return null;
  return (
    <p className="pointer-events-none mt-1.5 flex min-h-[1.05rem] select-none items-baseline gap-2 text-[11px] leading-none text-ink-3/55 opacity-0 transition-opacity duration-150 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
      {label ? <span className="italic">{label}</span> : null}
      {stamp ? (
        <time dateTime={typeof at === "string" ? at : undefined}>{stamp}</time>
      ) : null}
    </p>
  );
}
