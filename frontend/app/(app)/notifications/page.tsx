"use client";

import { useState } from "react";
import { SendIcon } from "lucide-react";
import { Typography } from "@heroui/react";

import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { toastManager } from "@/components/ui/toast";

/**
 * n8n → Telegram bildirim altyapısının test yüzeyi. Bilerek sidebar'a
 * bağlanmadı — yalnız URL ile erişilen geçici bir test sayfası (bkz. plan).
 */
export default function NotificationsPage() {
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const bildirimGonder = async () => {
    setGonderiliyor(true);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Bildirim gönderilemedi.");
      toastManager.add({
        type: "success",
        title: "Bildirim gönderildi",
        description: "n8n tetiklendi — Telegram’a birkaç saniye içinde düşmeli.",
      });
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Bildirim gönderilemedi",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Typography.Heading level={5} className="shrink-0 tracking-tight">
            Bildirimler
          </Typography.Heading>
          <Typography.Paragraph size="sm" color="muted" truncate className="hidden sm:block">
            n8n → Telegram bildirim altyapısı test yüzeyi
          </Typography.Paragraph>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between gap-6">
          <div className="space-y-3">
            <Typography.Paragraph size="sm">
              Bu sayfa n8n’deki{" "}
              <code className="rounded bg-inset px-1 py-0.5 font-mono text-[12px]">
                telegram-notification
              </code>{" "}
              workflow’una giden bağlantıyı test etmek için var. Aşağıdaki
              düğme sabit bir test mesajı gönderir; n8n workflow’u aktif ve
              Telegram credential’ı doluysa mesaj Telegram’a düşer.
            </Typography.Paragraph>
            <Typography.Paragraph size="sm" color="muted">
              n8n tarafındaki kurulum adımları için{" "}
              <code className="rounded bg-inset px-1 py-0.5 font-mono text-[12px]">
                backend/n8n/README.md
              </code>
              .
            </Typography.Paragraph>
          </div>

          <button
            type="button"
            onClick={() => void bildirimGonder()}
            disabled={gonderiliyor}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-ink text-[13px] font-medium text-[var(--card)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <SendIcon className="size-4" strokeWidth={1.75} aria-hidden />
            {gonderiliyor ? "Gönderiliyor…" : "Bildirim Gönder"}
          </button>
        </div>
      </div>
    </div>
  );
}
