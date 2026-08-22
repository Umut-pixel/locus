"use client";

import { memo, useEffect, useRef } from "react";

import { AgentMarkdown } from "@/components/agent/AgentMarkdown";
import { LoadingState } from "@/components/agent/LoadingState";
import { PromptBar } from "@/components/agent/PromptBar";
import { ThinkingTrace } from "@/components/agent/ThinkingTrace";
import { useAgentSession } from "@/hooks/useAgentSession";
import {
  AGENT_ORB,
  importActivityToPhase,
  type ImportActivity,
} from "@/lib/agent-states";
import { cn } from "@/lib/utils";

interface AgentAssistantProps {
  className?: string;
  importActivity?: ImportActivity | null;
}

/**
 * Sidebar AI asistanı — /home ile aynı iz, loader ve prompt dili.
 */
export const AgentAssistant = memo(function AgentAssistant({
  className,
  importActivity = null,
}: AgentAssistantProps) {
  const {
    messages,
    draft,
    setDraft,
    busy,
    trace,
    revealed,
    revealing,
    revealId,
    send,
    stop,
  } = useAgentSession();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const importPhase = importActivityToPhase(importActivity);
  const working = busy || Boolean(importPhase && importActivity !== "idle" && importActivity !== "error");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, trace, revealed, revealing, working]);

  const phaseLabel = importPhase
    ? AGENT_ORB[importPhase].label
    : busy
      ? "Düşünüyor"
      : "Hazır";

  return (
    <div className={cn("agent-ui flex h-full min-h-0 flex-col", className)}>
      <header className="flex shrink-0 flex-col items-center px-4 pt-4 pb-2">
        {working ? (
          <LoadingState label={phaseLabel} variant={importActivity === "matching" ? "Orbit" : "Drive"} />
        ) : (
          <p className="text-[11px] tracking-wide text-ink-3">{phaseLabel}</p>
        )}
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-1"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="text-center text-[11.5px] leading-relaxed text-ink-3">
            Veri yüklenince özet burada görünür. Sorunu aşağıya yaz.
          </p>
        ) : null}
        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[90%] rounded-2xl rounded-br-md bg-inset px-2.5 py-1.5 text-[11px] leading-snug text-ink">
                  {m.text}
                </p>
              </div>
            );
          }
          if (m.role === "error") {
            return (
              <p key={m.id} className="text-[11px] text-ink-red">
                {m.text}
              </p>
            );
          }
          const live = m.id === revealId && (m.streaming || revealing);
          const body = live ? revealed : m.text;
          if (!body) return null;
          return (
            <AgentMarkdown key={m.id} streaming={live} className="text-[12px]">
              {body}
            </AgentMarkdown>
          );
        })}
        {busy && trace.length > 0 ? (
          <ThinkingTrace rows={trace} working={busy} />
        ) : null}
      </div>

      <div className="shrink-0 px-3 pt-2 pb-3">
        <PromptBar
          value={draft}
          onChange={setDraft}
          onSend={send}
          onStop={stop}
          busy={busy}
          placeholder="Veri hakkında sor…"
        />
        <p className="mt-2 text-center text-[10px] text-ink-3">
          ORB hata yapabilir, lütfen kontrol edin.
        </p>
      </div>
    </div>
  );
});
