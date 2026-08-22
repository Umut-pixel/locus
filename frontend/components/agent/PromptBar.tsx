"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

function Icon({
  children,
  size = 15,
  strokeWidth = 1.8,
}: {
  children: ReactNode;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const GLYPHS: Record<string, ReactNode> = {
  clip: <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  layers: (
    <g>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
    </g>
  ),
  truck: (
    <g>
      <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </g>
  ),
};

type Source = { key: string; name: string; desc: string; glyph: string; prompt: string };

const SOURCES: Source[] = [
  {
    key: "musteriler",
    name: "Müşteri raporu",
    desc: "Ciro, borç, teslimat",
    glyph: "layers",
    prompt: "@musteriler_rapor ",
  },
  {
    key: "sevkiyat",
    name: "Sevkiyat",
    desc: "Teslimat ve plaka",
    glyph: "truck",
    prompt: "@sevkiyat ",
  },
  {
    key: "stok",
    name: "Stok / SKT",
    desc: "Depo ve son kullanma",
    glyph: "layers",
    prompt: "@urun_skt ",
  },
  {
    key: "gecmis",
    name: "Metrik geçmişi",
    desc: "Günlük ciro trendi",
    glyph: "chart",
    prompt: "@musteri_metrik_gecmis ",
  },
];

const COMMANDS = [
  { key: "ciro", name: "/ciro", desc: "KDV hariç net ciro özeti", prompt: "Bu dönem net ciro (KDV hariç) nedir?" },
  { key: "risk", name: "/risk", desc: "Teslimat riski kırılımı", prompt: "Risk durumuna göre müşteri sayısı nedir?" },
  { key: "borc", name: "/borc", desc: "Yaşlandırma 30/40/50+", prompt: "30 günü aşan borçlu müşterileri listele" },
  { key: "stok", name: "/stok", desc: "SKT yaklaşan ürünler", prompt: "Son kullanma tarihi yaklaşan ürünler neler?" },
  { key: "ilce", name: "/ilce", desc: "İlçe teslimat + borç", prompt: "Bornova ilçesindeki teslimat ve borç durumunu göster" },
];

function parseToken(draft: string): { kind: "at" | "slash"; query: string; start: number } | null {
  const m = /(^|\s)([@/])([\w-]*)$/.exec(draft);
  if (!m) return null;
  return {
    kind: m[2] === "@" ? "at" : "slash",
    query: m[3]!.toLowerCase(),
    start: m.index + m[1]!.length,
  };
}

export function PromptBar({
  value,
  onChange,
  onSend,
  onStop,
  busy = false,
  tall = false,
  placeholder = "Veriye bir şey sor…",
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop?: () => void;
  busy?: boolean;
  tall?: boolean;
  placeholder?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [listening, setListening] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const wide = expanded || tall;

  const token = dismissed ? null : parseToken(value);
  const menu: "at" | "slash" | null = plusOpen ? "at" : token?.kind ?? null;
  const query = plusOpen ? "" : token?.query ?? "";
  const rows =
    menu === "at"
      ? SOURCES.filter((s) => s.name.toLowerCase().includes(query) || s.key.includes(query))
      : menu === "slash"
        ? COMMANDS.filter((c) => c.name.slice(1).startsWith(query) || c.desc.toLowerCase().includes(query))
        : [];

  useEffect(() => {
    setActive(0);
    setEngaged(false);
  }, [menu, query]);

  useLayoutEffect(() => {
    const target = rowRefs.current[active];
    if (target) setRowBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [menu, query, active, rows.length]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const controls = controlsRef.current;
    const measure = measureRef.current;
    if (!input || !controls || !measure) return;
    const inlineInputWidth = controls.clientWidth - 28 * 3 - 16;
    const needsFull = value.includes("\n") || measure.offsetWidth + 8 > inlineInputWidth;
    if (needsFull !== expanded) setExpanded(needsFull);
    input.style.height = "0px";
    const h = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(h, 28), tall ? 120 : 100)}px`;
    input.style.overflowY = h > (tall ? 120 : 100) ? "auto" : "hidden";
  }, [value, expanded, tall]);

  useEffect(() => {
    if (!plusOpen) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[data-promptbar]")) setPlusOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [plusOpen]);

  useEffect(() => {
    if (!listening) return;
    const Speech = (
      window as unknown as {
        webkitSpeechRecognition?: new () => {
          lang: string;
          onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        };
      }
    ).webkitSpeechRecognition;
    if (!Speech) {
      setListening(false);
      return;
    }
    const rec = new Speech();
    rec.lang = "tr-TR";
    rec.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript ?? "";
      if (t) onChange(value ? `${value.trimEnd()} ${t}` : t);
      setListening(false);
      inputRef.current?.focus();
    };
    rec.onend = () => setListening(false);
    rec.start();
    return () => rec.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  const pick = (row: { key: string; name: string }) => {
    const source = SOURCES.find((s) => s.key === row.key);
    const cmd = COMMANDS.find((c) => c.key === row.key);
    if (source) {
      onChange(`${token ? value.slice(0, token.start) : value}${source.prompt}`);
    } else if (cmd) {
      onChange(cmd.prompt);
    }
    setPlusOpen(false);
    setDismissed(false);
    inputRef.current?.focus();
  };

  const canSend = value.trim().length > 0;
  const send = () => {
    if (!canSend || busy) return;
    onSend(value.trim());
    setPlusOpen(false);
  };

  return (
    <div data-promptbar className="w-full">
      <div className="relative">
        {menu ? (
          <div
            onMouseLeave={() => setEngaged(false)}
            className="absolute inset-x-0 bottom-full z-10 mb-2 rounded-[10px] bg-card p-1 shadow-raised"
            style={{
              animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
              transformOrigin: "bottom center",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
              style={{
                top: rowBox?.top ?? 0,
                height: rowBox?.height ?? 0,
                opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
                transition:
                  "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
              }}
            />
            {rows.map((row, i) => {
              const source = menu === "at" ? SOURCES.find((s) => s.key === row.key) : undefined;
              return (
                <button
                  key={row.key}
                  type="button"
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => {
                    setActive(i);
                    setEngaged(true);
                  }}
                  onClick={() => pick(row)}
                  className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left"
                >
                  {source ? (
                    <span className="flex size-5.5 shrink-0 items-center justify-center text-ink-2">
                      <Icon size={15}>{GLYPHS[source.glyph]}</Icon>
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[12.5px] font-medium text-ink">{row.name}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
                    {"desc" in row ? row.desc : ""}
                  </span>
                </button>
              );
            })}
            {rows.length === 0 ? (
              <div className="flex h-9 items-center px-2 text-[12px] text-ink-3">
                “{query}” için eşleşme yok
              </div>
            ) : null}
            <div className="mt-1 border-t border-line px-2 pt-1.5 pb-1 text-[11px] text-ink-3">
              {menu === "at" ? "Kaynak seç — sorguya eklenir" : "Komut seç — hazır soru doldurulur"}
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "relative isolate flex flex-col overflow-hidden border border-line bg-card shadow-agent transition-[border-color] duration-150 focus-within:border-line-strong",
            tall ? "gap-2.5 rounded-[22px] p-3.5" : "gap-1.5 rounded-[14px] p-1.5"
          )}
        >
          <span
            ref={measureRef}
            aria-hidden
            className="pointer-events-none invisible absolute whitespace-pre text-[13px] leading-[18px]"
          >
            {value}
          </span>
          <div
            ref={controlsRef}
            className={cn(
              "grid items-end gap-x-1 gap-y-1.5",
              wide
                ? "grid-cols-[28px_minmax(0,1fr)_28px_28px]"
                : "grid-cols-[28px_minmax(0,1fr)_28px_28px]"
            )}
          >
            <button
              type="button"
              aria-label="Kaynaklar ve komutlar"
              aria-expanded={plusOpen}
              onClick={() => {
                setPlusOpen((c) => !c);
                inputRef.current?.focus();
              }}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-[8px] text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.94]",
                plusOpen && "bg-hover text-ink",
                wide ? "col-start-1 row-start-2" : "col-start-1 row-start-1"
              )}
            >
              <Icon size={16} strokeWidth={2}>
                <path d="M12 5v14M5 12h14" />
              </Icon>
            </button>

            <textarea
              ref={inputRef}
              rows={1}
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                setDismissed(false);
                setPlusOpen(false);
              }}
              onKeyDown={(event) => {
                if (menu && rows.length > 0) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setEngaged(true);
                    setActive(
                      (c) =>
                        (c + (event.key === "ArrowDown" ? 1 : rows.length - 1)) %
                        rows.length
                    );
                    return;
                  }
                  if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
                    event.preventDefault();
                    pick(rows[active]!);
                    return;
                  }
                }
                if (event.key === "Escape") {
                  setDismissed(true);
                  setPlusOpen(false);
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={listening ? "Dinleniyor…" : placeholder}
              aria-label="Prompt"
              className={cn(
                "min-w-0 w-full resize-none bg-transparent text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3",
                tall
                  ? "min-h-[68px] px-2 py-2 text-[14px] leading-5"
                  : "min-h-7 px-1 py-[5px] text-[13px] leading-[18px]",
                wide ? "col-span-full col-start-1 row-start-1" : "col-start-2 row-start-1"
              )}
            />

            <button
              type="button"
              aria-label={listening ? "Dikteyi durdur" : "Dikte"}
              aria-pressed={listening}
              onClick={() => setListening((c) => !c)}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-150 active:scale-[0.94]",
                listening ? "bg-accent-tint text-accent-ink" : "text-ink-3 hover:bg-hover hover:text-ink",
                wide ? "col-start-3 row-start-2" : "col-start-3 row-start-1"
              )}
            >
              {listening ? (
                <span className="flex h-3.5 items-center gap-[2.5px]">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-[2.5px] rounded-full bg-current"
                      style={{
                        height: "100%",
                        animation: `eq-bounce 900ms ease-in-out ${i * 150}ms infinite`,
                      }}
                    />
                  ))}
                </span>
              ) : (
                <Icon size={15} strokeWidth={2}>
                  <g>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                  </g>
                </Icon>
              )}
            </button>

            {busy ? (
              <button
                type="button"
                aria-label="Durdur"
                onClick={onStop}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-ink text-[var(--card)] transition-transform duration-150 active:scale-[0.94]",
                  wide ? "col-start-4 row-start-2" : "col-start-4 row-start-1"
                )}
              >
                <span className="size-2.5 rounded-[2px] bg-current" />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Gönder"
                disabled={!canSend}
                onClick={send}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94]",
                  wide ? "col-start-4 row-start-2" : "col-start-4 row-start-1"
                )}
                style={{
                  background: canSend ? "var(--ink)" : "var(--line-strong)",
                  color: canSend ? "var(--card)" : "var(--ink-2)",
                }}
              >
                <Icon size={16} strokeWidth={2.4}>
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </Icon>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
