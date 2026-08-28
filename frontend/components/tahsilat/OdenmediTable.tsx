"use client";

import { Typography } from "@heroui/react";

import type { TahsilatSatiri } from "@/hooks/useTahsilatRaporu";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface OdenmediTableProps {
  satirlar: TahsilatSatiri[];
  loading: boolean;
}

export function OdenmediTable({ satirlar, loading }: OdenmediTableProps) {
  const sirali = [...satirlar].sort((a, b) => b.tutar - a.tutar);

  return (
    <section className="border-b border-border">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Ödenmedi izleme
        </h2>
        <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">
          {sirali.length} belge
        </span>
      </header>
      <div
        className={cn(
          "max-h-[16rem] overflow-auto transition-opacity",
          loading && "opacity-40"
        )}
      >
        {sirali.length === 0 ? (
          <div className="px-3.5 py-8 text-center">
            <Typography.Paragraph size="sm" color="muted">
              Ödenmemiş çek/senet yok.
            </Typography.Paragraph>
          </div>
        ) : (
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b border-border text-muted-foreground">
                <th className="h-[var(--row-h-head)] px-3 text-[12px] font-medium tracking-[0.06em] uppercase">
                  Müşteri
                </th>
                <th className="h-[var(--row-h-head)] px-3 text-[12px] font-medium tracking-[0.06em] uppercase">
                  Tür
                </th>
                <th className="h-[var(--row-h-head)] px-3 text-[12px] font-medium tracking-[0.06em] uppercase">
                  Vade
                </th>
                <th className="h-[var(--row-h-head)] px-3 pr-3.5 text-right text-[12px] font-medium tracking-[0.06em] uppercase">
                  Tutar
                </th>
              </tr>
            </thead>
            <tbody>
              {sirali.map((s) => (
                <tr
                  key={s.belgeKod || `${s.musteriKod}-${s.vadeTarihi}`}
                  className="h-[var(--row-h)] border-b border-border/50"
                >
                  <td className="max-w-0 px-3 align-middle">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13.5px] text-foreground">
                        {s.musteriUnvan ?? s.musteriKod}
                      </span>
                      <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                        {s.belgeKod || s.cekNo || s.musteriKod}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 align-middle text-[13px] whitespace-nowrap text-muted-foreground">
                    {s.tahsilatTur ?? "—"}
                  </td>
                  <td className="px-3 align-middle font-mono text-[13px] whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatDate(s.vadeTarihi)}
                  </td>
                  <td className="px-3 pr-3.5 text-right align-middle font-mono text-[13.5px] whitespace-nowrap tabular-nums text-caution">
                    {formatCurrency(s.tutar)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
