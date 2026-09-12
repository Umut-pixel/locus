import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

const HEADER_SECRET = "X-N8N-Notification-Secret";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Bildirim sisteminin TEK çıkış noktası — Postgres tarafındaki
 * `bildirim_anlik_kontrol_calistir()`/`bildirim_gunluk_ozet_calistir()`
 * (bkz. sql/) pg_net ile buraya POST atar, `CRON_SECRET` ile aynı desende
 * (bkz. app/api/sync/panorama/route.ts::authorize).
 *
 * Ayar kontrolü (aktif=true) BİLEREK burada değil, SQL tarafında yapılıyor —
 * günlük özet birden çok tipi tek mesajda birleştiriyor, gönderirken tekrar
 * kontrol etmek ya mesajın tamamını yanlış tipe bakıp bloklar ya da kısmi
 * blok mantığı gerektirir. SQL zaten yalnız aktif tipleri topladığı için bu
 * route yalnız iletir — n8n webhook'una gönderir, ayrıca karar vermez.
 */
function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return jsonError("Yetkisiz.", 401);
  }

  let body: { anahtar?: unknown; mesaj?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Geçersiz JSON.", 400);
  }

  const anahtar = typeof body.anahtar === "string" ? body.anahtar : "bilinmeyen";
  const mesaj = typeof body.mesaj === "string" ? body.mesaj.trim() : "";
  if (!mesaj) {
    return jsonError("mesaj gerekli.", 400);
  }

  const webhookUrl = process.env.N8N_TELEGRAM_NOTIFICATION_WEBHOOK_URL?.trim() ?? "";
  const webhookSecret = process.env.N8N_TELEGRAM_NOTIFICATION_WEBHOOK_SECRET?.trim() ?? "";

  if (!webhookUrl || !webhookSecret) {
    return jsonError("Telegram bildirimi henüz yapılandırılmadı.", 503);
  }

  if (/\/webhook-test\//i.test(webhookUrl)) {
    return jsonError(
      "Test webhook URL’si kullanılıyor. n8n’de Production URL kopyala (Listen kapalıyken test 404 verir).",
      400
    );
  }

  const headers: Record<string, string> = {
    [HEADER_SECRET]: webhookSecret,
    Authorization: `Bearer ${webhookSecret}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ mesaj }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const preview = (await res.text().catch(() => "")).slice(0, 280);
      console.error("[api/notifications/send]", anahtar, res.status, preview);
      if (res.status === 404) {
        return jsonError(
          "n8n webhook bulunamadı. Production URL ve workflow’un aktif olduğunu kontrol et.",
          502
        );
      }
      if (res.status === 401 || res.status === 403) {
        return jsonError(
          "n8n Header Auth reddetti. Webhook Authentication = None olmalı; sır Guard node’da X-N8N-Notification-Secret ile kontrol edilir.",
          502
        );
      }
      return jsonError(`n8n tetiklenemedi (HTTP ${res.status}).`, 502);
    }

    return NextResponse.json({ ok: true, anahtar });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Beklenmeyen sunucu hatası.";
    console.error("[api/notifications/send]", anahtar, err);
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return jsonError("n8n yanıt vermedi.", 504);
    }
    return jsonError(message, 500);
  }
}
