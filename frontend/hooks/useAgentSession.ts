"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AgentStreamEvent } from "@/lib/agent-stream";
import { streamAgent } from "@/lib/agent-stream";
import { useRevealedText } from "@/lib/agent-reveal";
import {
  applyTraceEvent,
  contextsFromTrace,
  tasksFromTrace,
  type TraceRow,
} from "@/lib/agent-trace";

export type ChatRole = "user" | "assistant" | "error";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  streaming?: boolean;
  quote?: string;
  trace?: TraceRow[];
};

const QUOTE_MAX = 800;
const QUOTE_FALLBACK = "Bu alıntıyı açıkla.";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function composeQuotedPrompt(question: string, quote: string): string {
  const clipped = quote.length > QUOTE_MAX ? `${quote.slice(0, QUOTE_MAX - 1)}…` : quote;
  return [
    "Kullanıcı önceki yanıttan şu parçayı işaretledi. Yalnız bu alıntıya yanıt ver; alıntı dışını gerekmedikçe genişletme.",
    `Alıntı: «${clipped}»`,
    "",
    question,
  ].join("\n");
}

export function useAgentSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceRow[]>([]);
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [pendingQuote, setPendingQuoteState] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const traceRef = useRef<TraceRow[]>([]);
  const quoteRef = useRef<string | null>(null);

  const [revealId, setRevealId] = useState<string | null>(null);
  if (answerId && answerId !== revealId) {
    setRevealId(answerId);
  }
  const revealMsg =
    messages.find((m) => m.id === answerId) ??
    messages.find((m) => m.id === revealId);
  const { text: revealed, pending: revealing } = useRevealedText(
    revealMsg?.text ?? "",
    Boolean(answerId)
  );
  const replySettled =
    !busy && messages.some((m) => m.role === "assistant" && m.text.length > 0);
  const tasks = tasksFromTrace(trace, replySettled, busy);
  const contexts = contextsFromTrace(trace);

  const setTraceBoth = useCallback((next: TraceRow[] | ((rows: TraceRow[]) => TraceRow[])) => {
    setTrace((rows) => {
      const resolved = typeof next === "function" ? next(rows) : next;
      traceRef.current = resolved;
      return resolved;
    });
  }, []);

  const setPendingQuote = useCallback((quote: string | null) => {
    quoteRef.current = quote;
    setPendingQuoteState(quote);
  }, []);

  const sealLive = useCallback((yanitId: string | null) => {
    const snapshot = traceRef.current;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === yanitId || m.streaming
          ? { ...m, streaming: false, trace: snapshot }
          : m
      )
    );
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setAnswerId(null);
    sealLive(null);
  }, [sealLive]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback((question: string) => {
    const alinti = quoteRef.current?.trim() || undefined;
    const q = question.trim() || (alinti ? QUOTE_FALLBACK : "");
    if (!q) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const previousTrace = traceRef.current;

    setDraft("");
    setPendingQuote(null);
    setBusy(true);
    traceRef.current = [];
    setTrace([]);
    setAnswerId(null);
    setMessages((prev) => [
      ...prev.map((m) =>
        m.streaming ? { ...m, streaming: false, trace: m.trace ?? previousTrace } : m
      ),
      { id: uid(), role: "user", text: q, quote: alinti },
    ]);

    let yanitId: string | null = null;
    let hataVar = false;
    const outbound = alinti ? composeQuotedPrompt(q, alinti) : q;

    const onEvent = (event: AgentStreamEvent) => {
      if (controller.signal.aborted) return;
      switch (event.kind) {
        case "tool":
        case "tool_update":
        case "tool_result":
          setTraceBoth((rows) => applyTraceEvent(rows, event));
          break;
        case "text": {
          let id = yanitId;
          if (id === null) {
            const yeni = uid();
            yanitId = yeni;
            id = yeni;
            setAnswerId(yeni);
            setMessages((prev) => [
              ...prev,
              { id: yeni, role: "assistant", text: "", streaming: true },
            ]);
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, text: m.text + event.delta } : m))
          );
          break;
        }
        case "error":
          hataVar = true;
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: "error", text: event.message },
          ]);
          break;
        case "debug":
          console.debug("[agent] tanınmayan SSE karesi:", event.raw);
          break;
      }
    };

    void streamAgent({
      message: outbound,
      signal: controller.signal,
      onEvent,
    }).then(() => {
      if (controller.signal.aborted) return;
      if (!hataVar && yanitId === null) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "error",
            text:
              "Agent yanıt döndürmedi. `langgraph dev` çalışıyor mu ve AGENT_URL doğru mu kontrol et.",
          },
        ]);
      }
      sealLive(yanitId);
      setBusy(false);
      setAnswerId(null);
      abortRef.current = null;
    });
  }, [sealLive, setPendingQuote, setTraceBoth]);

  return {
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
  };
}
