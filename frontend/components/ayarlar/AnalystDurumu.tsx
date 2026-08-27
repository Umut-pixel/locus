"use client";

import { useState } from "react";

import { AyarlarBolum } from "@/components/ayarlar/AyarlarBolum";
import {
  UsageGunCubugu,
  UsageOzetSerit,
  UsageTablolar,
  UsageYenile,
} from "@/components/ayarlar/UsageOzet";
import { useAgentHealth } from "@/hooks/useAgentHealth";
import { useAgentRuntimeStatus } from "@/hooks/useAgentRuntimeStatus";
import { useAnthropicUsage } from "@/hooks/useAnthropicUsage";
import { clipAgentError } from "@/lib/agent-status";
import type { UsageGunAraligi } from "@/lib/anthropic-usage";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AnalystDurumu() {
  const [days, setDays] = useState<UsageGunAraligi>(7);
  const usage = useAnthropicUsage(days);
  const health = useAgentHealth();
  const runtime = useAgentRuntimeStatus();
  const ozet = usage.payload && usage.payload.ok ? usage.payload.ozet : null;

  const yenile = () => {
    void usage.reload();
    void health.reload();
  };

  return (
    <AyarlarBolum
      id="analyst"
      baslik="Analyst"
      aksiyon={
        <>
          <div className="flex rounded-md border border-border p-0.5">
            {([7, 31] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={cn(
                  "h-7 rounded-[5px] px-2 text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  days === d
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {d} gün
              </button>
            ))}
          </div>
          <UsageYenile
            loading={usage.loading || health.loading}
            onYenile={yenile}
          />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-px border-b border-border bg-border sm:grid-cols-2">
        <SaglikHucresi
          etiket="Sunucu"
          loading={health.loading && !health.payload}
          ok={health.payload?.ok === true}
          baslik={
            health.payload == null
              ? "Kontrol ediliyor"
              : health.payload.ok
                ? "Yanıt veriyor"
                : health.payload.configured
                  ? "Ulaşılamadı"
                  : "Yapılandırılmamış"
          }
          alt={
            health.payload?.ok
              ? `${health.payload.latencyMs} ms`
              : health.payload && !health.payload.ok
                ? health.payload.error
                : "LangGraph /ok"
          }
        />
        <SaglikHucresi
          etiket="Son sohbet"
          loading={false}
          ok={runtime.ok}
          baslik={runtime.ok ? "Sorun yok" : "Hata"}
          alt={
            runtime.ok
              ? "Bu sekmede düşen tur yok"
              : `${clipAgentError(runtime.message, 80)} · ${formatDateTime(runtime.at)}`
          }
        />
      </div>

      {usage.payload && !usage.payload.ok ? (
        <div className="border-b border-border px-3.5 py-3">
          <p className="text-[13px] font-medium text-foreground">
            {usage.payload.configured ? "Rapor alınamadı" : "Admin anahtarı yok"}
          </p>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {usage.payload.error}
          </p>
        </div>
      ) : null}

      {ozet ? (
        <>
          <UsageOzetSerit ozet={ozet} loading={usage.loading} />
          <UsageGunCubugu ozet={ozet} />
          <UsageTablolar ozet={ozet} />
          <p className="border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
            Anthropic Usage & Cost Admin API · {formatDateTime(ozet.cekildi)} · veriler ~5 dk
            gecikmeli
          </p>
        </>
      ) : usage.loading && !usage.payload ? (
        <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] animate-pulse bg-background" />
          ))}
        </div>
      ) : null}
    </AyarlarBolum>
  );
}

function SaglikHucresi({
  etiket,
  loading,
  ok,
  baslik,
  alt,
}: {
  etiket: string;
  loading: boolean;
  ok: boolean;
  baslik: string;
  alt: string;
}) {
  return (
    <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
      <span className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
        <span
          className={cn(
            "size-1.5 rounded-full",
            loading ? "bg-muted-foreground/40" : ok ? "bg-emerald-400" : "bg-red-400"
          )}
          aria-hidden
        />
        {etiket}
      </span>
      <span
        className={cn(
          "font-sans text-[1.25rem] leading-none font-semibold",
          loading && "opacity-40",
          !loading && !ok && "text-red-400"
        )}
      >
        {baslik}
      </span>
      <span className="text-[12px] text-muted-foreground">{alt}</span>
    </div>
  );
}
