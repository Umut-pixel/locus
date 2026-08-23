/**
 * Agent SSE akışı — `/api/agent` proxy'sinden gelen olayları okur.
 *
 * NEDEN AYRI DOSYA
 *   Akış ayrıştırma ile UI durumu iki ayrı iş. Burası saf: DOM'a dokunmaz,
 *   React bilmez, test edilebilir. AgentAssistant yalnızca `onEvent`'i dinler.
 *
 * BİÇİM — 2026-08-22'de yerel LangGraph sunucusundan ÖLÇÜLDÜ, tahmin değil:
 *
 *   event: metadata            {run_id, attempt}                 -> atla
 *   event: messages/metadata   {<run-id>: {...}} büyük sözlük     -> atla
 *   event: messages/partial    [mesaj]  içerik KÜMÜLATİF          -> fark al
 *   event: messages/complete   [mesaj]  tamamlanmış mesaj         -> fark al
 *
 * ⚠️  EN KRİTİK NOKTA: `messages/partial` DELTA DEĞİL. Her kare o ana kadar
 *     birikmiş metnin TAMAMINI taşır (ölçüm: 47 karakter -> 97 karakter).
 *     Her kareyi ekleseydik metin katlanarak tekrarlanırdı. Bu yüzden
 *     ayrıştırıcı mesaj id'si başına son görülen metni tutar ve yalnız YENİ
 *     eki delta olarak yayar. Gerçek delta gönderen bir sunucuda da aynı kod
 *     doğru çalışır (önceki metin boş kalır, ek = tam metin).
 *
 *     Bu yüzden `streamAgent` durum tutar; ayrıştırma artık saf fonksiyon
 *     değil, akış boyunca yaşayan bir `StreamState` üzerinden yürür.
 */

/** Akış sırasında UI'ın tepki verebileceği olaylar. */
export type AgentStreamEvent =
  | { kind: "text"; delta: string }
  /** Agent bir araç çağırdı — düşünce izini buna bağlarız. */
  | {
      kind: "tool";
      name: string;
      id?: string;
      args?: Record<string, unknown>;
    }
  /** Aynı çağrının argümanları (SQL vb.) tamamlanınca güncellenir. */
  | {
      kind: "tool_update";
      name: string;
      id: string;
      args: Record<string, unknown>;
    }
  /** Aracın dönüş özeti — ham SQL sonucu sohbete basılmaz. */
  | {
      kind: "tool_result";
      name: string;
      id?: string;
      ok: boolean;
      summary: string;
      source?: string;
      rows?: number;
      sql?: string;
      chars?: number;
      title?: string;
    }
  | { kind: "error"; message: string }
  /** Tanınmayan kare — biçim ayarlamak için ham metin. */
  | { kind: "debug"; raw: string };

export interface StreamAgentOptions {
  message: string;
  threadId?: string;
  signal?: AbortSignal;
  onEvent: (event: AgentStreamEvent) => void;
}

/** SSE karesi: `event:` ve `data:` satırlarına ayrılmış hali. */
interface SseFrame {
  event?: string;
  data: string;
}

/**
 * Bir SSE karesini satırlara böler.
 * Aynı karede birden fazla `data:` satırı olabilir — spec gereği `\n` ile
 * birleştirilir (JSON pretty-print eden sunucular bunu yapar).
 */
function parseFrame(rawFrame: string): SseFrame | null {
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of rawFrame.split("\n")) {
    if (line.startsWith(":")) continue; // yorum / heartbeat
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      // `data:` sonrası TEK boşluk spec gereği kırpılır; fazlası veridir.
      const rest = line.slice(5);
      dataLines.push(rest.startsWith(" ") ? rest.slice(1) : rest);
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

/** Anthropic blok dizisi veya düz string — ikisinden de metin çıkarır. */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  let text = "";
  for (const block of content) {
    if (typeof block === "string") {
      text += block;
    } else if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      // {type:"text", text:"..."} — Anthropic; {type:"text_delta", text:"..."} — stream
      if (typeof b.text === "string") text += b.text;
    }
  }
  return text;
}

type ToolCallSnap = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

function asArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function argsReady(args: Record<string, unknown>): boolean {
  const konu = typeof args.konu === "string" ? args.konu.trim() : "";
  if (/^(metrikler|kaynaklar|hepsi)$/i.test(konu)) return true;
  const sql = typeof args.sql === "string" ? args.sql.trim() : "";
  if (sql.length >= 20 && /\blimit\s+\d+/i.test(sql)) return true;
  if (sql.length >= 96) return true;
  const kod = typeof args.musteri_kodu === "string" ? args.musteri_kodu.trim() : "";
  return kod.length >= 4;
}

function argsKey(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args);
  } catch {
    return "";
  }
}

/** Mesajdaki araç çağrılarını (id + ad + args) çıkarır. */
function extractToolCalls(msg: Record<string, unknown>): ToolCallSnap[] {
  const out: ToolCallSnap[] = [];
  const seen = new Set<string>();
  const calls = msg.tool_calls ?? msg.tool_call_chunks;
  if (Array.isArray(calls)) {
    for (const call of calls) {
      if (!call || typeof call !== "object") continue;
      const c = call as Record<string, unknown>;
      const name = typeof c.name === "string" ? c.name : "";
      if (!name) continue;
      const id = typeof c.id === "string" && c.id ? c.id : name;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name, args: asArgs(c.args) });
    }
  }
  if (out.length === 0 && msg.type === "tool" && typeof msg.name === "string") {
    const id =
      typeof msg.tool_call_id === "string" && msg.tool_call_id
        ? msg.tool_call_id
        : msg.name;
    out.push({ id, name: msg.name, args: {} });
  }
  return out;
}

/** sql_query / schema_lookup dönüşünden sohbete sızmayan kısa özet. */
export function summarizeToolResult(
  name: string,
  content: string
): Omit<Extract<AgentStreamEvent, { kind: "tool_result" }>, "kind" | "name" | "id"> {
  const rejected =
    /^(SORGU REDDEDİLDİ|SQL HATASI|YETKİ HATASI|ZAMAN AŞIMI|YAPILANDIRMA HATASI|HATA\b)/.test(
      content
    );
  if (name === "sql_query") {
    const rows = content.match(/^(\d+) satır/m);
    const source = content.match(/^Kaynak:\s*(.+)$/m);
    const sql = content.match(/^SQL:\s*(.+)$/m);
    const rowCount = rows ? Number(rows[1]) : undefined;
    return {
      ok: !rejected,
      rows: rowCount,
      source: source?.[1]?.trim(),
      sql: sql?.[1]?.trim(),
      summary: rejected
        ? content.split("\n")[0]!.slice(0, 180)
        : `${rowCount ?? "?"} satır · ${source?.[1]?.trim() ?? "sorgu"}`,
    };
  }
  if (name === "schema_lookup") {
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    return {
      ok: true,
      chars: content.length,
      title: title ?? "İş sözlüğü",
      summary: title ?? "İş sözlüğü okundu",
    };
  }
  const first = content.split("\n")[0]?.slice(0, 180) ?? name;
  return { ok: !rejected && !/^HATA/.test(content), summary: first };
}

/** Akış boyunca yaşayan durum — kümülatif kareleri farka çevirmek için. */
interface StreamState {
  /** mesaj id -> o mesaj için şimdiye kadar YAYINLANMIŞ metin */
  yayinlanan: Map<string, string>;
  /** aynı araç çağrısı için tekrar tekrar olay yaymayalım */
  gorulenAraclar: Set<string>;
  /** id -> son görülen args imzası (SQL yazılırken güncellemek için) */
  aracArgs: Map<string, string>;
}

function bosDurum(): StreamState {
  return { yayinlanan: new Map(), gorulenAraclar: new Set(), aracArgs: new Map() };
}

/**
 * Bir mesaj nesnesinden olay üretir.
 *
 * Kümülatif/delta ayrımını burada çözüyoruz: mesajın id'si için daha önce
 * ne yayınladığımızı biliyoruz, gelen tam metin onunla başlıyorsa yalnız
 * kuyruğu delta olarak veriyoruz.
 */
function mesajdanOlaylar(
  aday: unknown,
  state: StreamState
): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [];
  if (!aday || typeof aday !== "object") return events;
  const msg = aday as Record<string, unknown>;

  for (const call of extractToolCalls(msg)) {
    if (!state.gorulenAraclar.has(call.id)) {
      state.gorulenAraclar.add(call.id);
      state.aracArgs.set(call.id, argsKey(call.args));
      events.push({
        kind: "tool",
        name: call.name,
        id: call.id,
        args: call.args,
      });
    } else if (argsReady(call.args)) {
      const next = argsKey(call.args);
      if (next !== state.aracArgs.get(call.id)) {
        state.aracArgs.set(call.id, next);
        events.push({
          kind: "tool_update",
          name: call.name,
          id: call.id,
          args: call.args,
        });
      }
    }
  }

  // ToolMessage = aracın DÖNÜŞÜ (ham SQL sonucu). Sohbete asla basma.
  if (msg.type === "tool") {
    const name = typeof msg.name === "string" ? msg.name : "tool";
    const id =
      typeof msg.tool_call_id === "string" && msg.tool_call_id
        ? msg.tool_call_id
        : name;
    const raw =
      typeof msg.content === "string"
        ? msg.content
        : extractText(msg.content);
    events.push({
      kind: "tool_result",
      name,
      id,
      ...summarizeToolResult(name, raw),
    });
    return events;
  }

  const tam = extractText(msg.content);
  if (!tam) return events;

  const id = typeof msg.id === "string" ? msg.id : "__tek__";
  const onceki = state.yayinlanan.get(id) ?? "";

  let delta: string;
  if (tam.length === onceki.length && tam === onceki) {
    return events; // aynı kare tekrar geldi
  } else if (tam.startsWith(onceki)) {
    delta = tam.slice(onceki.length); // kümülatif: yalnız yeni ek
  } else {
    // Beklenmedik: metin baştan değişmiş. Tekrarlamaktansa atla —
    // kullanıcıya bozuk/çift metin göstermek sessizce eksik göstermekten kötü.
    state.yayinlanan.set(id, tam);
    return events;
  }

  state.yayinlanan.set(id, tam);
  if (delta) events.push({ kind: "text", delta });
  return events;
}

/**
 * Çözümlenmiş `data` yükünden olay üretir.
 * Ölçülen biçim `[mesaj]` tek elemanlı dizi; diğer sarmalamalar da tolere
 * edilir (düz mesaj nesnesi, `{messages:[...]}` tam durumu).
 */
function eventsFromPayload(
  payload: unknown,
  state: StreamState
): AgentStreamEvent[] {
  if (Array.isArray(payload)) {
    // İlk eleman mesaj; ikinci (varsa) metadata — onda `content` yok.
    return mesajdanOlaylar(payload[0], state);
  }

  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.messages)) {
      return obj.messages.flatMap((m) => mesajdanOlaylar(m, state));
    }
    return mesajdanOlaylar(obj, state);
  }

  return [];
}

/**
 * Safari "Load failed", Chrome "Failed to fetch" — ham TypeError metni.
 * SQL/LLM turu uzun sürerken akış sessiz kalırsa tarayıcı bağlantıyı keser;
 * aynı sorunun ikinci denemede geçmesi bunun imzası.
 */
export function explainNetworkError(err: unknown, fallback: string): string {
  const raw =
    err instanceof Error ? err.message.trim() : String(err ?? "").trim();
  const key = raw.toLowerCase().replace(/\.$/, "");
  if (
    key === "load failed" ||
    key === "failed to fetch" ||
    key === "networkerror when attempting to fetch resource" ||
    key === "network request failed" ||
    key === "the network connection was lost" ||
    key.includes("networkerror")
  ) {
    return (
      "Bağlantı koptu (uzun sorgu veya telefon ağı). " +
      "Aynı soruyu bir kez daha dene."
    );
  }
  return raw || fallback;
}

/**
 * `event: error` gövdesinden okunabilir mesajı çıkarır.
 *
 * Yerel LangGraph sunucusundan gözlemlenen gerçek biçim:
 *   data: {"error":"TypeError","message":"Anthropic authentication failed: …"}
 * Ham JSON'u kullanıcıya göstermek işe yaramaz; `message` alanı asıl bilgi.
 * Düz metin gelirse olduğu gibi geçer.
 */
function errorMessage(data: string): string {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const msg = parsed.message ?? parsed.error;
    if (typeof msg === "string" && msg) return msg.slice(0, 300);
  } catch {
    /* JSON değil — ham metni kullan */
  }
  return data.slice(0, 300);
}

/**
 * `/api/agent`'a soruyu gönderir ve yanıtı akış halinde `onEvent`'e verir.
 * Hata durumunda `{kind:"error"}` yayar; exception fırlatmaz (UI'da tek
 * yerde ele alınsın diye).
 */
export async function streamAgent({
  message,
  threadId,
  signal,
  onEvent,
}: StreamAgentOptions): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, ...(threadId ? { threadId } : {}) }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    onEvent({
      kind: "error",
      message: explainNetworkError(err, "Agent'a ulaşılamadı"),
    });
    return;
  }

  // Proxy hata döndüyse gövde SSE değil JSON — okuyup mesajı göster.
  if (!response.ok || !response.body) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* JSON değilse durum kodu yeterli */
    }
    onEvent({ kind: "error", message: detail });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = bosDurum();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Kareler boş satırla ayrılır. Bazı sunucular \r\n kullanır.
      const parts = buffer.split(/\r?\n\r?\n/);
      // Son parça yarım olabilir — TCP paketleri kare sınırında bölünmez.
      // Bunu tamponda bırakmazsak yarım JSON parse edip rastgele patlarız.
      buffer = parts.pop() ?? "";

      for (const rawFrame of parts) {
        if (!rawFrame.trim()) continue;

        const frame = parseFrame(rawFrame);
        if (!frame) continue;

        if (frame.data === "[DONE]") continue;
        if (frame.event === "end") continue;
        // Akışın sonunda olaysız, boş `data:` kareleri geliyor (ölçüldü).
        // Bunlar bilgi taşımaz; debug'a düşürmek konsolu kirletir.
        if (!frame.data.trim()) continue;

        if (frame.event === "error") {
          onEvent({ kind: "error", message: errorMessage(frame.data) });
          continue;
        }
        // Metadata olayları içerik taşımaz: `metadata` (run_id) ve
        // `messages/metadata` (büyük çalışma sözlüğü). İkisi de ölçüldü.
        if (frame.event === "metadata" || frame.event === "messages/metadata") {
          continue;
        }

        let payload: unknown;
        try {
          payload = JSON.parse(frame.data);
        } catch {
          onEvent({ kind: "debug", raw: frame.data.slice(0, 300) });
          continue;
        }

        const events = eventsFromPayload(payload, state);
        // Olay üretmemek NORMAL: kümülatif karede yeni ek olmayabilir.
        // Yalnız hiç tanınmayan yapıları debug'a düşür.
        if (events.length === 0 && !Array.isArray(payload)) {
          onEvent({ kind: "debug", raw: frame.data.slice(0, 300) });
        }
        for (const e of events) onEvent(e);
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    onEvent({
      kind: "error",
      message: explainNetworkError(err, "akış kesildi"),
    });
  } finally {
    reader.releaseLock();
  }
}

/** Araç adı -> kullanıcıya gösterilecek düşünce cümlesi. */
export const TOOL_THOUGHTS: Record<string, string> = {
  schema_lookup: "İş sözlüğünü karıştırıyorum…",
  sql_query: "Veritabanına sorgu yazıyorum…",
  musteri_notu_ekle: "Notu yazıyorum…",
  musteri_favori_toggle: "Favoriyi güncelliyorum…",
};
