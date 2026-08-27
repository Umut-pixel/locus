const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

const currencyPreciseFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("tr-TR");

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Peek / dar satırlar — kısa güncelleme damgası (örn. 6 Ağu 15:20). */
const dateTimeShortFormatter = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

/** Borç / yaşlandırma tutarları — kuruş hassasiyeti. */
export function formatCurrencyPrecise(value: number): string {
  return currencyPreciseFormatter.format(value);
}

const usdFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Anthropic Cost API — USD. */
export function formatUsd(value: number): string {
  return usdFormatter.format(value);
}

export function formatCompactToken(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(".", ",")} B`;
  return numberFormatter.format(Math.round(value));
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatKg(value: number): string {
  return `${numberFormatter.format(value)} kg`;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

/** timestamptz — tabloya son yazılma (guncellendi). */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

/** timestamptz — peek satırı için kısa format. */
export function formatDateTimeShort(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeShortFormatter.format(date);
}

const timeOnlyFormatter = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_MS = 24 * 60 * 60 * 1000;

function asDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Asistan hover damgası — 1 günden az: saat; sonrası: tarih + saat. */
export function formatAgentStamp(
  value: string | number | Date | null | undefined,
  now: number = Date.now()
): string {
  if (value == null || value === "") return "";
  const date = asDate(value);
  if (!date) return "";
  if (now - date.getTime() < DAY_MS) return timeOnlyFormatter.format(date);
  const yearNow = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
    }).format(now)
  );
  const yearThen = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
    }).format(date)
  );
  return yearThen === yearNow
    ? dateTimeShortFormatter.format(date)
    : dateTimeFormatter.format(date);
}

/** SSE / DB model_name → hover etiketi. */
export function formatAgentModel(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw.replace(/^anthropic:/i, "").trim();
  if (!s) return "";
  if (/opus-5/i.test(s)) return "Opus 5";
  if (/haiku-4-5/i.test(s)) return "Haiku 4.5";
  if (/haiku/i.test(s)) return "Haiku";
  if (/opus/i.test(s)) return "Opus";
  return s.replace(/^claude-/i, "").replace(/-/g, " ");
}
