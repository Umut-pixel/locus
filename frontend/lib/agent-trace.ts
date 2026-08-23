import type { AgentStreamEvent } from "@/lib/agent-stream";

export type TraceStatus = "running" | "done" | "error";

export type TraceRow = {
  id: string;
  name: string;
  primary: string;
  secondary?: string;
  mono?: boolean;
  status: TraceStatus;
  source?: string;
  rows?: number;
  chars?: number;
  title?: string;
  sql?: string;
};

export type AgentTask = {
  key: string;
  label: string;
  amount: string;
  status: "pending" | "running" | "failed" | "done";
  details: { label: string; meta: string }[];
};

export type ContextChunk = {
  id: string;
  title: string;
  chars: string;
  body: string;
  source: string;
  badge: string;
  tone: "bg-ink-red" | "bg-ink-green" | "bg-accent-ink" | "bg-ink-orange";
};

const TOOL_META: Record<
  string,
  { verb: string; running: string; done: string; fail: string }
> = {
  schema_lookup: {
    verb: "Read",
    running: "İş sözlüğü okunuyor",
    done: "İş sözlüğü okundu",
    fail: "Sözlük okunamadı",
  },
  sql_query: {
    verb: "Run",
    running: "Sorgu çalışıyor",
    done: "Sorgu tamamlandı",
    fail: "Sorgu reddedildi",
  },
  musteri_notu_ekle: {
    verb: "Write",
    running: "Not yazılıyor",
    done: "Not kaydedildi",
    fail: "Not yazılamadı",
  },
  musteri_favori_toggle: {
    verb: "Write",
    running: "Favori güncelleniyor",
    done: "Favori güncellendi",
    fail: "Favori güncellenemedi",
  },
  konusma_gecmisi: {
    verb: "Read",
    running: "Geçmiş konuşmalar okunuyor",
    done: "Geçmiş konuşmalar okundu",
    fail: "Konuşma geçmişi okunamadı",
  },
};

function meta(name: string) {
  return (
    TOOL_META[name] ?? {
      verb: "Run",
      running: `${name} çalışıyor`,
      done: `${name} bitti`,
      fail: `${name} hata`,
    }
  );
}

function clipSql(sql: string, n = 64): string {
  const one = sql.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

function secondaryFromArgs(name: string, args?: Record<string, unknown>): string | undefined {
  if (!args) return undefined;
  if (name === "schema_lookup" && typeof args.konu === "string") {
    const konu = args.konu.trim();
    if (konu === "metrikler") return "metrikler.md";
    if (konu === "kaynaklar") return "veri_kaynaklari.md";
    if (konu === "hepsi") return "metrikler.md · veri_kaynaklari.md";
    return konu;
  }
  if (name === "sql_query" && typeof args.sql === "string" && args.sql.trim()) {
    return clipSql(args.sql);
  }
  if (typeof args.musteri_kodu === "string") return args.musteri_kodu;
  return undefined;
}

export function applyTraceEvent(
  rows: TraceRow[],
  event: Extract<AgentStreamEvent, { kind: "tool" | "tool_update" | "tool_result" }>
): TraceRow[] {
  if (event.kind === "tool") {
    const id = event.id ?? event.name;
    if (rows.some((r) => r.id === id)) return rows;
    const m = meta(event.name);
    const secondary = secondaryFromArgs(event.name, event.args);
    return [
      ...rows,
      {
        id,
        name: event.name,
        primary: m.verb,
        secondary: secondary ?? m.running,
        mono: event.name === "sql_query",
        status: "running",
      },
    ];
  }
  if (event.kind === "tool_update") {
    return rows.map((r) => {
      if (r.id !== event.id) return r;
      const secondary = secondaryFromArgs(event.name, event.args);
      return secondary ? { ...r, secondary, mono: event.name === "sql_query" } : r;
    });
  }
  const id = event.id ?? event.name;
  const m = meta(event.name);
  return rows.map((r) => {
    if (r.id !== id && r.name !== event.name) return r;
    if (r.status !== "running" && r.id !== id) return r;
    if (r.id !== id && rows.some((x) => x.id === id)) return r;
    return {
      ...r,
      status: event.ok ? "done" : "error",
      secondary: event.sql
        ? clipSql(event.sql)
        : event.source ?? event.title ?? event.summary,
      source: event.source,
      rows: event.rows,
      chars: event.chars,
      title: event.title,
      sql: event.sql,
      primary: event.ok ? m.verb : m.fail,
      mono: Boolean(event.sql) || r.mono,
    };
  });
}

export function tasksFromTrace(rows: TraceRow[], composing: boolean, busy: boolean): AgentTask[] {
  const schema = rows.filter((r) => r.name === "schema_lookup");
  const sql = rows.filter((r) => r.name === "sql_query");
  const writes = rows.filter((r) => r.name.startsWith("musteri_"));

  const schemaStatus: AgentTask["status"] = schema.some((r) => r.status === "running")
    ? "running"
    : schema.length
      ? "done"
      : busy && rows.length === 0
        ? "running"
        : "pending";

  const sqlFailed = sql.some((r) => r.status === "error");
  const sqlRunning = sql.some((r) => r.status === "running");
  const sqlStatus: AgentTask["status"] = sqlRunning
    ? "running"
    : sqlFailed && !sql.some((r) => r.status === "done")
      ? "failed"
      : sql.length
        ? "done"
        : schemaStatus === "done" && busy
          ? "running"
          : "pending";

  const replyStatus: AgentTask["status"] = composing
    ? "done"
    : sqlStatus === "done" && busy
      ? "running"
      : "pending";

  const tasks: AgentTask[] = [
    {
      key: "schema",
      label: "İş sözlüğünü oku",
      amount: schema[0]?.secondary ?? "metrikler / kaynaklar",
      status: schemaStatus === "pending" && !busy ? "pending" : schemaStatus,
      details: schema.map((r) => ({
        label: r.title ?? r.secondary ?? "schema_lookup",
        meta: r.chars ? `${r.chars.toLocaleString("tr-TR")} kr` : r.status,
      })),
    },
    {
      key: "sql",
      label: "Veritabanı sorgusu",
      amount:
        sql.length === 0
          ? "bekliyor"
          : `${sql.length} sorgu`,
      status: sqlStatus,
      details: sql.map((r) => ({
        label: r.sql ? clipSql(r.sql, 48) : r.secondary ?? "sql_query",
        meta:
          r.status === "error"
            ? "hata"
            : r.rows != null
              ? `${r.rows} satır`
              : r.status,
      })),
    },
    {
      key: "reply",
      label: "Yanıtı yaz",
      amount: composing ? "akıyor" : busy ? "bekliyor" : "—",
      status: replyStatus,
      details: writes.map((r) => ({
        label: r.primary,
        meta: r.secondary ?? r.status,
      })),
    },
  ];
  return tasks;
}

export function contextsFromTrace(rows: TraceRow[]): ContextChunk[] {
  return rows
    .filter((r) => r.status === "done" || r.status === "error")
    .map((r) => {
      if (r.name === "schema_lookup") {
        return {
          id: r.id,
          title: r.title ?? "İş sözlüğü",
          chars: r.chars ? `${r.chars.toLocaleString("tr-TR")} karakter` : "—",
          body: "Kolon anlamlarını ve tazelik kurallarını doğrulamak için okundu. SQL bundan sonra yazıldı.",
          source: r.secondary ?? "semantic/*.md",
          badge: "MD",
          tone: "bg-accent-ink" as const,
        };
      }
      if (r.name === "sql_query") {
        return {
          id: r.id,
          title: r.source ?? "Sorgu sonucu",
          chars: r.rows != null ? `${r.rows} satır` : "—",
          body: r.status === "error"
            ? r.secondary ?? "Sorgu reddedildi veya hata verdi."
            : `${r.source ?? "view"} üzerinden okundu. Ham satırlar sohbete basılmaz — yalnız özet kullanılır.`,
          source: r.sql ? clipSql(r.sql, 72) : "sql_query",
          badge: "SQL",
          tone: r.status === "error" ? "bg-ink-red" : "bg-ink-green",
        };
      }
      return {
        id: r.id,
        title: r.primary,
        chars: "yazma",
        body: r.secondary ?? r.primary,
        source: r.name,
        badge: "API",
        tone: "bg-ink-orange" as const,
      };
    });
}

export function thinkingHeadline(rows: TraceRow[], working: boolean): { active: string; done: string } {
  const running = rows.find((r) => r.status === "running");
  if (working && running) {
    return { active: meta(running.name).running, done: `${rows.length} araç` };
  }
  if (working && rows.length === 0) {
    return { active: "Düşünüyor", done: "Düşünüldü" };
  }
  const n = rows.length;
  return {
    active: "Düşünüyor",
    done: n === 0 ? "Düşünüldü" : n === 1 ? "1 araç çalıştı" : `${n} araç çalıştı`,
  };
}

/**
 * Tek sözlük + tek SQL (ve yazma yok) basit tur.
 * Birden fazla sorgu, yazma aracı veya üçüncü bir araç türü karmaşık.
 */
export function isComplexTrace(rows: TraceRow[]): boolean {
  const sql = rows.filter((r) => r.name === "sql_query").length;
  if (sql > 1) return true;
  if (rows.some((r) => r.name.startsWith("musteri_"))) return true;
  const kinds = new Set(rows.map((r) => r.name));
  return kinds.size > 2;
}
