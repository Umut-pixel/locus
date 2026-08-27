/**
 * Anthropic Usage & Cost Admin API — sunucu tarafı.
 * Anahtar tarayıcıya çıkmaz; Ayarlar sayfası /api/ayarlar/usage üzerinden okur.
 *
 * https://platform.claude.com/docs/en/manage-claude/usage-cost-api
 */

export const ANTHROPIC_ADMIN_KEY_ENV = "ANTHROPIC_ADMIN_KEY";
const ANTHROPIC_VERSION = "2023-06-01";
const USER_AGENT = "Locus/1.0 (https://locus-two-delta.vercel.app)";
const USAGE_URL = "https://api.anthropic.com/v1/organizations/usage_report/messages";
const COST_URL = "https://api.anthropic.com/v1/organizations/cost_report";
const MAX_PAGES = 8;
const CACHE_TTL_MS = 60_000;

export type UsageGunAraligi = 7 | 31;

export type UsageGun = {
  gun: string;
  uncachedInput: number;
  cacheRead: number;
  cacheCreate: number;
  output: number;
  webSearch: number;
  maliyetUsd: number;
};

export type UsageModel = {
  model: string;
  uncachedInput: number;
  cacheRead: number;
  cacheCreate: number;
  output: number;
  maliyetUsd: number;
};

export type UsageKalem = {
  aciklama: string;
  model: string | null;
  maliyetUsd: number;
};

export type UsageOzet = {
  gunAraligi: UsageGunAraligi;
  startingAt: string;
  endingAt: string;
  cekildi: string;
  uncachedInput: number;
  cacheRead: number;
  cacheCreate: number;
  output: number;
  webSearch: number;
  maliyetUsd: number;
  cacheIsabet: number | null;
  gunler: UsageGun[];
  modeller: UsageModel[];
  kalemler: UsageKalem[];
};

export type UsagePayload =
  | { ok: true; configured: true; ozet: UsageOzet }
  | { ok: false; configured: false; error: string }
  | { ok: false; configured: true; error: string };

type CacheCreation = {
  ephemeral_1h_input_tokens?: number;
  ephemeral_5m_input_tokens?: number;
};

type UsageResult = {
  model?: string | null;
  uncached_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: CacheCreation;
  output_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
};

type CostResult = {
  amount?: string;
  description?: string | null;
  model?: string | null;
};

type Bucket<T> = {
  starting_at: string;
  ending_at: string;
  results: T[];
};

type ReportPage<T> = {
  data?: Bucket<T>[];
  has_more?: boolean;
  next_page?: string | null;
};

type CacheEntry = { at: number; payload: UsagePayload };

const memoryCache = new Map<string, CacheEntry>();

function n(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cacheCreateTokens(row: UsageResult): number {
  const c = row.cache_creation;
  if (!c) return 0;
  return n(c.ephemeral_1h_input_tokens) + n(c.ephemeral_5m_input_tokens);
}

/** Cost API `amount` USD ondalık dize. */
function usd(amount: string | undefined): number {
  if (!amount) return 0;
  const v = Number.parseFloat(amount);
  return Number.isFinite(v) ? v : 0;
}

function isoGun(startingAt: string): string {
  return startingAt.slice(0, 10);
}

function windowUtc(days: UsageGunAraligi): { startingAt: string; endingAt: string } {
  const ending = new Date();
  ending.setUTCHours(0, 0, 0, 0);
  ending.setUTCDate(ending.getUTCDate() + 1);
  const starting = new Date(ending);
  starting.setUTCDate(starting.getUTCDate() - days);
  return { startingAt: starting.toISOString(), endingAt: ending.toISOString() };
}

function adminKey(): string {
  return process.env[ANTHROPIC_ADMIN_KEY_ENV]?.trim() ?? "";
}

export function isAdminKeyConfigured(): boolean {
  return adminKey().startsWith("sk-ant-admin");
}

async function anthropicGet<T>(
  url: string,
  params: URLSearchParams
): Promise<ReportPage<T>> {
  const res = await fetch(`${url}?${params.toString()}`, {
    method: "GET",
    headers: {
      "anthropic-version": ANTHROPIC_VERSION,
      "x-api-key": adminKey(),
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });
  const body = (await res.json()) as ReportPage<T> & { error?: { message?: string } | string };
  if (!res.ok) {
    const msg =
      typeof body.error === "string"
        ? body.error
        : body.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(msg);
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  return body;
}

async function fetchAllBuckets<T>(
  url: string,
  base: URLSearchParams
): Promise<Bucket<T>[]> {
  const buckets: Bucket<T>[] = [];
  let page: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const params = new URLSearchParams(base);
    if (page) params.set("page", page);
    const report = await anthropicGet<T>(url, params);
    buckets.push(...(report.data ?? []));
    if (!report.has_more || !report.next_page) break;
    page = report.next_page;
  }
  return buckets;
}

function emptyGun(gun: string): UsageGun {
  return {
    gun,
    uncachedInput: 0,
    cacheRead: 0,
    cacheCreate: 0,
    output: 0,
    webSearch: 0,
    maliyetUsd: 0,
  };
}

function addUsage(target: {
  uncachedInput: number;
  cacheRead: number;
  cacheCreate: number;
  output: number;
  webSearch?: number;
}, row: UsageResult) {
  target.uncachedInput += n(row.uncached_input_tokens);
  target.cacheRead += n(row.cache_read_input_tokens);
  target.cacheCreate += cacheCreateTokens(row);
  target.output += n(row.output_tokens);
  if (target.webSearch != null) {
    target.webSearch += n(row.server_tool_use?.web_search_requests);
  }
}

export async function loadUsageOzet(
  days: UsageGunAraligi,
  opts?: { fresh?: boolean }
): Promise<UsagePayload> {
  if (!adminKey()) {
    return {
      ok: false,
      configured: false,
      error:
        "Anthropic Admin API anahtarı yok. Console → Settings → Admin API keys üzerinden sk-ant-admin01-… oluşturup Vercel / .env içine ANTHROPIC_ADMIN_KEY olarak ekleyin. Sıradan API anahtarı (sk-ant-api…) bu uçta çalışmaz.",
    };
  }
  if (!isAdminKeyConfigured()) {
    return {
      ok: false,
      configured: false,
      error:
        "ANTHROPIC_ADMIN_KEY Admin anahtarı değil. sk-ant-admin01- ile başlamalı; bireysel hesapta bu API yok — Organization gerekir.",
    };
  }

  const cacheKey = `d${days}`;
  const hit = memoryCache.get(cacheKey);
  if (!opts?.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.payload;

  const { startingAt, endingAt } = windowUtc(days);

  try {
    const usageParams = new URLSearchParams({
      starting_at: startingAt,
      ending_at: endingAt,
      bucket_width: "1d",
      limit: String(days),
    });
    usageParams.append("group_by[]", "model");

    const costParams = new URLSearchParams({
      starting_at: startingAt,
      ending_at: endingAt,
      bucket_width: "1d",
      limit: String(days),
    });
    costParams.append("group_by[]", "description");

    const [usageBuckets, costBuckets] = await Promise.all([
      fetchAllBuckets<UsageResult>(USAGE_URL, usageParams),
      fetchAllBuckets<CostResult>(COST_URL, costParams),
    ]);

    const gunMap = new Map<string, UsageGun>();
    const modelMap = new Map<string, UsageModel>();
    const kalemMap = new Map<string, UsageKalem>();

    const totals = {
      uncachedInput: 0,
      cacheRead: 0,
      cacheCreate: 0,
      output: 0,
      webSearch: 0,
      maliyetUsd: 0,
    };

    for (const bucket of usageBuckets) {
      const gun = isoGun(bucket.starting_at);
      const day = gunMap.get(gun) ?? emptyGun(gun);
      for (const row of bucket.results ?? []) {
        addUsage(totals, row);
        addUsage(day, row);
        day.webSearch += n(row.server_tool_use?.web_search_requests);
        const model = row.model?.trim() || "diğer";
        const m =
          modelMap.get(model) ??
          {
            model,
            uncachedInput: 0,
            cacheRead: 0,
            cacheCreate: 0,
            output: 0,
            maliyetUsd: 0,
          };
        addUsage(m, row);
        modelMap.set(model, m);
      }
      gunMap.set(gun, day);
    }

    for (const bucket of costBuckets) {
      const gun = isoGun(bucket.starting_at);
      const day = gunMap.get(gun) ?? emptyGun(gun);
      for (const row of bucket.results ?? []) {
        const amount = usd(row.amount);
        totals.maliyetUsd += amount;
        day.maliyetUsd += amount;
        const model = row.model?.trim() || null;
        if (model) {
          const m =
            modelMap.get(model) ??
            {
              model,
              uncachedInput: 0,
              cacheRead: 0,
              cacheCreate: 0,
              output: 0,
              maliyetUsd: 0,
            };
          m.maliyetUsd += amount;
          modelMap.set(model, m);
        }
        const aciklama = row.description?.trim() || "Diğer";
        const k = kalemMap.get(aciklama) ?? { aciklama, model, maliyetUsd: 0 };
        k.maliyetUsd += amount;
        if (!k.model && model) k.model = model;
        kalemMap.set(aciklama, k);
      }
      gunMap.set(gun, day);
    }

    const inputAll = totals.uncachedInput + totals.cacheRead + totals.cacheCreate;
    const ozet: UsageOzet = {
      gunAraligi: days,
      startingAt,
      endingAt,
      cekildi: new Date().toISOString(),
      ...totals,
      cacheIsabet: inputAll > 0 ? totals.cacheRead / inputAll : null,
      gunler: [...gunMap.values()].sort((a, b) => a.gun.localeCompare(b.gun)),
      modeller: [...modelMap.values()].sort((a, b) => b.maliyetUsd - a.maliyetUsd || b.output - a.output),
      kalemler: [...kalemMap.values()]
        .sort((a, b) => b.maliyetUsd - a.maliyetUsd)
        .slice(0, 12),
    };

    const payload: UsagePayload = { ok: true, configured: true, ozet };
    memoryCache.set(cacheKey, { at: Date.now(), payload });
    return payload;
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    const raw = err instanceof Error ? err.message : String(err);
    let error = raw;
    if (status === 401 || status === 403) {
      error =
        "Admin API reddetti. Anahtar geçersiz olabilir veya hesap bireysel — Usage API yalnız Organization + Admin anahtarı ile çalışır.";
    }
    const payload: UsagePayload = { ok: false, configured: true, error };
    return payload;
  }
}
