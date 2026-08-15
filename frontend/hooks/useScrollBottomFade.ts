"use client";

import { useCallback, useEffect, useRef } from "react";

/** Son bu kadar piksel içinde şerit yumuşakça sıfıra iner. */
const FADE_RANGE_PX = 48;
/** ScrollBottomFade bileşeninin opacity'sini okuduğu CSS değişkeni. */
const FADE_VAR = "--sb-fade-opaklik";

function hesaplaOpaklik(el: HTMLElement): number {
  // İçerik taşmıyorsa (scrollbar yok) şeride gerek yok.
  if (el.scrollHeight <= el.clientHeight + 1) return 0;
  const kalan = el.scrollHeight - el.scrollTop - el.clientHeight;
  return Math.max(0, Math.min(1, kalan / FADE_RANGE_PX));
}

/**
 * Scroll'a duyarlı alt şerit — liste sonuna kadar içerik varken görünür,
 * son ~48px'te yumuşakça kaybolur.
 *
 * React state KULLANMIYOR: `scroll` olayı saniyede onlarca kez ateşleniyor,
 * her tetiklemede `setState` çağırmak StokTable gibi 90+ satırlı bir
 * bileşeni her scroll karesinde yeniden render ettiriyordu — gözle görülür
 * lag'in asıl kaynağı buydu. Bunun yerine ortak `relative` atanın (wrapper)
 * üzerine bir CSS değişkeni yazılıyor; `ScrollBottomFade` bunu okuyor,
 * React hiç devreye girmiyor.
 *
 * `dep` (ör. filtrelenmiş satır sayısı) değişince DOM güncellendikten sonra
 * yeniden ölçülür: içerik kısalıp scrollbar kaybolursa şerit anında söner.
 */
export function useScrollBottomFade<
  W extends HTMLElement = HTMLElement,
  S extends HTMLElement = HTMLElement,
>(dep?: unknown) {
  const wrapperRef = useRef<W | null>(null);
  const scrollRef = useRef<S | null>(null);

  const olc = useCallback(() => {
    const el = scrollRef.current;
    const wrapper = wrapperRef.current;
    if (!el || !wrapper) return;
    wrapper.style.setProperty(FADE_VAR, String(hesaplaOpaklik(el)));
  }, []);

  useEffect(() => {
    olc();
  }, [olc, dep]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", olc, { passive: true });
    window.addEventListener("resize", olc);
    return () => {
      el.removeEventListener("scroll", olc);
      window.removeEventListener("resize", olc);
    };
  }, [olc]);

  return { wrapperRef, scrollRef };
}
