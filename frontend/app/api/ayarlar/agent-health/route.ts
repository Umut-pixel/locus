import { NextResponse } from "next/server";

import { langgraphOrigin } from "@/lib/agent-playbook";

export const runtime = "nodejs";
export const maxDuration = 10;

const AGENT_URL_ENV = "AGENT_URL";
const AGENT_SECRET_ENV = "AGENT_INGRESS_SECRET";
const AGENT_SECRET_HEADER = "x-agent-secret";
const TIMEOUT_MS = 4_000;

type AgentHealthPayload =
  | { ok: true; configured: true; latencyMs: number }
  | { ok: false; configured: false; error: string }
  | { ok: false; configured: true; error: string; latencyMs?: number };

function json(payload: AgentHealthPayload, status: number) {
  return NextResponse.json(payload, { status });
}

export async function GET() {
  const agentUrl = process.env[AGENT_URL_ENV]?.trim();
  const ingressSecret = process.env[AGENT_SECRET_ENV]?.trim();

  if (!agentUrl) {
    return json(
      {
        ok: false,
        configured: false,
        error: `${AGENT_URL_ENV} tanımlı değil.`,
      },
      503
    );
  }

  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(
    agentUrl
  );
  if (!ingressSecret && !isLocal) {
    return json(
      {
        ok: false,
        configured: false,
        error: `${AGENT_SECRET_ENV} tanımlı değil.`,
      },
      503
    );
  }

  const origin = langgraphOrigin(agentUrl).replace(/\/+$/, "");
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${origin}/ok`, {
      method: "GET",
      headers: ingressSecret ? { [AGENT_SECRET_HEADER]: ingressSecret } : {},
      cache: "no-store",
      signal: ac.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return json(
        {
          ok: false,
          configured: true,
          error:
            res.status === 401
              ? "Kimlik doğrulama başarısız."
              : `Analyst yanıtı ${res.status}.`,
          latencyMs,
        },
        502
      );
    }
    return json({ ok: true, configured: true, latencyMs }, 200);
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";
    return json(
      {
        ok: false,
        configured: true,
        error: aborted
          ? "Analyst yanıt vermedi (4 sn)."
          : "Analyst'e bağlanılamadı.",
        latencyMs,
      },
      502
    );
  } finally {
    clearTimeout(timer);
  }
}
