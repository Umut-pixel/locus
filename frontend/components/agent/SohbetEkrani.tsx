"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { AgentMarkdown } from "@/components/agent/AgentMarkdown";
import type { RecommendAccept } from "@/components/agent/RecommendCard";
import { ContextCards } from "@/components/agent/ContextCards";
import { LoadingState } from "@/components/agent/LoadingState";
import { MessageMeta } from "@/components/agent/MessageMeta";
import { PromptBar } from "@/components/agent/PromptBar";
import { SelectionReply } from "@/components/agent/SelectionReply";
import { TaskRows } from "@/components/agent/TaskRows";
import { ThinkingTrace } from "@/components/agent/ThinkingTrace";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { useAgentSession, type ChatMessage } from "@/hooks/useAgentSession";
import {
  contextsFromTrace,
  isComplexTrace,
  type AgentTask,
  type ContextChunk,
  type TraceRow,
} from "@/lib/agent-trace";

const EXIT_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Tek bir konuşmanın ekranı — /sohbet/{slug}-{no}.
 *
 * Eskiden bu görünüm /home ile aynı sayfayı paylaşıyordu (?k=<uuid>) ve
 * "Ana sayfa" düğmesi aynı pathname'e push ettiği için ekran değişmiyordu.
 * Artık ayrı route: düğme gerçek bir navigasyon.
 */
export function SohbetEkrani({ konusmaId }: { konusmaId: string }) {
  const {
    threadId,
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
    loadThread,
  } = useAgentSession();

  useEffect(() => {
    if (konusmaId && konusmaId !== threadId) {
      void loadThread(konusmaId);
    }
  }, [konusmaId, threadId, loadThread]);

  const sonRef = useRef<HTMLDivElement | null>(null);
  const waiting = busy && !answerId;
  const complex = isComplexTrace(trace);
  const reduced = useReducedMotion();

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
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-background/90 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 backdrop-blur-sm sm:px-4">
        <div className="pointer-events-auto">
          <AppSidebarMobileTrigger />
        </div>
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
            // Navigasyonu Link'in kendisi yapsın; burada yalnız çalışan turu
            // kesip provider state'ini temizliyoruz — provider layout
            // seviyesinde yaşıyor, route değişince kendiliğinden sıfırlanmaz.
            reset();
          }}
          className="pointer-events-auto inline-flex h-10 min-w-0 max-w-[min(100%,16rem)] items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
        >
          <ArrowLeftIcon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Ana sayfa</span>
        </Link>
        <span className="ml-auto hidden font-mono text-[10px] tracking-wide text-ink-3 uppercase sm:inline">
          locus-analyst
        </span>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {messages.length > 0 ? (
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
                    onAcceptRecommend={
                      busy
                        ? undefined
                        : (choice) => {
                            send(
                              `Öneri kartını uygula. ${choice.question} Seçenek (${choice.key}): ${choice.short}. ${choice.body}`.slice(
                                0,
                                4000
                              )
                            );
                          }
                    }
                  />
                ))}
                {waiting ? (
                  <WorkPanel busy={busy} trace={trace} tasks={tasks} complex={complex} />
                ) : null}
                <div ref={sonRef} />
              </div>
            </motion.div>
            <div className="relative z-20 shrink-0 border-t border-line px-4 py-3">
              <div className="mx-auto w-full max-w-2xl">{composer}</div>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1" />
            <div className="relative z-20 shrink-0 border-t border-line px-4 py-3">
              <div className="mx-auto w-full max-w-2xl">{composer}</div>
            </div>
          </div>
        )}
      </div>
    </main>
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
  onAcceptRecommend,
}: {
  message: ChatMessage;
  live: boolean;
  revealed: string;
  busy: boolean;
  trace: TraceRow[];
  tasks: AgentTask[];
  contexts: ContextChunk[];
  onReply: (quote: string) => void;
  onAcceptRecommend?: (choice: RecommendAccept) => void;
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
          <div className="group">
            <AgentMarkdown
              streaming={live}
              onAccept={live ? undefined : onAcceptRecommend}
            >
              {body}
            </AgentMarkdown>
            <MessageMeta at={m.at} model={m.model} />
          </div>
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
