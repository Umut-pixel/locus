/**
 * Analyst çalışma durumu — karşı tarafa health isteği yok.
 * Sohbet error → kırmızı; başarılı asistan yanıtı → yeşil.
 * sessionStorage: sekme yenilemede kırmızı kalır, sekme kapanınca varsayılan yeşil.
 */

export type AgentRuntimeStatus =
  | { ok: true }
  | { ok: false; message: string; at: string };

export const AGENT_STATUS_CHANGED = "locus-agent-status";
export const AGENT_STATUS_STORAGE_KEY = "locus-agent-runtime";

const OK: AgentRuntimeStatus = { ok: true };
const ERROR_CLIP = 40;

export function parseAgentRuntimeStatus(raw: string): AgentRuntimeStatus | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const rec = value as Record<string, unknown>;
    if (rec.ok === true) return { ok: true };
    if (
      rec.ok === false &&
      typeof rec.message === "string" &&
      typeof rec.at === "string"
    ) {
      return { ok: false, message: rec.message, at: rec.at };
    }
    return null;
  } catch {
    return null;
  }
}

export function readAgentRuntimeStatus(): AgentRuntimeStatus {
  if (typeof window === "undefined") return OK;
  try {
    const raw = sessionStorage.getItem(AGENT_STATUS_STORAGE_KEY);
    if (!raw) return OK;
    return parseAgentRuntimeStatus(raw) ?? OK;
  } catch {
    return OK;
  }
}

function writeAgentRuntimeStatus(status: AgentRuntimeStatus) {
  if (typeof window === "undefined") return;
  try {
    if (status.ok) {
      sessionStorage.removeItem(AGENT_STATUS_STORAGE_KEY);
    } else {
      sessionStorage.setItem(AGENT_STATUS_STORAGE_KEY, JSON.stringify(status));
    }
  } catch {
    /* gizli / kota */
  }
  window.dispatchEvent(new Event(AGENT_STATUS_CHANGED));
}

export function reportAgentOk() {
  writeAgentRuntimeStatus({ ok: true });
}

export function reportAgentDown(message: string) {
  const text = message.replace(/\s+/g, " ").trim() || "Agent hatası";
  writeAgentRuntimeStatus({
    ok: false,
    message: text,
    at: new Date().toISOString(),
  });
}

export function clipAgentError(message: string, max = ERROR_CLIP): string {
  const text = message.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
