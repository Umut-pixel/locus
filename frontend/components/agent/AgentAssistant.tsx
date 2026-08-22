"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  memo,
  type FormEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpIcon } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";

import { Button } from "@/components/ui/button";
import { ClearDissolveInput } from "@/components/ui/clear-dissolve-input";
import {
  AGENT_ORB,
  DEMO_ANALYSIS,
  THOUGHT_FLY_MS,
  buildUploadAnalysis,
  importActivityToPhase,
  pickThoughtSequence,
  type AgentPhase,
  type ImportActivity,
} from "@/lib/agent-states";
import { TOOL_THOUGHTS, streamAgent } from "@/lib/agent-stream";
import type { UploadResult } from "@/lib/import/types";
import { cn } from "@/lib/utils";

type ChatItem =
  | { id: string; kind: "welcome"; text: string }
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "analysis"; text: string };

type ThoughtAnim = "enter" | "shown" | "exit";

type ThoughtSlot = {
  text: string;
  anim: ThoughtAnim;
  key: number;
};

type TimerHandle = ReturnType<typeof setTimeout>;

const WELCOME_CHAT = "Veri yüklenince özet analiz burada görünür.";
const ORB_FOOTER = "ORB hata yapabilir, lütfen kontrol edin.";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface AgentAssistantProps {
  className?: string;
  importActivity?: ImportActivity | null;
  lastUploadResult?: UploadResult | null;
}

/**
 * Sidebar AI asistanı.
 * Orb = kimlik; status = durum; mesajlar = analitik akış; input = etkileşim.
 */
export const AgentAssistant = memo(function AgentAssistant({
  className,
  importActivity = null,
  lastUploadResult = null,
}: AgentAssistantProps) {
  const listId = useId();
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState<ChatItem[]>([
    { id: "welcome", kind: "welcome", text: WELCOME_CHAT },
  ]);
  const [busy, setBusy] = useState(false);
  const [welcomeShown, setWelcomeShown] = useState(false);
  const [welcomeFlyOut, setWelcomeFlyOut] = useState(false);
  const [footerShown, setFooterShown] = useState(false);
  const [thought, setThought] = useState<ThoughtSlot | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<TimerHandle[]>([]);
  const importDriven = useRef(false);
  const lastImport = useRef<ImportActivity | null>(null);
  const analysisPushedForDone = useRef(false);
  const welcomeDismissed = useRef(false);
  const thoughtKey = useRef(0);
  /**
   * Devam eden akisi iptal eder: unmount'ta ve yeni soru sorulunca.
   * Olmazsa eski akis arka planda yazmaya devam eder ve iki yanit
   * birbirine karisir.
   */
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setWelcomeShown(true);
      setFooterShown(true);
      return;
    }
    let footerTimer = 0;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setWelcomeShown(true);
        footerTimer = window.setTimeout(() => setFooterShown(true), 80);
      });
    });
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(footerTimer);
    };
  }, []);

  const orb = AGENT_ORB[phase];
  const [reduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  // Idle'da sürekli scale pulse GPU yakar; yalnızca aktif fazlarda nefes al.
  const breathe = !reduceMotion && phase !== "idle" && orb.energy > 0.15;
  const breathAmp = 1 + orb.energy * 0.04;
  const breathMs = 3600 - orb.energy * 1200;

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
    return t;
  }, []);

  useEffect(
    () => () => {
      clearTimers();
      abortRef.current?.abort();
    },
    [clearTimers]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [items, phase, thought]);

  const push = useCallback((item: ChatItem) => {
    setItems((prev) => [...prev, item]);
  }, []);

  /** Akan yaniti mevcut balona ekler — her token icin yeni balon acmayiz. */
  const appendToItem = useCallback((id: string, delta: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id && item.kind === "assistant"
          ? { ...item, text: item.text + delta }
          : item
      )
    );
  }, []);

  const showThought = useCallback((text: string) => {
    thoughtKey.current += 1;
    const key = thoughtKey.current;
    setThought({ text, anim: "enter", key });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setThought((prev) =>
          prev && prev.key === key ? { ...prev, anim: "shown" } : prev
        );
      });
    });
  }, []);

  const exitThought = useCallback(() => {
    setThought((prev) => (prev ? { ...prev, anim: "exit" } : null));
  }, []);

  const lastUploadResultRef = useRef<UploadResult | null>(null);
  useEffect(() => {
    if (lastUploadResult) lastUploadResultRef.current = lastUploadResult;
  }, [lastUploadResult]);

  useEffect(() => {
    if (importActivity === lastImport.current) return;
    lastImport.current = importActivity ?? null;

    if (!importActivity || importActivity === "idle") {
      if (importDriven.current) {
        importDriven.current = false;
        setPhase("idle");
        setBusy(false);
        setThought(null);
      }
      return;
    }

    const next = importActivityToPhase(importActivity);
    if (!next) return;

    importDriven.current = true;
    clearTimers();
    setBusy(true);
    setPhase(next);

    if (importActivity === "uploading") {
      analysisPushedForDone.current = false;
      push({
        id: uid(),
        kind: "assistant",
        text: "Excel alınıyor — satırlar şekilleniyor…",
      });
      showThought("Işıl ışıl satırları yoğuruyorum…");
    }

    if (importActivity === "matching") {
      exitThought();
      later(THOUGHT_FLY_MS, () => {
        showThought("Fıldır fıldır eşleştirip haritaya seriyorum…");
      });
    }

    if (importActivity === "done" && !analysisPushedForDone.current) {
      analysisPushedForDone.current = true;
      setPhase("solving");
      exitThought();
      later(THOUGHT_FLY_MS, () => {
        setThought(null);
        const result = lastUploadResultRef.current;
        const text = result
          ? buildUploadAnalysis(result)
          : DEMO_ANALYSIS;
        push({ id: uid(), kind: "analysis", text });
      });
      later(THOUGHT_FLY_MS + 4000, () => {
        importDriven.current = false;
        setPhase("idle");
        setBusy(false);
      });
    }

    if (importActivity === "error") {
      importDriven.current = false;
      setPhase("idle");
      setBusy(false);
      setThought(null);
      push({
        id: uid(),
        kind: "assistant",
        text: "Yükleme tamamlanamadı — dosyayı kontrol edip tekrar dene.",
      });
    }
  }, [importActivity, clearTimers, later, push, showThought, exitThought]);

  /**
   * Soruyu gerçek agent'a gönderir ve yanıtı akış halinde yazar.
   *
   * Faz haritası: araç çağrısı -> "solving" (düşünce cümlesi değişir),
   * ilk metin parçası -> "composing" (balon açılır ve dolmaya başlar).
   * Yanıt kabı bilerek ilk token'da açılıyor; agent 10-20 saniye SQL
   * yazarken boş bir balon durmasın.
   */
  const runSearchScenario = useCallback(
    (question: string) => {
      clearTimers();
      // Önceki akış hâlâ sürüyorsa kes — iki yanıt aynı listeye karışmasın.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setBusy(true);
      setPhase("searching");
      setThought(null);
      push({ id: uid(), kind: "user", text: question });
      showThought(pickThoughtSequence(1)[0]);

      let answerId: string | null = null;
      let errored = false;

      void streamAgent({
        message: question,
        // threadId BİLEREK gönderilmiyor: LangGraph'ta var olmayan bir
        // thread_id'ye run açmak sürüme göre 404 verebiliyor. Deploy sonrası
        // gerçek davranış görülünce açılacak — o zamana kadar her soru
        // bağımsız (stateless) çalışır. route.ts tarafı zaten hazır.
        signal: controller.signal,
        onEvent: (event) => {
          if (controller.signal.aborted) return;

          switch (event.kind) {
            case "tool": {
              setPhase("solving");
              showThought(TOOL_THOUGHTS[event.name] ?? `${event.name} çalışıyor…`);
              break;
            }
            case "text": {
              let id = answerId;
              if (id === null) {
                id = uid();
                answerId = id;
                setPhase("composing");
                setThought(null);
                push({ id, kind: "assistant", text: "" });
              }
              appendToItem(id, event.delta);
              break;
            }
            case "error": {
              errored = true;
              setThought(null);
              push({
                id: uid(),
                kind: "assistant",
                text: `Yanıt alınamadı — ${event.message}`,
              });
              break;
            }
            case "debug": {
              // Akış biçimini ayarlamak için: tanınmayan kare konsola düşer.
              // lib/agent-stream.ts içindeki normalizasyona buradan bakılır.
              console.debug("[agent] tanınmayan SSE karesi:", event.raw);
              break;
            }
          }
        },
      }).then(() => {
        if (controller.signal.aborted) return;
        if (!errored && answerId === null) {
          push({
            id: uid(),
            kind: "assistant",
            text: "Agent bir yanıt döndürmedi. Tarayıcı konsolundaki SSE karelerine bak.",
          });
        }
        setThought(null);
        setPhase("idle");
        setBusy(false);
        abortRef.current = null;
      });
    },
    [appendToItem, clearTimers, push, showThought]
  );

  const dismissWelcome = useCallback(() => {
    if (welcomeDismissed.current) return;
    welcomeDismissed.current = true;
    setWelcomeFlyOut(true);
    later(THOUGHT_FLY_MS, () => {
      setItems((prev) => prev.filter((item) => item.kind !== "welcome"));
    });
  }, [later]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (value.trim().length > 0) {
      dismissWelcome();
    }
    if (busy || importDriven.current) return;
    if (value.trim().length > 0) {
      if (phase !== "listening") setPhase("listening");
    } else if (phase === "listening") {
      setPhase("idle");
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || busy) return;
    setDraft("");
    runSearchScenario(q);
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <header className="flex shrink-0 flex-col items-center px-4 pt-4 pb-2">
        <div className="relative flex size-[3.75rem] items-center justify-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full bg-white/[0.035] blur-xl"
            style={{
              opacity: 0.35 + orb.energy * 0.45,
              transform: `scale(${0.9 + orb.energy * 0.25})`,
            }}
          />
          <motion.div
            animate={breathe ? { scale: [1, breathAmp, 1] } : { scale: 1 }}
            transition={
              breathe
                ? {
                    duration: Math.max(breathMs, 1400) / 1000,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
                : { duration: 0.2 }
            }
            className="relative origin-center scale-[0.88]"
          >
            <ThinkingOrb
              state={orb.orbState}
              size={64}
              theme="dark"
              speed={orb.speed}
              aria-label={orb.label}
            />
          </motion.div>
        </div>

        <div className="relative mt-1.5 h-4 w-full">
          <AnimatePresence mode="wait">
            <motion.p
              key={phase + orb.label}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 text-center text-[11px] tracking-wide text-white/60"
            >
              {orb.label}
            </motion.p>
          </AnimatePresence>
        </div>
      </header>

      <div
        ref={scrollRef}
        id={listId}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-1"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <ChatRow
              key={item.id}
              item={item}
              welcomeShown={welcomeShown}
              welcomeFlyOut={welcomeFlyOut}
            />
          ))}
        </AnimatePresence>
        {thought && (
          <ThoughtSwap
            key={thought.key}
            text={thought.text}
            anim={thought.anim}
            active={busy}
          />
        )}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 px-4 pt-2 pb-3">
        <div className="flex items-center gap-1.5">
          <ClearDissolveInput
            value={draft}
            onChange={onDraftChange}
            onFocus={() => {
              if (!busy && !importDriven.current && draft.trim()) {
                setPhase("listening");
              }
            }}
            onBlur={() => {
              if (!busy && !importDriven.current && !draft.trim()) {
                setPhase("idle");
              }
            }}
            placeholder="Veri hakkında sor…"
            disabled={busy && phase !== "listening"}
            className="h-9 min-w-0 flex-1 rounded-xl border border-white/[0.06] bg-white/[0.03] text-xs text-white/90 focus-within:border-white/12"
            contentClassName="px-2.5 pr-8 text-xs text-white/90"
            placeholderClassName="text-white/30"
            clearButtonClassName="right-1.5 text-white/40 hover:text-white/80"
            aria-label="Asistan sorusu"
          />
          <Button
            type="submit"
            size="icon-sm"
            disabled={!draft.trim() || busy}
            className="size-9 shrink-0 rounded-full"
            aria-label="Gönder"
          >
            <ArrowUpIcon className="size-3.5" />
          </Button>
        </div>
        <div
          className={cn(
            "t-stagger mt-2 text-center",
            footerShown && "is-shown"
          )}
        >
          <p className="t-stagger-line t-stagger-line--1 text-[10px] leading-relaxed tracking-wide text-white/45">
            <span className="t-shimmer" data-text="ORB">
              ORB
            </span>
            {ORB_FOOTER.slice(3)}
          </p>
        </div>
      </form>
    </div>
  );
});

function ChatRow({
  item,
  welcomeShown,
  welcomeFlyOut,
}: {
  item: ChatItem;
  welcomeShown: boolean;
  welcomeFlyOut: boolean;
}) {
  if (item.kind === "welcome") {
    return (
      <div
        className={cn(
          "t-stagger overflow-hidden text-center",
          welcomeShown && !welcomeFlyOut && "is-shown",
          welcomeFlyOut && "is-fly-out is-shown"
        )}
      >
        <p className="t-stagger-line t-stagger-line--1 text-[11.5px] leading-relaxed tracking-wide text-white/55">
          {item.text}
        </p>
      </div>
    );
  }

  if (item.kind === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="flex justify-end"
      >
        <p className="max-w-[90%] rounded-2xl rounded-br-md bg-white/[0.08] px-2.5 py-1.5 text-[11px] leading-snug text-white/88">
          {item.text}
        </p>
      </motion.div>
    );
  }

  if (item.kind === "analysis") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="border-t border-white/[0.06] pt-3"
      >
        <p className="mb-1.5 font-mono text-[9px] tracking-[0.16em] text-emerald-400/70 uppercase">
          Analiz
        </p>
        <p className="text-[11.5px] leading-relaxed text-white/82">{item.text}</p>
      </motion.div>
    );
  }

  return (
    <motion.p
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-[11px] leading-relaxed text-white/58"
    >
      {item.text}
    </motion.p>
  );
}

/**
 * Tek düşünce slot’u:
 * enter = alttan gelir, exit = yukarı hiçliğe kaybolur (önceki biter, sonra yenisi).
 */
function ThoughtSwap({
  text,
  anim,
  active,
}: {
  text: string;
  anim: ThoughtAnim;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "t-stagger overflow-hidden border-l border-white/12 pl-2.5",
        anim === "shown" && "is-shown",
        anim === "exit" && "is-fly-out is-shown"
      )}
    >
      <span className="t-stagger-line t-stagger-line--1 font-mono text-[10px] leading-relaxed text-white/40">
        <span
          className={cn("t-shimmer", !active && "is-settled")}
          data-text={text}
        >
          {text}
        </span>
      </span>
    </div>
  );
}
