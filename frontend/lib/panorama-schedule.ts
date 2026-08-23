/**
 * n8n landing ~07:00 / 19:00 Europe/Istanbul; transform shortly after
 * (frontend/README.md). Türkiye 2016'dan beri yıl boyu UTC+3.
 */
const IST_OFFSET_MS = 3 * 60 * 60 * 1000;
const SLOT_MINUTES = [7 * 60, 19 * 60] as const;

const stampFormatter = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function istanbulWall(from: Date) {
  const ist = new Date(from.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth(),
    day: ist.getUTCDate(),
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
}

function utcFromIstanbul(year: number, month: number, day: number, minutes: number) {
  return new Date(Date.UTC(year, month, day, 0, minutes) - IST_OFFSET_MS);
}

/** Bir sonraki planlı Panorama sync anı (landing penceresi). */
export function nextPanoramaSyncAt(from = new Date()): Date {
  const wall = istanbulWall(from);
  const slot = SLOT_MINUTES.find((m) => m > wall.minutes);
  if (slot != null) {
    return utcFromIstanbul(wall.year, wall.month, wall.day, slot);
  }
  return utcFromIstanbul(wall.year, wall.month, wall.day + 1, SLOT_MINUTES[0]);
}

export function formatIstanbulStamp(value: string | Date | null): string | null {
  if (value == null) return null;
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return stampFormatter.format(date);
  } catch {
    return null;
  }
}

export function nextPanoramaSyncStamp(from = new Date()): string | null {
  return formatIstanbulStamp(nextPanoramaSyncAt(from));
}
