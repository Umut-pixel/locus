import { promises as fs } from "fs";
import path from "path";

import { metinTemizle } from "./utils";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_UA =
  "patigo-petshop-mvp-etl/1.0 (umuteroltr097@gmail.com)";
const NOMINATIM_BEKLEME_MS = 1100;
const NOMINATIM_TIMEOUT_MS = 20_000;

const TR_ENLEM: [number, number] = [35.8, 42.2];
const TR_BOYLAM: [number, number] = [25.6, 45.0];
const IL_MAX_SAPMA_DERECE = 1.6;

const IL_MERKEZ: Record<string, [number, number]> = {
  İZMİR: [38.4237, 27.1428],
  MANİSA: [38.6191, 27.4289],
  AYDIN: [37.856, 27.8416],
  MUĞLA: [37.2153, 28.3636],
  DENİZLİ: [37.7765, 29.0864],
  BALIKESİR: [39.6484, 27.8826],
  ÇANAKKALE: [40.1553, 26.4142],
  UŞAK: [38.6823, 29.4082],
};

const HASSASIYET: Record<string, string> = {
  erp: "saha_gps",
  nominatim_mahalle: "mahalle_merkezi",
  nominatim_ilce: "ilce_merkezi",
  basarisiz: "yok",
};

type CacheEntry = { lat: number; lon: number; tip?: string; display?: string } | Record<string, never>;

function cachePath(): string {
  // backend/geocode_cache.json (ETL ile paylaşılır)
  return path.resolve(process.cwd(), "..", "backend", "geocode_cache.json");
}

function slug(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .normalize("NFKC");
}

export function mahalleAyikla(adres: string): string {
  if (!adres) return "";
  const m = adres.match(
    /([A-ZÇĞİÖŞÜa-zçğıöşü0-9.\s]{2,40}?)\s*MAH(?:\.|ALLESİ|ALLESI)?\b/i
  );
  if (!m) return "";
  return m[1].replace(/\s+/g, " ").trim().replace(/^[\s.,\-]+|[\s.,\-]+$/g, "");
}

function koordinatGecerli(lat: number, lon: number, sehir: string): boolean {
  if (
    lat < TR_ENLEM[0] ||
    lat > TR_ENLEM[1] ||
    lon < TR_BOYLAM[0] ||
    lon > TR_BOYLAM[1]
  ) {
    return false;
  }
  const merkez = IL_MERKEZ[sehir];
  if (merkez) {
    if (
      Math.abs(lat - merkez[0]) > IL_MAX_SAPMA_DERECE ||
      Math.abs(lon - merkez[1]) > IL_MAX_SAPMA_DERECE
    ) {
      return false;
    }
  }
  return true;
}

class GeocodeCache {
  private veri: Record<string, CacheEntry> = {};
  private kirli = 0;
  private yol: string;

  constructor(yol: string) {
    this.yol = yol;
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.yol, "utf-8");
      this.veri = JSON.parse(raw) as Record<string, CacheEntry>;
    } catch {
      this.veri = {};
    }
  }

  get(anahtar: string): CacheEntry | undefined {
    return this.veri[anahtar];
  }

  async set(anahtar: string, deger: CacheEntry): Promise<void> {
    this.veri[anahtar] = deger;
    this.kirli += 1;
    if (this.kirli >= 10) await this.save();
  }

  async save(): Promise<void> {
    try {
      await fs.writeFile(
        this.yol,
        JSON.stringify(this.veri, null, 1),
        "utf-8"
      );
      this.kirli = 0;
    } catch {
      // cache yazılamazsa geocode yine çalışır
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function nominatimSorgu(
  q: string,
  cache: GeocodeCache
): Promise<{ lat: number; lon: number } | null> {
  const anahtar = slug(q);
  const cached = cache.get(anahtar);
  if (cached !== undefined) {
    if (!cached || !("lat" in cached)) return null;
    return { lat: cached.lat, lon: cached.lon };
  }

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "1",
    countrycodes: "tr",
    addressdetails: "1",
  });

  await sleep(NOMINATIM_BEKLEME_MS);

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        "User-Agent": NOMINATIM_UA,
        "Accept-Language": "tr,en",
      },
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const sonuc = (await res.json()) as Array<{
      lat: string;
      lon: string;
      type?: string;
      display_name?: string;
    }>;
    if (!sonuc?.length) {
      await cache.set(anahtar, {});
      return null;
    }
    const ilk = sonuc[0];
    const kayit = {
      lat: Number(ilk.lat),
      lon: Number(ilk.lon),
      tip: ilk.type ?? "",
      display: ilk.display_name ?? "",
    };
    await cache.set(anahtar, kayit);
    return { lat: kayit.lat, lon: kayit.lon };
  } catch {
    return null;
  }
}

export interface GeocodeTarget {
  musteri_kodu: string;
  adres: string | null;
  sehir: string | null;
  ilce: string | null;
  lat: number | null;
  lon: number | null;
  geocode_kaynak: string | null;
  geocode_hassasiyet: string | null;
}

/**
 * lat/lon boş olan kayıtları Nominatim ile doldur (mahalle → ilçe).
 * İlçe boşsa tahmin etme.
 */
export async function geocodeEksikler<T extends GeocodeTarget>(
  rows: T[]
): Promise<{ rows: T[]; basarisiz: number }> {
  const cache = new GeocodeCache(cachePath());
  await cache.load();

  let basarisiz = 0;
  const out = [...rows];

  for (let i = 0; i < out.length; i++) {
    const row = out[i];
    if (row.lat != null && row.lon != null) continue;

    const sehir = metinTemizle(row.sehir);
    const ilce = metinTemizle(row.ilce);
    const adres = metinTemizle(row.adres);
    const mahalle = mahalleAyikla(adres);

    const denemeler: Array<["mahalle" | "ilce", string]> = [];
    if (mahalle) {
      const q = [mahalle + " Mahallesi", ilce, sehir, "Türkiye"]
        .filter(Boolean)
        .join(", ");
      denemeler.push(["mahalle", q]);
    }
    if (ilce && sehir) {
      denemeler.push(["ilce", `${ilce}, ${sehir}, Türkiye`]);
    }

    if (denemeler.length === 0) {
      out[i] = {
        ...row,
        geocode_kaynak: "basarisiz",
        geocode_hassasiyet: "yok",
      };
      basarisiz += 1;
      continue;
    }

    let bulundu = false;
    for (const [kademe, sorgu] of denemeler) {
      const sonuc = await nominatimSorgu(sorgu, cache);
      if (sonuc && koordinatGecerli(sonuc.lat, sonuc.lon, sehir)) {
        const kaynak = `nominatim_${kademe}`;
        out[i] = {
          ...row,
          lat: Math.round(sonuc.lat * 1e7) / 1e7,
          lon: Math.round(sonuc.lon * 1e7) / 1e7,
          geocode_kaynak: kaynak,
          geocode_hassasiyet: HASSASIYET[kaynak] ?? "yok",
        };
        bulundu = true;
        break;
      }
    }

    if (!bulundu) {
      out[i] = {
        ...row,
        geocode_kaynak: "basarisiz",
        geocode_hassasiyet: "yok",
      };
      basarisiz += 1;
    }
  }

  await cache.save();
  return { rows: out, basarisiz };
}
