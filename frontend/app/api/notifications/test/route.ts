import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

const HEADER_SECRET = "X-N8N-Notification-Secret";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * `/notifications` test düğmesi buraya POST atar; bu route n8n'in
 * `telegram-notification` webhook'unu server-side tetikler (n8n URL/sır
 * tarayıcıya hiç sızmaz) — `sync/panorama/manual` ile aynı desen, bkz.
 * `backend/n8n/telegram-notification.json` + `backend/n8n/README.md`.
 */
export async function POST() {
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
      body: JSON.stringify({ mesaj: "Locus test bildirimi" }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const preview = (await res.text().catch(() => "")).slice(0, 280);
      console.error("[api/notifications/test] n8n", res.status, preview);
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Beklenmeyen sunucu hatası.";
    console.error("[api/notifications/test]", err);
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return jsonError("n8n yanıt vermedi.", 504);
    }
    return jsonError(message, 500);
  }
}
