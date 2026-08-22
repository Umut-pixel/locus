"use client";

import { useEffect, useRef } from "react";

import { AgentMarkdown } from "@/components/agent/AgentMarkdown";
import { ContextCards } from "@/components/agent/ContextCards";
import { LoadingState } from "@/components/agent/LoadingState";
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

const ORNEK_SORULAR = [
  "Toplam kaç müşteri var?",
  "İzmir'de riskli müşteri sayısı nedir?",
  "Bu dönem en yüksek cirolu 5 müşteri kim?",
  "Bornova teslimat ve borç durumu nedir?",
];

export default function HomePage() {
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
  } = useAgentSession();
  const sonRef = useRef<HTMLDivElement | null>(null);
  const sohbet = messages.length > 0;
  const waiting = busy && !answerId;
  const complex = isComplexTrace(trace);

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
        tall={!sohbet}
        quote={pendingQuote}
        onClearQuote={() => setPendingQuote(null)}
        placeholder="Veriye bir şey sor…  @ kaynak  / komut"
      />
      <p className="mt-2 text-center text-[11px] text-ink-3">
        Salt-okunur SQL. Rakamları kritik kararlarda doğrulayın. Grafik yalnız sorgulanmış veriden.
      </p>
    </div>
  );

  return (
    <main className="agent-ui flex h-dvh min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
        <AppSidebarMobileTrigger />
        <h1 className="text-sm font-semibold text-ink">Asistan</h1>
        <span className="ml-auto font-mono text-[10px] tracking-wide text-ink-3 uppercase">
          locus-analyst
        </span>
      </header>

      {!sohbet ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            <h2 className="mb-1 text-center text-xl font-semibold text-ink">
              Veriye ne sormak istersin?
            </h2>
            <p className="mb-6 text-center text-sm text-ink-3">
              Ciro, risk, sevkiyat ve stok — tablo, filtre ve grafik yanıtta yerinde açılır.
            </p>
            {composer}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {ORNEK_SORULAR.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-line bg-card px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
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
              {waiting ? <WorkPanel busy={busy} trace={trace} tasks={tasks} complex={complex} /> : null}
              <div ref={sonRef} />
            </div>
          </div>
          <div className="shrink-0 border-t border-line px-4 py-3">
            <div className="mx-auto max-w-2xl">{composer}</div>
          </div>
        </>
      )}
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
