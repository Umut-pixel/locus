import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

/** Database Webhook / manuel — oturum yok; route CRON_SECRET ile korur. */
const CRON_PATHS = new Set(["/api/sync/panorama"]);

/**
 * AI agent'ın (LangSmith'te barınan, tarayıcı oturumu olmayan) yazabildiği
 * route'lar. Oturum cookie'si yerine `Authorization: Bearer <AGENT_API_SECRET>`
 * kabul edilir — /api/sync/panorama'daki CRON_SECRET deseninin aynısı.
 *
 * Bilinçli olarak DAR tutuldu: agent yalnız not ve favori yazabilir. Yeni bir
 * yol eklemeden önce o route'un agent tarafından tetiklenmesinin güvenli
 * olduğundan emin ol.
 */
const AGENT_WRITABLE_PATHS = new Set(["/api/notlar", "/api/musteri/favori"]);

/**
 * Girişten sonra otomatik DÖNÜLMEYECEK yollar.
 *
 * `/home` (agent sohbeti) sidebar'da bilerek bağlantısız bir geliştirme
 * yüzeyi. Adresi elle yazan biri oraya gidebilmeli — ama oturumu kapalıyken
 * açtığında giriş sonrası oraya düşmemeli. Uygulamanın açılışı her zaman
 * harita olmalı; buraya yalnız kasıtlı gidilir.
 */
const NO_RETURN_PATHS = new Set(["/home"]);

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

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isAuthed = await verifySessionToken(token);
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!isAuthed && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (pathname !== "/" && !NO_RETURN_PATHS.has(pathname)) {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthed && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
