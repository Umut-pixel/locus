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
        <span key={i} className="agent-word">
          {token}
        </span>
      ))}
      {caret ? <span className="agent-caret" aria-hidden /> : null}
    </p>
  );
}
