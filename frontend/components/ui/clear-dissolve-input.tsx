"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { XIcon } from "lucide-react";

import {
  buildClearGlow,
  prefersReducedMotion,
  readCssEase,
  readCssNum,
} from "@/lib/input-clear-dissolve";
import { cn } from "@/lib/utils";

type ClearDissolveInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Mirror / placeholder left padding (match input padding). */
  contentClassName?: string;
  placeholderClassName?: string;
  clearButtonClassName?: string;
  startAdornment?: ReactNode;
};

/**
 * Transitions.dev — Input clear with dissolve.
 * Controlled input + mirror + placeholder + glow + clear button.
 */
export function ClearDissolveInput({
  value,
  onChange,
  placeholder = "",
  className,
  contentClassName,
  placeholderClassName,
  clearButtonClassName,
  startAdornment,
  disabled,
  ...inputProps
}: ClearDissolveInputProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const pholdRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const clearingRef = useRef(false);
  const rafRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const wrap = wrapRef.current;
    const mirror = mirrorRef.current;
    if (!wrap || !mirror || clearingRef.current) return;
    const has = value.length > 0;
    wrap.classList.toggle("has-value", has);
    if (has) mirror.textContent = value.replace(/ /g, "\u00a0");
    else if (!wrap.classList.contains("is-clearing")) mirror.textContent = "";
  }, [value]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const clearWithAnimation = useCallback(() => {
    const wrap = wrapRef.current;
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    const phold = pholdRef.current;
    const glow = glowRef.current;
    if (!wrap || !input || !mirror || !phold || !glow) return;
    if (clearingRef.current || !valueRef.current) return;

    if (prefersReducedMotion()) {
      onChange("");
      return;
    }

    clearingRef.current = true;
    const keepFocus = document.activeElement === input;
    const text = valueRef.current;
    mirror.textContent = text.replace(/ /g, "\u00a0");

    const total = readCssNum("--clear-dur", 1000);
    const outDur = readCssNum("--clear-out-dur", 400);
    const inDur = readCssNum("--clear-in-dur", 400);
    const outFly = readCssNum("--clear-out-fly", 12);
    const inFly = readCssNum("--clear-in-fly", 12);
    const blur = readCssNum("--clear-blur", 2);
    const delay = readCssNum("--glow-delay", 50);
    const peakAt = readCssNum("--glow-peak-at", 0.15);
    const gOp = readCssNum("--glow-opacity", 0.85);
    const easeOut = readCssEase("--clear-out-ease");
    const easeIn = readCssEase("--clear-in-ease");

    const cs = getComputedStyle(input);
    glow.style.background = buildClearGlow(
      mirror.textContent || text,
      cs.font,
      wrap.clientWidth || 280,
      parseFloat(cs.paddingLeft) || 12
    );
    glow.style.opacity = "0";
    phold.style.transform = `translateY(-${inFly}px)`;
    phold.style.opacity = "0.9";
    phold.style.filter = `blur(${blur}px)`;

    onChange("");
    wrap.classList.remove("has-value");
    wrap.classList.add("is-clearing");

    const t0 = performance.now();
    const tick = (now: number) => {
      const el = now - t0;
      const eo = easeOut(Math.min(1, el / outDur));
      mirror.style.transform = `translateY(${(eo * outFly).toFixed(1)}px)`;
      mirror.style.opacity = (1 - eo).toFixed(3);
      mirror.style.filter = `blur(${(eo * blur).toFixed(1)}px)`;

      const ei = easeIn(Math.min(1, el / inDur));
      phold.style.transform = `translateY(${(-inFly + ei * inFly).toFixed(1)}px)`;
      phold.style.opacity = (0.9 + ei * 0.1).toFixed(3);
      phold.style.filter = `blur(${(blur - ei * blur).toFixed(1)}px)`;

      let g = 0;
      if (el > delay) {
        const gp = Math.min(1, (el - delay) / Math.max(1, total - delay));
        g = gp < peakAt ? gp / peakAt : 1 - (gp - peakAt) / (1 - peakAt);
      }
      glow.style.opacity = (g * gOp).toFixed(3);

      if (el < total) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        wrap.classList.remove("is-clearing");
        mirror.style.cssText = "";
        phold.style.cssText = "";
        mirror.textContent = "";
        glow.style.opacity = "0";
        glow.style.background = "";
        clearingRef.current = false;
        if (keepFocus) {
          requestAnimationFrame(() =>
            input.focus({ preventScroll: true })
          );
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [onChange]);

  const keepFocus = (e: PointerEvent | MouseEvent) => {
    if (document.activeElement === inputRef.current) e.preventDefault();
  };

  const showClear = value.length > 0 && !disabled;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "t-clear",
        value.length > 0 && "has-value",
        className
      )}
    >
      {startAdornment}
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        placeholder=""
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "t-clear-field relative z-[1] h-full w-full min-w-0 bg-transparent outline-none",
          contentClassName
        )}
        {...inputProps}
      />
      <div
        ref={mirrorRef}
        className={cn("t-clear-mirror", contentClassName)}
        aria-hidden="true"
      />
      <div
        ref={pholdRef}
        className={cn(
          "t-clear-placeholder text-muted-foreground",
          contentClassName,
          placeholderClassName
        )}
        aria-hidden="true"
      >
        {placeholder}
      </div>
      <div ref={glowRef} className="t-clear-glow" aria-hidden="true" />
      <button
        type="button"
        className={cn(
          "t-clear-btn absolute top-1/2 right-2 z-[4] flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:text-foreground",
          showClear ? "opacity-100" : "pointer-events-none opacity-0",
          clearButtonClassName
        )}
        aria-label="Temizle"
        tabIndex={showClear ? 0 : -1}
        onPointerDown={keepFocus}
        onMouseDown={keepFocus}
        onClick={clearWithAnimation}
        disabled={disabled}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
