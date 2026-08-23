"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { AgentMarkdown } from "@/components/agent/AgentMarkdown";
import { ContextCards } from "@/components/agent/ContextCards";
import { HomeOverviewBento } from "@/components/agent/HomeOverviewBento";
import { LoadingState } from "@/components/agent/LoadingState";
import { PromptBar } from "@/components/agent/PromptBar";
import { SelectionReply } from "@/components/agent/SelectionReply";
import { TaskRows } from "@/components/agent/TaskRows";
import { ThinkingTrace } from "@/components/agent/ThinkingTrace";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { LightRays } from "@/components/ui/light-rays";
import { Text3DFlip } from "@/components/ui/text-3d-flip";
import { useAgentSession, type ChatMessage } from "@/hooks/useAgentSession";
import {
  contextsFromTrace,
  isComplexTrace,
  type AgentTask,
  type ContextChunk,
  type TraceRow,
} from "@/lib/agent-trace";
import { cn } from "@/lib/utils";
const ORNEK_SORULAR = [
  "Toplam kaç müşteri var?",
  "İzmir'de riskli müşteri sayısı nedir?",
  "Bu dönem en yüksek cirolu 5 müşteri kim?",
  "Bornova teslimat ve borç durumu nedir?",
];

const BASLIKLAR = [
  "Veriye ne sormak istersin?",
  "Bugün kime bakıyoruz?",
  "Ciroyu mu, riski mi?",
  "Ege'de ne öne çıkıyor?",
];

const EXIT_EASE = [0.16, 1, 0.3, 1] as const;

export default function HomePage() {
  return (
    <Suspense fallback={<main className="agent-ui h-dvh flex-1 bg-background" />}>
      <HomeChat />
    </Suspense>
  );
}

function HomeChat() {
  const router = useRouter();
  const params = useSearchParams();
  const threadId = params.get("k");
  const {
    messages,
    draft,
    setDraft,
    busy,
    trace,
    tasks,
    contexts,
    revealed,
    revealing,
    revealId,
    answerId,
    pendingQuote,
    setPendingQuote,
    send,
    stop,
    reset,
  } = useAgentSession({
    persist: true,
    threadId,
    onThread: (id) => {
      router.replace(`/home?k=${id}`);
    },
  });
  const sonRef = useRef<HTMLDivElement | null>(null);
  const sohbet = messages.length > 0;
  const waiting = busy && !answerId;
  const complex = isComplexTrace(trace);
  const reduced = useReducedMotion();
  const exit = reduced
    ? { duration: 0 }
    : { duration: 0.26, ease: EXIT_EASE };

  useEffect(() => {
    sonRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, trace, revealed, revealing, busy]);

  const composer = (
    <div>
      <PromptBar
        value={draft}
        onChange={setDraft}
        onSend={send}
        onStop={stop}
        busy={busy}
        quote={pendingQuote}
        onClearQuote={() => setPendingQuote(null)}
        placeholder="Veriye bir şey sor…  @ kaynak  / komut"
      />
      <p className="mt-2 text-center font-display text-[12px] italic text-ink-3">
        Yanıt salt okunur; önemli kararı rapordaki rakamla teyit edin.
      </p>
    </div>
  );

  return (
    <main className="agent-ui relative flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
      <AnimatePresence>
        {!sohbet ? (
          <motion.div
            key="rays"
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={exit}
          >
            <LightRays />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <header
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:px-4",
          threadId || sohbet ? "bg-background/90 backdrop-blur-sm" : null
        )}
      >
        <div className="pointer-events-auto">
          <AppSidebarMobileTrigger />
        </div>
        {threadId || sohbet ? (
          <Link
            href="/home"
            aria-label="Ana sayfaya dön"
            onClick={(event) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0
              ) {
                return;
              }
              event.preventDefault();
              if (threadId) {
                router.push("/home");
                return;
              }
              reset();
            }}
            className="pointer-events-auto inline-flex h-10 min-w-0 max-w-[min(100%,16rem)] items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
          >
            <ArrowLeftIcon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Ana sayfa</span>
          </Link>
        ) : null}
        <span className="ml-auto hidden font-mono text-[10px] tracking-wide text-ink-3 uppercase sm:inline">
          locus-analyst
        </span>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {sohbet ? (
          <>
            <motion.div
              key="thread"
              className="min-h-0 flex-1 overflow-y-auto px-4 pt-16 pb-6"
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduced ? 0 : 0.28,
                ease: EXIT_EASE,
                delay: reduced ? 0 : 0.06,
              }}
            >
              <div className="mx-auto flex max-w-2xl flex-col gap-5">
                {messages.map((m) => (
                  <Turn
                    key={m.id}
                    message={m}
                    live={m.id === revealId && (m.streaming || revealing)}
                    revealed={revealed}
                    busy={busy}
                    trace={trace}
                    tasks={tasks}
                    contexts={contexts}
                    onReply={setPendingQuote}
                  />
                ))}
                {waiting ? (
                  <WorkPanel busy={busy} trace={trace} tasks={tasks} complex={complex} />
                ) : null}
                <div ref={sonRef} />
              </div>
            </motion.div>
            <motion.div
              layout
              layoutId="home-composer"
              className="relative z-20 shrink-0 border-t border-line px-4 py-3"
              transition={{ layout: { duration: reduced ? 0 : 0.32, ease: EXIT_EASE } }}
            >
              <div className="mx-auto w-full max-w-2xl">{composer}</div>
            </motion.div>
          </>
        ) : threadId ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1" />
            <div className="relative z-20 shrink-0 border-t border-line px-4 py-3">
              <div className="mx-auto w-full max-w-2xl">{composer}</div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-4 pt-16">
              <div className="mx-auto w-full max-w-5xl">
                <RotatingHeadline />
                <p className="mb-5 text-center font-display text-[15px] leading-snug italic text-ink-3">
                  Sor — tablo ve grafik cevapta açılsın.
                </p>
              </div>
            </div>
            <motion.div
              layout
              layoutId="home-composer"
              className="relative z-20 px-4"
              transition={{ layout: { duration: reduced ? 0 : 0.32, ease: EXIT_EASE } }}
            >
              <div className="mx-auto w-full max-w-5xl">{composer}</div>
            </motion.div>
            <div className="px-4 pb-10">
              <div className="mx-auto w-full max-w-5xl">
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {ORNEK_SORULAR.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-line bg-card px-3 py-1 text-[12px] leading-5 shadow-agent transition-[border-color,background-color] duration-150 hover:border-line-strong hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="shimmer-ink font-medium">{s}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-6">
                  <HomeOverviewBento onAsk={send} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function RotatingHeadline() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const text = BASLIKLAR[index];

  useEffect(() => {
    const id = window.setInterval(() => {
      if (paused.current || document.hidden) return;
      setIndex((n) => (n + 1) % BASLIKLAR.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, []);

  const headingClass =
    "mb-1 w-full justify-center font-display text-[1.625rem] leading-snug font-semibold tracking-[-0.03em] text-ink";

  return (
    <div
      className="flex min-h-[2.6em] items-center justify-center"
      onPointerEnter={() => {
        paused.current = true;
      }}
      onPointerLeave={() => {
        paused.current = false;
      }}
    >
      {reduced ? (
        <h2 className={headingClass} aria-live="polite">
          {text}
        </h2>
      ) : (
        <Text3DFlip
          key={text}
          as="h2"
          className={headingClass}
          textClassName="bg-background text-ink"
          flipTextClassName="bg-background text-ink"
          rotateDirection="top"
          staggerFrom="center"
          playOnMount={index === 0}
        >
          {text}
        </Text3DFlip>
      )}
    </div>
  );
}

function WorkPanel({
  busy,
  trace,
  tasks,
  complex,
}: {
  busy: boolean;
  trace: TraceRow[];
  tasks: AgentTask[];
  complex: boolean;
}) {
  if (!busy) return null;
  if (!complex) {
    return <LoadingState label="Düşünüyor" />;
  }
  if (trace.length === 0) {
    return <LoadingState label="Düşünüyor" />;
  }
  return (
    <div className="flex flex-col gap-2">
      <ThinkingTrace rows={trace} working={busy} />
      <TaskRows tasks={tasks} />
    </div>
  );
}

function Turn({
  message: m,
  live,
  revealed,
  busy,
  trace,
  tasks,
  contexts,
  onReply,
}: {
  message: ChatMessage;
  live: boolean;
  revealed: string;
  busy: boolean;
  trace: TraceRow[];
  tasks: AgentTask[];
  contexts: ContextChunk[];
  onReply: (quote: string) => void;
}) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-inset px-3.5 py-2">
          {m.quote ? (
            <p className="mb-1.5 line-clamp-2 text-[11.5px] leading-snug text-ink-3">{m.quote}</p>
          ) : null}
          <p className="text-[13px] whitespace-pre-wrap text-ink">{m.text}</p>
        </div>
      </div>
    );
  }

  if (m.role === "error") {
    return (
      <div className="rounded-[12px] border border-ink-red/30 bg-red-tint px-3.5 py-2.5">
        <p className="mb-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-red uppercase">
          Hata
        </p>
        <p className="text-[13px] text-ink">{m.text}</p>
      </div>
    );
  }

  const body = live ? revealed : m.text;
  const chunks = live ? contexts : contextsFromTrace(m.trace ?? []);
  const showComplexWork = live && busy && isComplexTrace(trace);
  const showSimpleWait = live && busy && !body && !showComplexWork;

  return (
    <div className="flex flex-col gap-2.5">
      {body ? (
        <SelectionReply enabled={!live} onReply={onReply}>
          <AgentMarkdown streaming={live}>{body}</AgentMarkdown>
        </SelectionReply>
      ) : null}
      {!live && body ? <MessageActions text={body} /> : null}
      {chunks.length > 0 || showSimpleWait || showComplexWork ? (
        <div className="flex flex-col gap-2">
          {chunks.length > 0 ? <ContextCards chunks={chunks} /> : null}
          {showSimpleWait ? <LoadingState label="Düşünüyor" /> : null}
          {showComplexWork ? (
            <WorkPanel busy={busy} trace={trace} tasks={tasks} complex />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MessageActions({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Kopyala"
        onClick={() => void navigator.clipboard.writeText(text)}
        className="flex size-6 items-center justify-center rounded-[6px] text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink-2"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2.5" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
    </div>
  );
}
