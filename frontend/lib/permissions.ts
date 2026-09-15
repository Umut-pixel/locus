/**
 * İzin kodu taksonomisi + route↔izin haritası.
 *
 * Bu dosya middleware ve nav filtrelemesinin HIZLI yolu — `auth.users.app_metadata.izinler`
 * (login/rol değişikliğinde yazılır) üzerinden çalışır. Gerçek veri sınırı her zaman
 * Postgres'teki `has_izin()` (bkz. sql/roller_izinler_sema.sql); burası yalnız
 * sayfa/route görünürlüğü içindir — ikisi arasında tutarsızlık olsa bile veri sızmaz.
 */

export const IZIN_KODLARI = [
  "harita",
  "stok_raporlari",
  "finansal_raporlar",
  "tahsilat_raporlari",
  "sevkiyat_raporlari",
  "musteri_raporlama",
  "rota_planlama",
  "ai_sohbet",
  "ayarlar",
  "kullanici_yonetimi",
  "musteri_finansal_detay",
] as const;

export type IzinKodu = (typeof IZIN_KODLARI)[number];

export function isIzinKodu(value: unknown): value is IzinKodu {
  return (
    typeof value === "string" && (IZIN_KODLARI as readonly string[]).includes(value)
  );
}

export function parseIzinler(value: unknown): IzinKodu[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isIzinKodu);
}

interface RouteIzinEntry {
  prefix: string;
  /** Birden fazla izin verilirse OR — herhangi biri yeterli. */
  izin: IzinKodu | IzinKodu[];
}

function eslesir(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Sayfa route'ları — EN UZUN/ÖZEL prefix ÖNCE (örn. /raporlar/finansal,
 * /raporlar'dan önce kontrol edilmeli).
 */
const SAYFA_IZIN_HARITASI: RouteIzinEntry[] = [
  { prefix: "/raporlar/finansal", izin: "finansal_raporlar" },
  { prefix: "/raporlar/tahsilat", izin: "tahsilat_raporlari" },
  { prefix: "/raporlar/sevkiyat", izin: "sevkiyat_raporlari" },
  { prefix: "/raporlar/stok", izin: "stok_raporlari" },
  { prefix: "/raporlar", izin: "musteri_raporlama" },
  { prefix: "/rotalar", izin: "rota_planlama" },
  { prefix: "/harita", izin: "harita" },
  { prefix: "/sohbet", izin: "ai_sohbet" },
  { prefix: "/home", izin: "ai_sohbet" },
  { prefix: "/ayarlar", izin: "ayarlar" },
];

/**
 * API route'ları — yalnız BELİRLİ bir izin gerektirenler burada. Listelenmeyen
 * `/api/*` yollar "oturum yeterli" (bugünküyle aynı, regresyon değil).
 * CRON_PATHS / AGENT_WRITABLE_PATHS middleware.ts'de zaten ayrıca ele alınıyor,
 * burada tekrarlanmaz.
 */
const API_IZIN_HARITASI: RouteIzinEntry[] = [
  { prefix: "/api/kullanicilar", izin: "kullanici_yonetimi" },
  { prefix: "/api/agent", izin: "ai_sohbet" },
  { prefix: "/api/ayarlar", izin: "ayarlar" },
  { prefix: "/api/sync/panorama/manual", izin: "ayarlar" },
  { prefix: "/api/sync/panorama/ozet", izin: "ayarlar" },
  { prefix: "/api/rota", izin: "rota_planlama" },
  { prefix: "/api/filo", izin: "rota_planlama" },
  { prefix: "/api/potansiyel/tarama", izin: "harita" },
  { prefix: "/api/musteri/favori", izin: "harita" },
  { prefix: "/api/musteri/gizle", izin: "harita" },
  { prefix: "/api/potansiyel/favori", izin: "harita" },
  { prefix: "/api/potansiyel/gizle", izin: "harita" },
  { prefix: "/api/notlar", izin: "harita" },
  { prefix: "/api/upload", izin: ["harita", "stok_raporlari"] },
];

/** pathname için gereken izin — eşleşme yoksa null (yalnız oturum yeterli). */
export function izinForPathname(pathname: string): IzinKodu | IzinKodu[] | null {
  const harita = pathname.startsWith("/api/") ? API_IZIN_HARITASI : SAYFA_IZIN_HARITASI;
  for (const entry of harita) {
    if (eslesir(pathname, entry.prefix)) return entry.izin;
  }
  return null;
}

export function hasRequiredIzin(
  izinler: readonly IzinKodu[],
  required: IzinKodu | IzinKodu[] | null
): boolean {
  if (!required) return true;
  const set = new Set(izinler);
  if (Array.isArray(required)) return required.some((k) => set.has(k));
  return set.has(required);
}

/** Rol önceliği — ilk uyan izin, giriş sonrası varsayılan sayfayı belirler. */
const VARSAYILAN_ROTA_ONCELIGI: { izin: IzinKodu; href: string }[] = [
  { izin: "ai_sohbet", href: "/home" },
  { izin: "harita", href: "/harita" },
  { izin: "stok_raporlari", href: "/raporlar/stok" },
  { izin: "musteri_raporlama", href: "/raporlar" },
  { izin: "finansal_raporlar", href: "/raporlar/finansal" },
  { izin: "tahsilat_raporlari", href: "/raporlar/tahsilat" },
  { izin: "sevkiyat_raporlari", href: "/raporlar/sevkiyat" },
  { izin: "rota_planlama", href: "/rotalar" },
  { izin: "ayarlar", href: "/ayarlar" },
];

export function defaultRouteForIzinler(izinler: readonly IzinKodu[]): string {
  const set = new Set(izinler);
  for (const { izin, href } of VARSAYILAN_ROTA_ONCELIGI) {
    if (set.has(izin)) return href;
  }
  return "/login";
}
