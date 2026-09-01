import { NextResponse } from "next/server";

import { DEPOT } from "@/lib/depot";
import {
  MAX_ARA_DURAK,
  siraOptimizeEt,
  type Nokta,
} from "@/lib/rota/google-routes";

export const runtime = "nodejs";

/**
 * POST /api/rota/optimize
 *
 * Bir aracın duraklarını trafiğe göre sıraya dizer. Anahtar sunucuda kalır —
 * `GOOGLE_MAPS_API_KEY` (NEXT_PUBLIC_ DEĞİL). Oturum koruması middleware'den
 * gelir; bu yol AGENT_WRITABLE_PATHS'e eklenmedi (agent tetiklemesin).
 *
 * Body: { duraklar: [{lat, lon}], depoyaDonus?: boolean, kalkis?: ISO }
 */
export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GOOGLE_MAPS_API_KEY tanımlı değil. Kök .env dosyasına ekleyip 'npm run sync-env' çalıştırın.",
      },
      { status: 501 }
    );
  }

  let govde: unknown;
  try {
    govde = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const { duraklar, depoyaDonus, kalkis } = (govde ?? {}) as {
    duraklar?: unknown;
    depoyaDonus?: unknown;
    kalkis?: unknown;
  };

  if (!Array.isArray(duraklar) || duraklar.length === 0) {
    return NextResponse.json(
      { error: "En az bir durak gerekiyor." },
      { status: 400 }
    );
  }
  if (duraklar.length > MAX_ARA_DURAK) {
    return NextResponse.json(
      {
        error: `Tek istekte en fazla ${MAX_ARA_DURAK} durak optimize edilebilir (${duraklar.length} gönderildi).`,
      },
      { status: 400 }
    );
  }

  const noktalar: Nokta[] = [];
  for (const d of duraklar) {
    const lat = Number((d as { lat?: unknown })?.lat);
    const lon = Number((d as { lon?: unknown })?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json(
        { error: "Duraklardan birinin koordinatı geçersiz." },
        { status: 400 }
      );
    }
    noktalar.push({ lat, lon });
  }

  try {
    const sonuc = await siraOptimizeEt({
      depo: { lat: DEPOT.lat, lon: DEPOT.lon },
      duraklar: noktalar,
      depoyaDonus: depoyaDonus === true,
      kalkis: typeof kalkis === "string" ? kalkis : undefined,
      apiKey,
    });
    return NextResponse.json(sonuc);
  } catch (err) {
    const mesaj =
      err instanceof Error ? err.message : "Rota optimizasyonu başarısız.";
    console.error("[rota/optimize]", mesaj);
    return NextResponse.json({ error: mesaj }, { status: 502 });
  }
}
