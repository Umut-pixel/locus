/**
 * SSE token'larını kelime kelime gösterir.
 * Kaynak hızlı gelse bile cadence korunur; kuyruk uzunsa hafif hızlanır, dump yok.
 * Sunucu bitince de kuyruk boşalana kadar devam eder — son anda sıçrama olmasın.
 */
import { useEffect, useRef, useState } from "react";

const BASE_MS = 92;
const CATCH_MS = 56;

function tokenize(text: string): string[] {
  if (!text) return [];
  return text.match(/\S+\s*|\s+/g) ?? [text];
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useRevealedText(
  source: string,
  active: boolean
): { text: string; pending: boolean } {
  const [shown, setShown] = useState("");
  const shownRef = useRef("");
  const sourceRef = useRef(source);
  const activeRef = useRef(active);
  sourceRef.current = source;
  activeRef.current = active;

  useEffect(() => {
    if (prefersReducedMotion()) {
      shownRef.current = sourceRef.current;
      setShown(sourceRef.current);
      return;
    }

    let raf = 0;
    let last = performance.now();
    let acc = BASE_MS;

    const tick = (now: number) => {
      const src = sourceRef.current;
      let current = shownRef.current;
      if (!src.startsWith(current)) {
        current = "";
        shownRef.current = "";
        setShown("");
      }
      if (current === src) {
        if (activeRef.current) raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(48, now - last);
      last = now;
      acc += dt;
      const target = tokenize(src);
      const have = tokenize(current);
      const behind = Math.max(0, target.length - have.length);
      const interval = behind > 12 ? CATCH_MS : BASE_MS;
      if (acc < interval) {
        raf = requestAnimationFrame(tick);
        return;
      }
      acc -= interval;
      const step = behind > 28 ? 2 : 1;
      const next = target.slice(0, have.length + step).join("");
      shownRef.current = next;
      setShown(next);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const pending = shown !== source;
  return { text: active || pending ? shown : source, pending };
}
