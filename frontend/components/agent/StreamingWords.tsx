"use client";

import { useMemo } from "react";

export function StreamingWords({
  text,
  caret = true,
}: {
  text: string;
  caret?: boolean;
}) {
  const tokens = useMemo(() => text.match(/\S+\s*|\s+/g) ?? [], [text]);

  return (
    <p className="text-[13px] leading-relaxed text-ink">
      {tokens.map((token, i) => (
        <span
          key={`${i}-${token.slice(0, 8)}`}
          className="agent-word"
          style={{ animationDelay: `${Math.min(i, 24) * 12}ms` }}
        >
          {token}
        </span>
      ))}
      {caret ? (
        <span
          className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 rounded-full bg-ink"
          style={{ animation: "fade-in 150ms ease-out both" }}
        />
      ) : null}
    </p>
  );
}
