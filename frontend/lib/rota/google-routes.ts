/**
 * Google Routes API — durak sırası optimizasyonu + trafikli süre.
 *
 * SUNUCU TARAFI. `GOOGLE_MAPS_API_KEY` `NEXT_PUBLIC_` değildir ve olmamalıdır;
 * bu modül yalnız /api/rota/optimize içinden çağrılır.
 *
 * Neden Google: İzmir şehir içi trafiğinde Mapbox'tan daha iyi. Yalnız SIRA ve
 * SÜRE için kullanılıyor — araç ataması ve kapasite mantığı bizde kalıyor
 * (lib/rota/atama.ts), çünkü Aralık 2026'da veritabanı sağlayıcısı değişecek
 * ve ingestion/planlama katmanı kaynak-agnostik kalmalı.
 *
 * Çizim mevcut Mapbox Directions katmanıyla yapılır — polyline burada
 * çözülmez, yalnız sıra döner.
 */

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** optimizeWaypointOrder ile Google'ın kabul ettiği ara durak üst sınırı. */
export const MAX_ARA_DURAK = 25;

const FIELD_MASK = [
  "routes.optimizedIntermediateWaypointIndex",
  "routes.duration",
  "routes.distanceMeters",
  "routes.legs.duration",
  "routes.legs.distanceMeters",
].join(",");

export interface Nokta {
  lat: number;
  lon: number;
}

export type TrafikTercihi = "TRAFFIC_AWARE_OPTIMAL" | "TRAFFIC_AWARE";

export interface OptimizasyonSonucu {
  /** Optimize edilmiş sıra — `intermediates` dizisindeki orijinal indeksler. */
  sira: number[];
  toplamSaniye: number;
  toplamMetre: number;
  bacaklar: { saniye: number; metre: number }[];
  /** Hangi trafik modu kullanılabildi. */
  trafik: TrafikTercihi;
}

interface GoogleLeg {
  duration?: string;
  distanceMeters?: number;
}

interface GoogleRoute {
  optimizedIntermediateWaypointIndex?: number[];
  duration?: string;
  distanceMeters?: number;
  legs?: GoogleLeg[];
}

function waypoint(n: Nokta) {
  return { location: { latLng: { latitude: n.lat, longitude: n.lon } } };
}

/** Google süreleri "1234s" biçiminde döner. */
function saniyeyeCevir(value: string | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value.replace(/s$/, ""));
  return Number.isFinite(n) ? n : 0;
}

/** departureTime geçmişte olamaz — en az 60 sn ileri alınır. */
function kalkisZamani(istenen: string | undefined): string {
  const enErken = Date.now() + 60_000;
  const t = istenen ? Date.parse(istenen) : Number.NaN;
  const secilen = Number.isFinite(t) && t > enErken ? t : enErken;
  return new Date(secilen).toISOString();
}

async function istek(
  govde: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ ok: true; route: GoogleRoute } | { ok: false; durum: number; mesaj: string }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(govde),
    signal,
  });

  if (!res.ok) {
    const metin = await res.text();
    return { ok: false, durum: res.status, mesaj: metin.slice(0, 500) };
  }

  const json = (await res.json()) as { routes?: GoogleRoute[] };
  const route = json.routes?.[0];
  if (!route) {
    return { ok: false, durum: 502, mesaj: "Google rota döndürmedi." };
  }
  return { ok: true, route };
}

/**
 * Depo → duraklar (optimize sırayla) → depo/son durak.
 *
 * `TRAFFIC_AWARE_OPTIMAL` ile `optimizeWaypointOrder` birlikte reddedilirse
 * otomatik olarak `TRAFFIC_AWARE`'e düşer. (Google bu ikisini bazı
 * yapılandırmalarda birlikte kabul etmiyor; hangisinin çalıştığı yanıtta
 * `trafik` alanıyla bildirilir.)
 */
export async function siraOptimizeEt(params: {
  depo: Nokta;
  duraklar: Nokta[];
  /** true → araç depoya döner; false → son durakta biter. */
  depoyaDonus: boolean;
  kalkis?: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<OptimizasyonSonucu> {
  const { depo, duraklar, depoyaDonus, kalkis, apiKey, signal } = params;

  if (duraklar.length === 0) {
    throw new Error("Optimize edilecek durak yok.");
  }
  if (duraklar.length > MAX_ARA_DURAK) {
    throw new Error(
      `Google tek istekte en fazla ${MAX_ARA_DURAK} ara durak optimize eder — ${duraklar.length} durak gönderildi.`
    );
  }

  // Dönüş yoksa son durak varış noktası olur, o yüzden ara duraklardan çıkar.
  const sonDurak = duraklar[duraklar.length - 1]!;
  const araDuraklar = depoyaDonus ? duraklar : duraklar.slice(0, -1);

  const temelGovde = {
    origin: waypoint(depo),
    destination: waypoint(depoyaDonus ? depo : sonDurak),
    intermediates: araDuraklar.map(waypoint),
    travelMode: "DRIVE",
    optimizeWaypointOrder: true,
    departureTime: kalkisZamani(kalkis),
    languageCode: "tr-TR",
    units: "METRIC",
  };

  const denemeler: TrafikTercihi[] = ["TRAFFIC_AWARE_OPTIMAL", "TRAFFIC_AWARE"];
  let sonHata = "";

  for (const trafik of denemeler) {
    const sonuc = await istek(
      { ...temelGovde, routingPreference: trafik },
      apiKey,
      signal
    );

    if (sonuc.ok) {
      const { route } = sonuc;
      // Google ara durakların yeni sırasını verir; dönüş yoksa son durak
      // sabit varış olduğu için sonuna eklenir.
      const sira = route.optimizedIntermediateWaypointIndex
        ? [...route.optimizedIntermediateWaypointIndex]
        : araDuraklar.map((_, i) => i);
      if (!depoyaDonus) sira.push(duraklar.length - 1);

      return {
        sira,
        toplamSaniye: saniyeyeCevir(route.duration),
        toplamMetre: route.distanceMeters ?? 0,
        bacaklar: (route.legs ?? []).map((l) => ({
          saniye: saniyeyeCevir(l.duration),
          metre: l.distanceMeters ?? 0,
        })),
        trafik,
      };
    }

    sonHata = `${sonuc.durum}: ${sonuc.mesaj}`;
    // 400 = argüman uyuşmazlığı → diğer trafik modunu dene. Diğer hatalarda
    // (401 anahtar, 403 API kapalı, 429 kota) tekrar denemek anlamsız.
    if (sonuc.durum !== 400) break;
  }

  throw new Error(`Google Routes isteği başarısız — ${sonHata}`);
}
