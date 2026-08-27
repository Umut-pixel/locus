"use client";

import { useState } from "react";
import { Typography } from "@heroui/react";

import {
  UsageGunCubugu,
  UsageOzetSerit,
  UsageTablolar,
  UsageYenile,
} from "@/components/ayarlar/UsageOzet";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { useAnthropicUsage } from "@/hooks/useAnthropicUsage";
import type { UsageGunAraligi } from "@/lib/anthropic-usage";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function AyarlarPage() {
  const [days, setDays] = useState<UsageGunAraligi>(7);
  const { payload, loading, reload } = useAnthropicUsage(days);
  const ozet = payload && payload.ok ? payload.ozet : null;

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Typography.Heading level={5} className="shrink-0 tracking-tight">
            Ayarlar
          </Typography.Heading>
          <Typography.Paragraph size="sm" color="muted" truncate className="hidden md:block">
            Analyst API kullanımı
          </Typography.Paragraph>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex rounded-md border border-border p-0.5">
            {([7, 31] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={cn(
                  "h-7 rounded-[5px] px-2 text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  days === d ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {d} gün
              </button>
            ))}
          </div>
          <UsageYenile loading={loading} onYenile={() => void reload()} />
        </div>
      </div>

      {payload && !payload.ok ? (
        <div className="m-3.5 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-[13px] font-medium text-foreground">
            {payload.configured ? "Rapor alınamadı" : "Admin anahtarı yok"}
          </p>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {payload.error}
          </p>
        </div>
      ) : null}

      {ozet ? (
        <>
          <UsageOzetSerit ozet={ozet} loading={loading} />
          <UsageGunCubugu ozet={ozet} />
          <UsageTablolar ozet={ozet} />
          <p className="shrink-0 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
            Anthropic Usage & Cost Admin API · {formatDateTime(ozet.cekildi)} · veriler ~5 dk gecikmeli
          </p>
        </>
      ) : loading && !payload ? (
        <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] animate-pulse bg-background" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
