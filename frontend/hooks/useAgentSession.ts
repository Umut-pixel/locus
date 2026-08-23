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
import {
  konusmaBasligi,
  konusmaOzeti,
  notifyKonusmalarChanged,
  type KonusmaMesaj,
} from "@/lib/agent-konusma";
import { reportAgentDown, reportAgentOk } from "@/lib/agent-status";

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
  messages: { id: string; role: ChatRole; text: string; quote?: string }[],
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
      })),
      ...meta,
    }),
  });
}

export function useAgentSession(opts?: {
  persist?: boolean;
  threadId?: string | null;
  onThread?: (id: string) => void;
}) {
  const persist = Boolean(opts?.persist);
  const urlThread = opts?.threadId ?? null;
  const onThread = opts?.onThread;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceRow[]>([]);
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [pendingQuote, setPendingQuoteState] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const traceRef = useRef<TraceRow[]>([]);
  const quoteRef = useRef<string | null>(null);
  const threadRef = useRef<string | null>(urlThread);
  const skipLoadRef = useRef(false);

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
    setBusy(false);
    setAnswerId(null);
    sealLive(null);
  }, [sealLive]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    threadRef.current = null;
    setBusy(false);
    setAnswerId(null);
    setMessages([]);
    setTrace([]);
    traceRef.current = [];
    setPendingQuote(null);
  }, [setPendingQuote]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!persist) return;
    if (skipLoadRef.current && urlThread && urlThread === threadRef.current) {
      skipLoadRef.current = false;
      return;
    }
    if (!urlThread) {
      abortRef.current?.abort();
      abortRef.current = null;
      threadRef.current = null;
      setBusy(false);
      setMessages([]);
      setTrace([]);
      traceRef.current = [];
      setAnswerId(null);
      return;
    }
    if (urlThread === threadRef.current && messages.length > 0) return;

    let cancelled = false;
    threadRef.current = urlThread;
    void (async () => {
      try {
        const res = await fetch(`/api/agent/konusmalar/${urlThread}`);
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { mesajlar?: KonusmaMesaj[] };
        if (cancelled) return;
        setMessages((body.mesajlar ?? []).map(fromStored));
        setTrace([]);
        traceRef.current = [];
        setAnswerId(null);
      } catch {
        /* yüklenemezse boş thread */
      }
    })();
    return () => {
      cancelled = true;
    };
    // messages.length kasıtlı dışarıda — her eklemede reload olmasın
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, urlThread]);

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
      setBusy(true);
      traceRef.current = [];
      setTrace([]);
      setAnswerId(null);
      setMessages((prev) => [
        ...prev.map((m) =>
          m.streaming
            ? { ...m, streaming: false, trace: m.trace ?? previousTrace }
            : m
        ),
        { id: userId, role: "user", text: q, quote: alinti },
      ]);

      let yanitId: string | null = null;
      let yanitMetin = "";
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
              setMessages((prev) => [
                ...prev,
                { id: yeni, role: "assistant", text: "", streaming: true },
              ]);
            }
            yanitMetin += event.delta;
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, text: m.text + event.delta } : m))
            );
            break;
          }
          case "error": {
            hataVar = true;
            const errMsg: ChatMessage = {
              id: uid(),
              role: "error",
              text: event.message,
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
        let threadId = persist ? threadRef.current : undefined;
        if (persist && !threadId) {
          try {
            const created = await createKonusma(konusmaBasligi(q), konusmaOzeti(q));
            if (created) {
              threadId = created;
              threadRef.current = created;
              skipLoadRef.current = true;
              onThread?.(created);
              notifyKonusmalarChanged();
            }
          } catch {
            /* yerel sohbet devam eder */
          }
        }

        if (persist && threadId) {
          try {
            await appendMessages(
              threadId,
              [{ id: userId, role: "user", text: q, quote: alinti }],
              { baslik: konusmaBasligi(q), ozet: konusmaOzeti(q) }
            );
            notifyKonusmalarChanged();
          } catch {
            /* */
          }
        }

        await streamAgent({
          message: outbound,
          threadId: persist ? threadId ?? undefined : undefined,
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
          });
          setMessages((prev) => [...prev, extra[extra.length - 1]!]);
          reportAgentDown(emptyText);
        } else if (!hataVar && yanitMetin.trim()) {
          reportAgentOk();
        }
        sealLive(yanitId);
        setBusy(false);
        setAnswerId(null);
        abortRef.current = null;

        if (persist && threadId) {
          const toSave: { id: string; role: ChatRole; text: string; quote?: string }[] =
            [];
          if (yanitId && yanitMetin.trim()) {
            toSave.push({
              id: yanitId,
              role: "assistant",
              text: yanitMetin,
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
            void appendMessages(threadId, toSave).then(() =>
              notifyKonusmalarChanged()
            );
          }
        }
      })();
    },
    [onThread, persist, sealLive, setPendingQuote, setTraceBoth]
  );

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
    reset,
  };
}
