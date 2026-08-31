"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRightIcon, XIcon } from "lucide-react";

import { LoadingState } from "@/components/agent/LoadingState";
import { useAgentSession, type ChatMessage } from "@/hooks/useAgentSession";
import { konusmaHref } from "@/lib/agent-konusma";
import { thinkingHeadline, type AgentTask } from "@/lib/agent-trace";
import { cn } from "@/lib/utils";

function previewText(text: string, max = 140): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

function latestTurn(messages: ChatMessage[]) {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "user") {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) {
    return { user: null as ChatMessage | null, assistant: null as ChatMessage | null, error: null as ChatMessage | null };
  }
  let assistant: ChatMessage | null = null;
  let error: ChatMessage | null = null;
  for (let i = messages.length - 1; i > lastUser; i--) {
    const m = messages[i]!;
    if (!assistant && m.role === "assistant") assistant = m;
    if (!error && m.role === "error") error = m;
    if (assistant && error) break;
  }
  return { user: messages[lastUser]!, assistant, error };
}

function TaskDot({ status }: { status: AgentTask["status"] }) {
  if (status === "done") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-ink-green text-white">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-ink-red text-white">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-line" />
        <span className="absolute inset-0 animate-spin rounded-full border-t border-ink-2" />
      </span>
    );
  }
  return <span className="size-4 shrink-0 rounded-full border border-line" />;
}

/**
 * Sohbet ekranı dışındayken Analyst turunu takip kartı.
 * Çalışırken adımlar; bittiğinde yanıt özeti + sohbete dönüş.
 */
export function AgentFollowCard() {
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedMotion();
  const {
    busy,
    tasks,
    trace,
    messages,
    threadId,
    threadSiraNo,
    threadBaslik,
    revealed,
    revealId,
    stop,
  } = useAgentSession();

  // Sohbet artık kendi route'unda; kart yalnız oranın dışında görünür.
  const sohbetteyiz = pathname.startsWith("/sohbet/");
  const [dismissed, setDismissed] = useState(true);
  const wasBusy = useRef(false);
  const followRun = useRef(false);

  useEffect(() => {
    if (busy && !wasBusy.current) {
      followRun.current = true;
      setDismissed(false);
    }
    wasBusy.current = busy;
  }, [busy]);

  useEffect(() => {
    if (sohbetteyiz && !busy) {
      followRun.current = false;
      setDismissed(true);
    }
  }, [sohbetteyiz, busy]);

  const visible = !sohbetteyiz && !dismissed && followRun.current;
  const turn = latestTurn(messages);
  const head = thinkingHeadline(trace, busy);
  const streaming =
    busy && turn.assistant && turn.assistant.id === revealId
      ? revealed || turn.assistant.text
      : "";
  const outcomeError = Boolean(turn.error) && !turn.assistant?.text;
  const href =
    threadId && threadSiraNo && threadBaslik
      ? konusmaHref(threadBaslik, threadSiraNo)
      : "/home";

  const openHome = () => {
    router.push(href);
  };

  return (
    <AnimatePresence>
      {visible ? (
        <motion.aside
          key="agent-follow"
          role="status"
          aria-live="polite"
          aria-label={busy ? "Analyst çalışıyor" : outcomeError ? "Analyst hata verdi" : "Analyst yanıtı hazır"}
          initial={reduced ? false : { opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(4px)" }}
          transition={{ duration: reduced ? 0 : 0.38, ease: [0.16, 1, 0.3, 1] }}
          className="agent-ui pointer-events-auto absolute right-3 bottom-3 z-[180] w-[min(calc(100%-1.5rem),22.5rem)] sm:right-4 sm:bottom-4"
        >
          <div className="overflow-hidden rounded-[16px] bg-card shadow-[0_8px_28px_oklch(0_0_0/28%),0_0_0_1px_var(--border)]">
            <div className="flex items-start gap-2 px-3 pt-2.5 pb-1.5">
              <div className="min-w-0 flex-1">
                {busy ? (
                  <LoadingState label={head.active} variant="Drive" />
                ) : (
                  <p className="text-[13px] font-medium text-ink">
                    {outcomeError ? "Yanıt alınamadı" : "Yanıt hazır"}
                  </p>
                )}
                {turn.user ? (
                  <p className="mt-1 truncate text-[12px] text-ink-3">
                    {turn.user.text}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Kartı kapat"
                onClick={() => setDismissed(true)}
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>

            <ol className="flex flex-col gap-1 px-3 py-1.5">
              {(busy ? tasks : tasks.filter((row) => row.status !== "pending")).map((row) => (
                <li key={row.key} className="flex items-center gap-2">
                  <TaskDot status={row.status} />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[12px]",
                      row.status === "running" ? "text-ink" : "text-ink-2"
                    )}
                  >
                    {row.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-ink-3 tabular-nums">
                    {!busy && row.status === "done" && row.amount === "akıyor"
                      ? "tamam"
                      : row.amount}
                  </span>
                </li>
              ))}
            </ol>

            {!busy && (turn.assistant?.text || turn.error?.text) ? (
              <p className="line-clamp-3 px-3 pb-2 text-[12.5px] leading-snug text-ink-2">
                {previewText(outcomeError ? turn.error!.text : turn.assistant?.text || streaming)}
              </p>
            ) : null}

            {busy && streaming.trim() ? (
              <p className="line-clamp-2 px-3 pb-2 text-[12.5px] leading-snug text-ink-2">
                {previewText(streaming)}
              </p>
            ) : null}

            <div className="flex items-center gap-1.5 border-t border-line px-2.5 py-2">
              {busy ? (
                <button
                  type="button"
                  onClick={stop}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="size-2 rounded-[1.5px] bg-current" />
                  Durdur
                </button>
              ) : null}
              <button
                type="button"
                onClick={openHome}
                className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-ink px-2.5 text-[12px] font-medium text-[var(--card)] outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
              >
                Sohbete dön
                <ArrowUpRightIcon className="size-3.5" />
              </button>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
