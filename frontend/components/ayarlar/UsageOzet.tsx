"use client";

import {
  CoinsIcon,
  DatabaseIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useCountUp } from "@/hooks/useCountUp";
import type { UsageOzet } from "@/lib/anthropic-usage";
import {
  formatAgentModel,
  formatCompactToken,
  formatNumber,
  formatUsd,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function yuzde(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`;
}

function gunEtiket(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

export function UsageOzetSerit({ ozet, loading }: { ozet: UsageOzet; loading: boolean }) {
  const maliyet = useCountUp(ozet.maliyetUsd);
  const input = useCountUp(ozet.uncachedInput + ozet.cacheRead + ozet.cacheCreate);
  const output = useCountUp(ozet.output);

  return (
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
      <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
        <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
          Maliyet
        </span>
        <span
          className={cn(
            "font-sans text-[2rem] leading-none font-semibold text-foreground transition-opacity",
            loading && "opacity-40"
          )}
        >
          {formatUsd(maliyet)}
        </span>
        <span className="text-[12px] text-muted-foreground">
          Son {ozet.gunAraligi} gün · USD
        </span>
      </div>
      <StatKutusu
        icon={DatabaseIcon}
        etiket="Girdi"
        deger={formatCompactToken(input)}
        altBilgi={`${formatCompactToken(ozet.cacheRead)} önbellekten`}
        loading={loading}
      />
      <StatKutusu
        icon={SparklesIcon}
        etiket="Çıktı"
        deger={formatCompactToken(output)}
        altBilgi={`${formatNumber(ozet.webSearch)} web araması`}
        loading={loading}
      />
      <StatKutusu
        icon={CoinsIcon}
        etiket="Önbellek isabeti"
        deger={yuzde(ozet.cacheIsabet)}
        altBilgi="cache read / tüm girdi"
        loading={loading}
      />
    </div>
  );
}

function StatKutusu({
  icon: Icon,
  etiket,
  deger,
  altBilgi,
  loading,
}: {
  icon: LucideIcon;
  etiket: string;
  deger: string;
  altBilgi: string;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
      <span className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
        <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
        {etiket}
      </span>
      <span
        className={cn(
          "font-sans text-[2rem] leading-none font-semibold text-foreground transition-opacity",
          loading && "opacity-40"
        )}
      >
        {deger}
      </span>
      <span className="text-[12px] text-muted-foreground">{altBilgi}</span>
    </div>
  );
}

export function UsageGunCubugu({ ozet }: { ozet: UsageOzet }) {
  if (ozet.gunler.length === 0) return null;
  const maliyetVar = ozet.gunler.some((g) => g.maliyetUsd > 0);
  const degerler = ozet.gunler.map((g) =>
    maliyetVar ? g.maliyetUsd : tokenToplam(g)
  );
  const max = Math.max(...degerler, 0.01);
  return (
    <div className="border-b border-border px-3.5 py-4">
      <p className="mb-3 text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
        {maliyetVar ? "Günlük maliyet" : "Günlük token"}
      </p>
      <div className="flex h-28 items-end gap-1">
        {ozet.gunler.map((g, i) => {
          const h = Math.max(4, Math.round((degerler[i]! / max) * 100));
          return (
            <div key={g.gun} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="w-full max-w-7 rounded-sm bg-foreground/80"
                style={{ height: `${h}%` }}
                title={`${gunEtiket(g.gun)} · ${formatUsd(g.maliyetUsd)}`}
              />
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {gunEtiket(g.gun)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function tokenToplam(g: { uncachedInput: number; cacheRead: number; cacheCreate: number; output: number }) {
  return g.uncachedInput + g.cacheRead + g.cacheCreate + g.output;
}

export function UsageTablolar({ ozet }: { ozet: UsageOzet }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-auto bg-border lg:grid-cols-2">
      <section className="bg-background">
        <h2 className="border-b border-border px-3.5 py-2.5 text-[13px] font-medium">
          Modele göre
        </h2>
        {ozet.modeller.length === 0 ? (
          <p className="px-3.5 py-6 text-[13px] text-muted-foreground">Bu aralıkta kullanım yok.</p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr className="border-b border-border">
                <th className="px-3.5 py-2 font-medium">Model</th>
                <th className="px-3.5 py-2 text-right font-medium">Girdi</th>
                <th className="px-3.5 py-2 text-right font-medium">Çıktı</th>
                <th className="px-3.5 py-2 text-right font-medium">Maliyet</th>
              </tr>
            </thead>
            <tbody>
              {ozet.modeller.map((m) => (
                <tr key={m.model} className="border-b border-border/70">
                  <td className="px-3.5 py-2 font-medium">
                    {formatAgentModel(m.model) || m.model}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {formatCompactToken(m.uncachedInput + m.cacheRead + m.cacheCreate)}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {formatCompactToken(m.output)}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                    {formatUsd(m.maliyetUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="bg-background">
        <h2 className="border-b border-border px-3.5 py-2.5 text-[13px] font-medium">
          Kalemler
        </h2>
        {ozet.kalemler.length === 0 ? (
          <p className="px-3.5 py-6 text-[13px] text-muted-foreground">Maliyet kalemi yok.</p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr className="border-b border-border">
                <th className="px-3.5 py-2 font-medium">Açıklama</th>
                <th className="px-3.5 py-2 text-right font-medium">USD</th>
              </tr>
            </thead>
            <tbody>
              {ozet.kalemler.map((k) => (
                <tr key={k.aciklama} className="border-b border-border/70">
                  <td className="px-3.5 py-2">
                    <span className="block truncate">{k.aciklama}</span>
                    {k.model ? (
                      <span className="text-[11px] text-muted-foreground">
                        {formatAgentModel(k.model) || k.model}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                    {formatUsd(k.maliyetUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export function UsageYenile({
  loading,
  onYenile,
}: {
  loading: boolean;
  onYenile: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onYenile}
      disabled={loading}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12.5px] font-medium outline-none hover:bg-muted disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
      Yenile
    </button>
  );
}
