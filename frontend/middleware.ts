import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  defaultRouteForIzinler,
  hasRequiredIzin,
  izinForPathname,
  parseIzinler,
} from "@/lib/permissions";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

/** Database Webhook / manuel — oturum yok; route CRON_SECRET ile korur. */
const CRON_PATHS = new Set(["/api/sync/panorama", "/api/notifications/send"]);

/**
 * AI agent'ın (LangSmith'te barınan, tarayıcı oturumu olmayan) yazabildiği
 * route'lar. Oturum cookie'si yerine `Authorization: Bearer <AGENT_API_SECRET>`
 * kabul edilir — /api/sync/panorama'daki CRON_SECRET deseninin aynısı.
 *
 * Bilinçli olarak DAR tutuldu. Yeni bir yol eklemeden önce o route'un agent
 * tarafından tetiklenmesinin güvenli olduğundan emin ol.
 *
 * Buradaki her yol ya geri alınabilir (not, favori), ya da hiçbir şey yazmıyor
 * (/api/rota/otomatik yalnız taslak üretir). Tek yıkıcı olan /api/rota/plan —
 * o gün o araç için mevcut planı silip yeniden yazar; bu yüzden agent'ın onu
 * ancak kullanıcı sohbette onay verdikten sonra, elindeki taslak kimliğiyle
 * çağırması gerekiyor (bkz. agent/instructions.md "Rota kurma").
 *
 * /api/rota/optimize bilerek DIŞARIDA: doğrudan Google Routes'a para harcayan
 * ham bir uç, agent'ın serbestçe tetiklemesine gerek yok — otomatik plan
 * zaten sıralamayı kendi içinde yapıyor.
 */
const AGENT_WRITABLE_PATHS = new Set([
  "/api/notlar",
  "/api/musteri/favori",
  "/api/rota/otomatik",
  "/api/rota/plan",
  "/api/sync/panorama/manual",
]);

/** Sabit zamanlı karşılaştırma — token uzunluğu/içeriği sızmasın. */
function secretMatches(header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const given = header.slice(prefix.length);
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) {
    diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

/** Olası oturum-yenileme cookie'lerini hedef response'a taşır. */
function withRefreshedCookies(
  target: NextResponse,
  source: NextResponse
): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (CRON_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Agent servis-servis çağrısı: oturum yok, paylaşılan sır var.
  // Yalnız POST — GET/listeleme için tarayıcı oturumu gerekir.
  if (AGENT_WRITABLE_PATHS.has(pathname) && request.method === "POST") {
    const agentSecret = process.env.AGENT_API_SECRET?.trim() ?? "";
    if (
      agentSecret &&
      secretMatches(request.headers.get("authorization"), agentSecret)
    ) {
      return NextResponse.next();
    }
    // Eşleşmezse aşağıdaki normal oturum kontrolüne düşer (kullanıcı da
    // bu route'ları tarayıcıdan kullanıyor).
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: "Sunucu yapılandırma hatası" },
      { status: 500 }
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthed = Boolean(user);
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!isAuthed && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return withRefreshedCookies(
        NextResponse.json({ error: "Oturum gerekli" }, { status: 401 }),
        response
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return withRefreshedCookies(NextResponse.redirect(loginUrl), response);
  }

  if (isAuthed) {
    const izinler = parseIzinler(user!.app_metadata?.izinler);

    if (pathname === "/login" || pathname === "/") {
      if (izinler.length > 0) {
        const home = request.nextUrl.clone();
        home.pathname = defaultRouteForIzinler(izinler);
        home.search = "";
        return withRefreshedCookies(NextResponse.redirect(home), response);
      }
      // İzin yok (bozuk/rolsüz hesap) — login sayfasını normal göster,
      // döngüye girme.
      return response;
    }

    const required = izinForPathname(pathname);
    if (!hasRequiredIzin(izinler, required)) {
      if (pathname.startsWith("/api/")) {
        return withRefreshedCookies(
          NextResponse.json({ error: "Yetkisiz" }, { status: 403 }),
          response
        );
      }
      if (izinler.length === 0) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.search = "";
        return withRefreshedCookies(
          NextResponse.redirect(loginUrl),
          response
        );
      }
      const fallback = request.nextUrl.clone();
      fallback.pathname = defaultRouteForIzinler(izinler);
      fallback.search = "";
      return withRefreshedCookies(NextResponse.redirect(fallback), response);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
