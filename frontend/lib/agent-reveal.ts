/**
 * SSE / fast-path metnini kelime kelime açar.
 * ` ```locus ` çitleri tek parça — yarım JSON parse edilmesin.
 * Fast-path tüm metni bir anda basınca da cadence korunur; dump yok.
 */
import { useEffect, useRef, useState } from "react";

const BASE_MS = 36;
const CATCH_MS = 15;

const OPEN_FENCE = /```locus[\w-]*[ \t]*\r?\n/;

function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return text.match(/\S+\s*|\s+/g) ?? [text];
}

/** Kapanmamış locus çitini gösterme — tablo/grafik yarım parse olmasın. */
export function revealablePrefix(text: string): string {
  const idx = text.search(OPEN_FENCE);
  if (idx < 0) return text;
  const after = text.slice(idx);
  if (/^```locus[\w-]*[ \t]*\r?\n[\s\S]*?```/.test(after)) return text;
  return text.slice(0, idx);
}

/** Kelimeler + kapalı locus çitleri (çit = 1 birim). */
export function revealUnits(text: string): string[] {
  const src = revealablePrefix(text);
  const units: string[] = [];
  const re = /```locus[\w-]*[ \t]*\r?\n[\s\S]*?```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) units.push(...tokenizeWords(src.slice(last, m.index)));
    units.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < src.length) units.push(...tokenizeWords(src.slice(last)));
  return units;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useRevealedText(
  source: string,
  liveId: string | null
): { text: string; pending: boolean } {
  const [shown, setShown] = useState("");
  const shownRef = useRef("");
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const accRef = useRef(BASE_MS);
  const tickRef = useRef<(now: number) => void>(() => {});

  tickRef.current = (now: number) => {
    rafRef.current = 0;
    const src = revealablePrefix(sourceRef.current);
    let current = shownRef.current;
    if (current && !src.startsWith(current)) {
      current = "";
      shownRef.current = "";
      setShown("");
    }
    if (current === src) return;

    const dt = Math.min(32, now - lastRef.current);
    lastRef.current = now;
    accRef.current += dt;
    const target = revealUnits(src);
    const have = revealUnits(current);
    const behind = Math.max(0, target.length - have.length);
    const interval = behind > 10 ? CATCH_MS : BASE_MS;
    if (accRef.current < interval) {
      rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
      return;
    }
    accRef.current -= interval;
    const step = behind > 40 ? 4 : behind > 16 ? 2 : 1;
    const next = target.slice(0, have.length + step).join("");
    shownRef.current = next;
    setShown(next);
    rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
  };

  useEffect(() => {
    shownRef.current = "";
    setShown("");
    accRef.current = BASE_MS;
    lastRef.current = performance.now();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (!liveId) return;

    if (prefersReducedMotion()) {
      const full = revealablePrefix(sourceRef.current);
      shownRef.current = full;
      setShown(full);
      return;
    }

    rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [liveId]);

  useEffect(() => {
    if (!liveId || prefersReducedMotion()) return;
    if (rafRef.current) return;
    if (shownRef.current === revealablePrefix(source)) return;
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
  }, [source, liveId]);

  if (!liveId) return { text: source, pending: false };
  const pending = shown !== revealablePrefix(source);
  return { text: pending ? shown : revealablePrefix(source), pending };
}
