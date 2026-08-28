/**
 * Agent yanıtındaki görsel bloklar — fenced `locus` JSON + GFM tablolar.
 *
 * Akış sırasında kapanmamış çit / yarım tablo "pending" kalır; react-markdown
 * her token'da yarım tabloyu yeniden yorumlamasın diye burada tutulur.
 */

export type TableBlock = {
  type: "table";
  columns: string[];
  rows: string[][];
};

export type FilterBlock = {
  type: "filter";
  title?: string;
  filters: { key: string; label: string; dot?: string }[];
  columns: string[];
  rows: Record<string, string>[];
  filterKey: string;
  /** Ardışık `kind: chart` bloğu aynı karta alınır. */
  chart?: ChartBlock;
};

export type ChartSeries = {
  name: string;
  values: number[];
  color?: string;
  unit?: "money" | "percent" | "number";
};

export type ChartBlock = {
  type: "chart";
  variant: "line" | "compare" | "allocation";
  title?: string;
  prose?: string;
  series?: ChartSeries[];
  segments?: { name: string; label: string; pct: number; amount?: string }[];
};

export type RecommendOption = {
  key: string;
  body: string;
  short: string;
  signal: number;
  label: string;
  cta: string;
};

export type RecommendBlock = {
  type: "recommend";
  question: string;
  options: RecommendOption[];
};

export type MapPoint = {
  lat: number;
  lon: number;
  label?: string;
  meta?: string;
};

export type MapBlock = {
  type: "map";
  title?: string;
  includeDepot: boolean;
  mapsUrl?: string;
  points: MapPoint[];
};

export type MarkdownBlock = { type: "markdown"; text: string };
export type PendingBlock = { type: "pending"; label: string };

export type AgentBlock =
  | MarkdownBlock
  | TableBlock
  | FilterBlock
  | ChartBlock
  | RecommendBlock
  | MapBlock
  | PendingBlock;

const FENCE = /```locus[\w-]*[ \t]*\r?\n([\s\S]*?)```/g;
const OPEN_FENCE = /```locus[\w-]*[ \t]*\r?\n([\s\S]*)$/;
const TABLE_RE =
  /(?:^|\n)((?:\|[^\n]+\|\r?\n){2,}(?:\|[^\n]+\|\r?\n?)*)/g;

function splitCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && /---/.test(line);
}

export function parseGfmTable(raw: string): TableBlock | null {
  const lines = raw
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const columns = splitCells(lines[0]!);
  if (!isSeparator(lines[1]!)) return null;
  const rows = lines.slice(2).map(splitCells).filter((r) => r.some((c) => c));
  if (columns.length === 0) return null;
  return { type: "table", columns, rows };
}

function asRecordRows(table: TableBlock): Record<string, string>[] {
  return table.rows.map((row) => {
    const rec: Record<string, string> = {};
    table.columns.forEach((col, i) => {
      rec[col] = row[i] ?? "";
    });
    return rec;
  });
}

function looksCompleteTable(text: string): boolean {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().startsWith("|"));
  return lines.length >= 3 && isSeparator(lines[1] ?? "");
}

function isFiniteCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseMapPoint(raw: unknown): MapPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lat = Number(o.lat);
  const lon = Number(o.lon ?? o.lng);
  if (!isFiniteCoord(lat) || !isFiniteCoord(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const point: MapPoint = { lat, lon };
  if (typeof o.label === "string" && o.label.trim()) point.label = o.label.trim();
  if (typeof o.meta === "string" && o.meta.trim()) point.meta = o.meta.trim();
  return point;
}

function parseHttpsUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!/^https:\/\//i.test(s)) return undefined;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function parseLocusJson(raw: string): AgentBlock | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    const kind = typeof data.kind === "string" ? data.kind : typeof data.type === "string" ? data.type : "";
    if (kind === "table" || kind === "records") {
      const columns = Array.isArray(data.columns)
        ? data.columns.map(String)
        : [];
      const rows = Array.isArray(data.rows)
        ? data.rows.map((row) =>
            Array.isArray(row)
              ? row.map((c) => String(c ?? ""))
              : typeof row === "object" && row
                ? columns.map((c) => String((row as Record<string, unknown>)[c] ?? ""))
                : []
          )
        : [];
      if (columns.length) return { type: "table", columns, rows };
    }
    if (kind === "filter") {
      const filters = Array.isArray(data.filters)
        ? data.filters.flatMap((f) => {
            if (!f || typeof f !== "object") return [];
            const o = f as Record<string, unknown>;
            if (typeof o.key !== "string" || typeof o.label !== "string") return [];
            const chip: FilterBlock["filters"][number] = {
              key: o.key,
              label: o.label,
            };
            if (typeof o.dot === "string") chip.dot = o.dot;
            return [chip];
          })
        : [];
      const columns = Array.isArray(data.columns) ? data.columns.map(String) : [];
      const rows = Array.isArray(data.rows)
        ? data.rows
            .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
            .map((r) => {
              const rec: Record<string, string> = {};
              for (const [k, v] of Object.entries(r)) rec[k] = String(v ?? "");
              return rec;
            })
        : [];
      const filterKey =
        typeof data.filterKey === "string"
          ? data.filterKey
          : typeof data.filterColumn === "string"
            ? data.filterColumn
            : "filter";
      if (filters.length && columns.length) {
        return {
          type: "filter",
          title: typeof data.title === "string" ? data.title : undefined,
          filters,
          columns,
          rows,
          filterKey,
        };
      }
    }
    if (kind === "chart") {
      const variant =
        data.variant === "compare" || data.variant === "allocation"
          ? data.variant
          : "line";
      const series = Array.isArray(data.series)
        ? data.series
            .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
            .map((s): ChartSeries => {
              const unit: ChartSeries["unit"] =
                s.unit === "money" || s.unit === "percent" || s.unit === "number"
                  ? s.unit
                  : undefined;
              return {
                name: String(s.name ?? "Seri"),
                values: Array.isArray(s.values)
                  ? s.values.map((v) => Number(v)).filter((n) => Number.isFinite(n))
                  : Array.isArray(s.points)
                    ? s.points.map((p) => {
                        if (p && typeof p === "object" && "v" in p) return Number((p as { v: unknown }).v);
                        return Number(p);
                      }).filter((n) => Number.isFinite(n))
                    : [],
                color: typeof s.color === "string" ? s.color : undefined,
                unit,
              };
            })
        : undefined;
      const segments = Array.isArray(data.segments)
        ? data.segments
            .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
            .map((s) => ({
              name: String(s.name ?? ""),
              label: String(s.label ?? s.name ?? ""),
              pct: Number(s.pct),
              amount: typeof s.amount === "string" ? s.amount : undefined,
            }))
            .filter((s) => s.name && Number.isFinite(s.pct))
        : undefined;
      if ((series && series.some((s) => s.values.length >= 2)) || (segments && segments.length)) {
        return {
          type: "chart",
          variant,
          title: typeof data.title === "string" ? data.title : undefined,
          prose: typeof data.prose === "string" ? data.prose : undefined,
          series,
          segments,
        };
      }
    }
    if (kind === "recommend") {
      const options = Array.isArray(data.options)
        ? data.options
            .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
            .map((o) => ({
              key: String(o.key ?? o.short ?? "opt"),
              body: String(o.body ?? o.short ?? ""),
              short: String(o.short ?? o.body ?? ""),
              signal: Number.isFinite(Number(o.signal)) ? Number(o.signal) : 1,
              label: String(o.label ?? ""),
              cta: String(o.cta ?? "Uygula"),
            }))
            .filter((o) => o.body)
        : [];
      if (typeof data.question === "string" && options.length) {
        return { type: "recommend", question: data.question, options };
      }
    }
    if (kind === "map" || kind === "route") {
      const points = Array.isArray(data.points)
        ? data.points.flatMap((p) => {
            const parsed = parseMapPoint(p);
            return parsed ? [parsed] : [];
          })
        : [];
      const includeDepot = data.includeDepot !== false;
      if (points.length === 0 && !includeDepot) return null;
      const mapsUrl = parseHttpsUrl(data.mapsUrl ?? data.maps_url);
      return {
        type: "map",
        title: typeof data.title === "string" ? data.title : undefined,
        includeDepot,
        mapsUrl,
        points,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function splitMarkdownTables(text: string, streaming: boolean): AgentBlock[] {
  const blocks: AgentBlock[] = [];
  let last = 0;
  const re = new RegExp(TABLE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + (m[0].startsWith("\n") ? 1 : 0);
    const tableRaw = m[1] ?? "";
    const before = text.slice(last, start);
    if (before.trim()) blocks.push({ type: "markdown", text: before });
    const parsed = parseGfmTable(tableRaw);
    if (parsed) blocks.push(parsed);
    else if (tableRaw.trim()) blocks.push({ type: "markdown", text: tableRaw });
    last = start + tableRaw.length;
  }
  const tail = text.slice(last);
  if (!tail) return blocks;

  if (streaming) {
    const lines = tail.split(/\r?\n/);
    let cut = lines.length;
    while (cut > 0 && lines[cut - 1]?.trim().startsWith("|")) cut -= 1;
    const pendingTable = lines.slice(cut).join("\n");
    const prose = lines.slice(0, cut).join("\n");
    if (prose.trim()) blocks.push({ type: "markdown", text: prose });
    if (pendingTable.trim()) {
      if (looksCompleteTable(pendingTable)) {
        const parsed = parseGfmTable(pendingTable);
        if (parsed) blocks.push(parsed);
        else blocks.push({ type: "markdown", text: pendingTable });
      } else {
        blocks.push({ type: "pending", label: "Tablo kuruluyor" });
      }
    }
    return blocks;
  }

  if (tail.trim()) blocks.push({ type: "markdown", text: tail });
  return blocks;
}

export function parseAgentContent(
  markdown: string,
  opts: { streaming?: boolean } = {}
): AgentBlock[] {
  const streaming = Boolean(opts.streaming);
  const blocks: AgentBlock[] = [];
  let last = 0;
  const re = new RegExp(FENCE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const before = markdown.slice(last, m.index);
    if (before) blocks.push(...splitMarkdownTables(before, false));
    const parsed = parseLocusJson(m[1] ?? "");
    if (parsed) blocks.push(parsed);
    last = m.index + m[0].length;
  }
  const rest = markdown.slice(last);
  if (streaming) {
    const open = rest.match(OPEN_FENCE);
    if (open) {
      const before = rest.slice(0, open.index ?? 0);
      if (before) blocks.push(...splitMarkdownTables(before, true));
      blocks.push({ type: "pending", label: "Görsel hazırlanıyor" });
      return coalesceVisuals(blocks.filter((b) => !(b.type === "markdown" && !b.text.trim())));
    }
  }
  if (rest) blocks.push(...splitMarkdownTables(rest, streaming));
  return coalesceVisuals(
    blocks.filter((b) => !(b.type === "markdown" && !b.text.trim()))
  );
}

/** Filtre tablosu ile hemen sonraki/önceki grafiği tek karta bağlar. */
export function coalesceVisuals(blocks: AgentBlock[]): AgentBlock[] {
  const out: AgentBlock[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const current = blocks[i]!;
    const next = blocks[i + 1];
    if (current.type === "filter" && next?.type === "chart") {
      out.push({ ...current, chart: next });
      i += 1;
      continue;
    }
    if (current.type === "chart" && next?.type === "filter") {
      out.push({ ...next, chart: current });
      i += 1;
      continue;
    }
    out.push(current);
  }
  return out;
}

export function tableToFilterHint(table: TableBlock): FilterBlock | null {
  const cols = table.columns.map((c) => c.toLowerCase());
  const borcIdx = cols.findIndex((c) => /borç|borc|yaş|yas|gün|gun|durum|risk/.test(c));
  if (borcIdx < 0 || table.rows.length < 3) return null;
  const filterKey = table.columns[borcIdx]!;
  const keys = new Map<string, { key: string; label: string; dot?: string }>();
  keys.set("all", { key: "all", label: "Tümü" });
  for (const row of table.rows) {
    const val = row[borcIdx] ?? "";
    const key = val.toLowerCase().replace(/\s+/g, "-").slice(0, 24) || "diger";
    if (!keys.has(key)) keys.set(key, { key, label: val || "—" });
  }
  if (keys.size < 3) return null;
  return {
    type: "filter",
    filters: [...keys.values()],
    columns: table.columns,
    rows: asRecordRows(table).map((r) => ({
      ...r,
      [filterKey]: r[filterKey] ?? "",
      filter: (r[filterKey] ?? "").toLowerCase().replace(/\s+/g, "-").slice(0, 24) || "diger",
    })),
    filterKey: "filter",
  };
}
