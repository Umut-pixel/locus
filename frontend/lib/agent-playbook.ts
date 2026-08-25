/**
 * Konuşma geçmişini rakamsız playbook'a çevir — UI ve proxy paylaşır.
 * Sunucu-only I/O (Supabase / LangGraph) burada yok.
 */

import { konusmaOzeti } from "@/lib/agent-konusma";

export type LgMessage = { role: "user" | "assistant"; content: string };

const PLAYBOOK_TURNS = 12;
const USER_CHARS = 2000;
const ASSISTANT_CHARS = 1200;

export const PLAYBOOK_NOTE =
  "[Playbook: yöntem geçerli; rakamlar bayat olabilir — sql_query ile yenile.]";

/** AGENT_URL (`…/runs/stream`) → LangGraph kökü. */
export function langgraphOrigin(agentUrl: string): string {
  const trimmed = agentUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/runs/stream")) {
    return trimmed.slice(0, -"/runs/stream".length);
  }
  if (trimmed.endsWith("/runs")) {
    return trimmed.slice(0, -"/runs".length);
  }
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed;
  }
}

/** Cevaptaki güncel rakamları ve görsel blokları yöntem metninden ayır. */
export function stripStaleFigures(text: string): string {
  let t = text.replace(/```locus[\s\S]*?```/gi, "[görsel blok]");
  t = t.replace(/(?:^|\n)(?:\|[^\n]+\|\r?\n){2,}/g, "\n[tablo]\n");
  t = t.replace(/₺\s*[\d.][\d.\s]*/g, "[tutar]");
  t = t.replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b/g, "[sayı]");
  t = t.replace(/\b\d{4,}\b/g, "[sayı]");
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** İlk soru + (varsa) rakamsız yöntem — konuşma `ozet` alanı. */
export function konusmaAmaci(userText: string, assistantText?: string): string {
  const q = konusmaOzeti(userText);
  if (!assistantText?.trim()) return q;
  const method = stripStaleFigures(assistantText)
    .replace(/\[Playbook:[^\]]*\]/g, "")
    .replace(/\[görsel blok\]|\[tablo\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!method) return q;
  return konusmaOzeti(`${q} | ${method}`);
}

export function playbookFromRows(
  rows: { rol: string; metin: string }[],
  currentUserText: string
): LgMessage[] {
  const prior = rows.filter((r) => r.rol === "user" || r.rol === "assistant");
  const trimmed = currentUserText.trim();
  let list = prior;
  const last = list[list.length - 1];
  if (last?.rol === "user" && last.metin.trim() === trimmed) {
    list = list.slice(0, -1);
  }
  const kept = list.slice(-PLAYBOOK_TURNS);
  const out: LgMessage[] = [];
  for (const row of kept) {
    if (row.rol === "user") {
      out.push({ role: "user", content: row.metin.trim().slice(0, USER_CHARS) });
      continue;
    }
    const body = stripStaleFigures(row.metin).slice(0, ASSISTANT_CHARS);
    out.push({
      role: "assistant",
      content: body ? `${body}\n\n${PLAYBOOK_NOTE}` : PLAYBOOK_NOTE,
    });
  }
  return out;
}
