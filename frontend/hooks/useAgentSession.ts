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
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useAgentSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceRow[]>([]);
  const [answerId, setAnswerId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const liveAnswer = messages.find((m) => m.id === answerId);
  const revealed = useRevealedText(liveAnswer?.text ?? "", Boolean(busy && liveAnswer));
  const replySettled =
    !busy && messages.some((m) => m.role === "assistant" && m.text.length > 0);
  const tasks = tasksFromTrace(trace, replySettled, busy);
  const contexts = contextsFromTrace(trace);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setAnswerId(null);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    );
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback((question: string) => {
    const q = question.trim();
    if (!q) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setDraft("");
    setBusy(true);
    setTrace([]);
    setAnswerId(null);
    setMessages((prev) => [...prev, { id: uid(), role: "user", text: q }]);

    let yanitId: string | null = null;
    let hataVar = false;

    const onEvent = (event: AgentStreamEvent) => {
      if (controller.signal.aborted) return;
      switch (event.kind) {
        case "tool":
        case "tool_update":
        case "tool_result":
          setTrace((rows) => applyTraceEvent(rows, event));
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
      message: q,
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
              "Agent yanıt döndürmedi. `mda dev` çalışıyor mu ve LANGSMITH_AGENT_URL doğru mu kontrol et.",
          },
        ]);
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === yanitId ? { ...m, streaming: false } : m))
      );
      setBusy(false);
      setAnswerId(null);
      abortRef.current = null;
    });
  }, []);

  return {
    messages,
    draft,
    setDraft,
    busy,
    trace,
    tasks,
    contexts,
    revealed,
    answerId,
    send,
    stop,
  };
}
