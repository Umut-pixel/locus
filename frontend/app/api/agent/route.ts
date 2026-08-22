import { NextResponse } from "next/server";

/**
 * AI asistanı proxy'si — tarayıcı ile kendi sunucumuzdaki LangGraph
 * agent'ı arasında durur.
 *
 * Neden proxy:
 *  1. `AGENT_INGRESS_SECRET` sunucuda kalır, tarayıcı bundle'ına asla girmez.
 *  2. Oturum kontrolü middleware.ts'te zaten yapılıyor (bu route korumalı) —
 *     yani yalnız giriş yapmış kullanıcı agent'a ulaşabilir.
 *  3. Agent uç noktası değişirse tek yer güncellenir.
 */

export const runtime = "nodejs";
/** Agent turları uzun sürebilir (çok adımlı SQL + analiz). */
export const maxDuration = 300;

const AGENT_URL_ENV = "AGENT_URL";
const AGENT_SECRET_ENV = "AGENT_INGRESS_SECRET";
const AGENT_SECRET_HEADER = "x-agent-secret";

/**
 * LangGraph `/runs/stream` `assistant_id` ZORUNLU ister; olmadan 422 döner.
 * Değer `agent/agent.py` içindeki `name=` ve `agent/langgraph.json` graphs
 * anahtarı ile aynı olmalı. İkisi ayrışırsa istek "assistant not found" ile düşer.
 */
const ASSISTANT_ID = process.env.ASSISTANT_ID?.trim() || "locus-analyst";

interface AgentRequestBody {
  message?: unknown;
  threadId?: unknown;
}

export async function POST(request: Request) {
  const agentUrl = process.env[AGENT_URL_ENV]?.trim();
  const ingressSecret = process.env[AGENT_SECRET_ENV]?.trim();

  if (!agentUrl) {
    return NextResponse.json(
      {
        error:
          `${AGENT_URL_ENV} tanımlı değil. Yerel geliştirme için ` +
          "`langgraph dev` adresini (örn. http://127.0.0.1:2024/runs/stream) .env'e ekleyin.",
      },
      { status: 503 }
    );
  }

  /**
   * Yerel LangGraph sunucusu da paylaşılan sır ister; anahtar yoksa 401 döner.
   * UZAK bir adrese giderken sır ZORUNLU — aksi halde istek kimliksiz gider
   * ve 401 alır, ya da daha kötüsü, kimlik doğrulaması kapalı bir uç noktaya
   * açıkta bağlanırız.
   */
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(
    agentUrl
  );
  if (!ingressSecret && !isLocal) {
    return NextResponse.json(
      { error: `${AGENT_SECRET_ENV} tanımlı değil (uzak agent için zorunlu).` },
      { status: 503 }
    );
  }

  let body: AgentRequestBody;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message gerekli" }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json(
      { error: "Mesaj çok uzun (en fazla 4000 karakter)" },
      { status: 400 }
    );
  }

  const threadId =
    typeof body.threadId === "string" && body.threadId.trim()
      ? body.threadId.trim()
      : undefined;

  try {
    const upstream = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ingressSecret ? { [AGENT_SECRET_HEADER]: ingressSecret } : {}),
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        assistant_id: ASSISTANT_ID,
        input: { messages: [{ role: "user", content: message }] },
        ...(threadId ? { thread_id: threadId } : {}),
        stream_mode: "messages",
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: `Agent hatası (${upstream.status})`, detail: detail.slice(0, 500) },
        { status: 502 }
      );
    }

    if (!upstream.body) {
      return NextResponse.json(
        { error: "Agent boş yanıt döndü" },
        { status: 502 }
      );
    }

    // SSE akışını olduğu gibi tarayıcıya geçir.
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "bilinmeyen hata";
    return NextResponse.json(
      { error: `Agent'a bağlanılamadı: ${detail}` },
      { status: 502 }
    );
  }
}
