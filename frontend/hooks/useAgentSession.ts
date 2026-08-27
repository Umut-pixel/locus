"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { AgentStreamEvent } from "@/lib/agent-stream";
import { streamAgent } from "@/lib/agent-stream";
import { useRevealedText } from "@/lib/agent-reveal";
import {
  applyTraceEvent,
  contextsFromTrace,
  tasksFromTrace,
  type AgentTask,
  type ContextChunk,
  type TraceRow,
} from "@/lib/agent-trace";
import {
  konusmaBasligi,
  konusmaOzeti,
  notifyKonusmalarChanged,
  type KonusmaMesaj,
} from "@/lib/agent-konusma";
import { konusmaAmaci } from "@/lib/agent-playbook";
import { reportAgentDown, reportAgentOk } from "@/lib/agent-status";

export type ChatRole = "user" | "assistant" | "error";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  streaming?: boolean;
  quote?: string;
  trace?: TraceRow[];
  at?: string;
  model?: string;
};

const QUOTE_MAX = 800;
const QUOTE_FALLBACK = "Bu alıntıyı açıkla.";

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function composeQuotedPrompt(question: string, quote: string): string {
  const clipped =
    quote.length > QUOTE_MAX ? `${quote.slice(0, QUOTE_MAX - 1)}…` : quote;
  return [
    "Kullanıcı önceki yanıttan şu parçayı işaretledi. Yalnız bu alıntıya yanıt ver; alıntı dışını gerekmedikçe genişletme.",
    `Alıntı: «${clipped}»`,
    "",
    question,
  ].join("\n");
}

function fromStored(row: KonusmaMesaj): ChatMessage {
  return {
    id: row.id,
    role: row.rol,
    text: row.metin,
    quote: row.alinti ?? undefined,
    at: row.olusturulma ?? undefined,
    model: row.model ?? undefined,
  };
}

async function createKonusma(baslik: string, ozet: string): Promise<string | null> {
  const res = await fetch("/api/agent/konusmalar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baslik, ozet }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { konusma?: { id?: string } };
  return body.konusma?.id ?? null;
}

async function appendMessages(
  konusmaId: string,
  messages: {
    id: string;
    role: ChatRole;
    text: string;
    quote?: string;
    model?: string;
  }[],
  meta?: { baslik?: string; ozet?: string }
) {
  if (messages.length === 0) return;
  await fetch(`/api/agent/konusmalar/${konusmaId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mesajlar: messages.map((m) => ({
        id: m.id,
        rol: m.role,
        metin: m.text,
        alinti: m.quote ?? null,
        model: m.model ?? null,
      })),
      ...meta,
    }),
  });
}

export type AgentSessionValue = {
  threadId: string | null;
  messages: ChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  trace: TraceRow[];
  tasks: AgentTask[];
  contexts: ContextChunk[];
  revealed: string;
  revealing: boolean;
  revealId: string | null;
  answerId: string | null;
  pendingQuote: string | null;
  setPendingQuote: (quote: string | null) => void;
  send: (question: string) => void;
  stop: () => void;
  reset: () => void;
  loadThread: (id: string) => Promise<void>;
};

const AgentRuntimeContext = createContext<AgentSessionValue | null>(null);

function useAgentRuntimeState(): AgentSessionValue {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceRow[]>([]);
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [pendingQuote, setPendingQuoteState] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const traceRef = useRef<TraceRow[]>([]);
  const quoteRef = useRef<string | null>(null);
  const threadRef = useRef<string | null>(null);
  const skipLoadRef = useRef(false);
  const purposeSetRef = useRef(false);
  const busyRef = useRef(false);
  const suppressLoadRef = useRef(false);

  const [revealId, setRevealId] = useState<string | null>(null);
  const revealMsg = messages.find((m) => m.id === revealId);
  const { text: revealed, pending: revealing } = useRevealedText(
    revealMsg?.text ?? "",
    revealId
  );
  const replySettled =
    !busy && messages.some((m) => m.role === "assistant" && m.text.length > 0);
  const tasks = tasksFromTrace(trace, replySettled, busy);
  const contexts = contextsFromTrace(trace);

  const setBusyBoth = useCallback((next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  }, []);

  const setThreadBoth = useCallback((id: string | null) => {
    threadRef.current = id;
    setThreadId(id);
  }, []);

  const setTraceBoth = useCallback(
    (next: TraceRow[] | ((rows: TraceRow[]) => TraceRow[])) => {
      setTrace((rows) => {
        const resolved = typeof next === "function" ? next(rows) : next;
        traceRef.current = resolved;
        return resolved;
      });
    },
    []
  );

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
    setBusyBoth(false);
    setAnswerId(null);
    setRevealId(null);
    sealLive(null);
  }, [sealLive, setBusyBoth]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    skipLoadRef.current = false;
    suppressLoadRef.current = true;
    purposeSetRef.current = false;
    setBusyBoth(false);
    setAnswerId(null);
    setRevealId(null);
    setMessages([]);
    setTrace([]);
    traceRef.current = [];
    setPendingQuote(null);
    setThreadBoth(null);
  }, [setBusyBoth, setPendingQuote, setThreadBoth]);

  const loadThread = useCallback(
    async (id: string) => {
      const target = id.trim();
      if (!target) return;
      if (suppressLoadRef.current) {
        suppressLoadRef.current = false;
        return;
      }
      if (target === threadRef.current) {
        if (busyRef.current) return;
        if (skipLoadRef.current) {
          skipLoadRef.current = false;
          return;
        }
        return;
      }

      abortRef.current?.abort();
      abortRef.current = null;
      setBusyBoth(false);
      setAnswerId(null);
      setRevealId(null);
      setTrace([]);
      traceRef.current = [];
      setThreadBoth(target);

      try {
        const res = await fetch(`/api/agent/konusmalar/${target}`);
        if (!res.ok) return;
        if (threadRef.current !== target) return;
        const body = (await res.json()) as { mesajlar?: KonusmaMesaj[] };
        if (threadRef.current !== target) return;
        setMessages((body.mesajlar ?? []).map(fromStored));
        purposeSetRef.current = (body.mesajlar ?? []).some(
          (m) => m.rol === "assistant"
        );
      } catch {
        /* yüklenemezse mevcut ekran kalsın */
      }
    },
    [setBusyBoth, setThreadBoth]
  );

  // Kabuk unmount (çıkış) — sayfa değişimi değil.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    (question: string) => {
      const alinti = quoteRef.current?.trim() || undefined;
      const q = question.trim() || (alinti ? QUOTE_FALLBACK : "");
      if (!q) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const previousTrace = traceRef.current;
      const userId = uid();

      setDraft("");
      setPendingQuote(null);
      setBusyBoth(true);
      traceRef.current = [];
      setTrace([]);
      setAnswerId(null);
      setRevealId(null);
      setMessages((prev) => [
        ...prev.map((m) =>
          m.streaming
            ? { ...m, streaming: false, trace: m.trace ?? previousTrace }
            : m
        ),
        { id: userId, role: "user", text: q, quote: alinti, at: new Date().toISOString() },
      ]);

      let yanitId: string | null = null;
      let yanitMetin = "";
      let yanitModel: string | undefined;
      let hataVar = false;
      const outbound = alinti ? composeQuotedPrompt(q, alinti) : q;
      const extra: ChatMessage[] = [];

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
              setRevealId(yeni);
              setMessages((prev) => [
                ...prev,
                {
                  id: yeni,
                  role: "assistant",
                  text: "",
                  streaming: true,
                  at: new Date().toISOString(),
                  model: yanitModel,
                },
              ]);
            }
            yanitMetin += event.delta;
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, text: m.text + event.delta } : m))
            );
            break;
          }
          case "model": {
            yanitModel = event.name;
            const id = yanitId;
            if (id) {
              setMessages((prev) =>
                prev.map((m) => (m.id === id ? { ...m, model: event.name } : m))
              );
            }
            break;
          }
          case "error": {
            hataVar = true;
            const errMsg: ChatMessage = {
              id: uid(),
              role: "error",
              text: event.message,
              at: new Date().toISOString(),
            };
            extra.push(errMsg);
            setMessages((prev) => [...prev, errMsg]);
            reportAgentDown(event.message);
            break;
          }
          case "debug":
            console.debug("[agent] tanınmayan SSE karesi:", event.raw);
            break;
        }
      };

      void (async () => {
        let nextThread = threadRef.current;
        if (!nextThread) {
          try {
            const created = await createKonusma(konusmaBasligi(q), konusmaOzeti(q));
            if (created) {
              nextThread = created;
              skipLoadRef.current = true;
              setThreadBoth(created);
              notifyKonusmalarChanged();
            }
          } catch {
            /* yerel sohbet devam eder */
          }
        }

        if (nextThread) {
          try {
            await appendMessages(nextThread, [
              { id: userId, role: "user", text: q, quote: alinti },
            ]);
            notifyKonusmalarChanged();
          } catch {
            /* */
          }
        }

        await streamAgent({
          message: outbound,
          threadId: nextThread ?? undefined,
          signal: controller.signal,
          onEvent,
        });

        if (controller.signal.aborted) return;
        if (!hataVar && yanitId === null) {
          const errId = uid();
          const emptyText =
            "Agent yanıt döndürmedi. `langgraph dev` çalışıyor mu ve AGENT_URL doğru mu kontrol et.";
          extra.push({
            id: errId,
            role: "error",
            text: emptyText,
            at: new Date().toISOString(),
          });
          setMessages((prev) => [...prev, extra[extra.length - 1]!]);
          reportAgentDown(emptyText);
        } else if (!hataVar && yanitMetin.trim()) {
          reportAgentOk();
        }
        sealLive(yanitId);
        setBusyBoth(false);
        setAnswerId(null);
        abortRef.current = null;

        if (nextThread) {
          const toSave: {
            id: string;
            role: ChatRole;
            text: string;
            quote?: string;
            model?: string;
          }[] = [];
          if (yanitId && yanitMetin.trim()) {
            toSave.push({
              id: yanitId,
              role: "assistant",
              text: yanitMetin,
              model: yanitModel,
            });
          }
          for (const err of extra) {
            if (err.text.trim()) {
              toSave.push({
                id: err.id,
                role: "error",
                text: err.text,
              });
            }
          }
          if (toSave.length > 0) {
            const meta =
              !purposeSetRef.current && yanitMetin.trim()
                ? { ozet: konusmaAmaci(q, yanitMetin) }
                : undefined;
            void appendMessages(nextThread, toSave, meta).then(() => {
              if (meta) purposeSetRef.current = true;
              notifyKonusmalarChanged();
            });
          }
        }
      })();
    },
    [sealLive, setBusyBoth, setPendingQuote, setThreadBoth, setTraceBoth]
  );

  return useMemo(
    () => ({
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
    }),
    [
      threadId,
      messages,
      draft,
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
    ]
  );
}

export function AgentRuntimeProvider({ children }: { children: ReactNode }) {
  const value = useAgentRuntimeState();
  return createElement(AgentRuntimeContext.Provider, { value }, children);
}

export function useAgentSession(): AgentSessionValue {
  const ctx = useContext(AgentRuntimeContext);
  if (!ctx) {
    throw new Error("useAgentSession AgentRuntimeProvider içinde kullanılmalı");
  }
  return ctx;
}
