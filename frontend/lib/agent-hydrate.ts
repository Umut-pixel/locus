/**
 * LangGraph checkpointer boşken (restart) Supabase geçmişini modele
 * playbook olarak basar. Yalnız API route — service_role buradan geçer.
 */

import {
  AGENT_KONUSMA_MESAJLARI_TABLE,
  createSupabaseAdmin,
} from "@/lib/supabase-admin";
import {
  playbookFromRows,
  type LgMessage,
} from "@/lib/agent-playbook";

export type { LgMessage } from "@/lib/agent-playbook";
export { langgraphOrigin } from "@/lib/agent-playbook";

const STATE_TIMEOUT_MS = 2500;

function messageCount(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;
  const obj = payload as Record<string, unknown>;
  const values =
    obj.values && typeof obj.values === "object"
      ? (obj.values as Record<string, unknown>)
      : obj;
  const messages = values.messages;
  return Array.isArray(messages) ? messages.length : 0;
}

/** Checkpointer bu thread'de mesaj tutuyor mu? Belirsizse true (çift basma). */
export async function threadHasMessages(
  origin: string,
  threadId: string,
  secret: string | undefined,
  signal?: AbortSignal
): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STATE_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(
      `${origin}/threads/${encodeURIComponent(threadId)}/state`,
      {
        headers: {
          Accept: "application/json",
          ...(secret ? { "x-agent-secret": secret } : {}),
        },
        signal: ctrl.signal,
      }
    );
    if (res.status === 404) return false;
    if (!res.ok) return true;
    const body: unknown = await res.json().catch(() => null);
    return messageCount(body) > 0;
  } catch {
    return true;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function loadKonusmaPlaybook(
  threadId: string,
  currentUserText: string
): Promise<LgMessage[]> {
  const admin = createSupabaseAdmin();
  const msgs = await admin
    .from(AGENT_KONUSMA_MESAJLARI_TABLE)
    .select("sira,rol,metin")
    .eq("konusma_id", threadId)
    .order("sira", { ascending: true })
    .limit(40);
  if (msgs.error || !msgs.data) return [];
  return playbookFromRows(
    msgs.data as { rol: string; metin: string }[],
    currentUserText
  );
}
