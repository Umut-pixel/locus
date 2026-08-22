/**
 * SSE token'larını kelime kelime, hafif gecikmeyle gösterir.
 * Agent hızlı basınca kuyruk birikir — o zaman adım büyür, kilitlenmez.
 */
import { useEffect, useState } from "react";

const WORD_MS = 42;

function tokenize(text: string): string[] {
  if (!text) return [];
  return text.match(/\S+\s*|\s+/g) ?? [text];
}

export function useRevealedText(source: string, active: boolean): string {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!active) {
      setShown(source);
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(source);
      return;
    }

    const id = window.setInterval(() => {
      setShown((current) => {
        if (!source.startsWith(current)) return source.slice(0, 0);
        if (current === source) return current;
        const target = tokenize(source);
        const have = tokenize(current);
        const behind = target.length - have.length;
        if (behind <= 0) return source;
        const step = behind > 36 ? 4 : behind > 12 ? 2 : 1;
        return target.slice(0, have.length + step).join("");
      });
    }, WORD_MS);
    return () => window.clearInterval(id);
  }, [source, active]);

  return active ? shown : source;
}
