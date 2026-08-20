"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Typography } from "@heroui/react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import type { AcikFaturaSatiri } from "@/hooks/useFinansalRaporu";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { formatCurrency } from "@/lib/format";
import { borcOnemli } from "@/lib/risk-mode";
import { cn } from "@/lib/utils";

export type AcikFaturaSortField = "musteriAd" | "gun" | "kalanTutar";
export interface AcikFaturaSort {
  field: AcikFaturaSortField;
  dir: "asc" | "desc";
}
export const VARSAYILAN_ACIK_FATURA_SORT: AcikFaturaSort = {
  field: "kalanTutar",
  dir: "desc",
};

interface AcikFaturalarTableProps {
  satirlar: AcikFaturaSatiri[];
  loading: boolean;
  error: string | null;
  sort: AcikFaturaSort;
  onSortChange: (sort: AcikFaturaSort) => void;
}

const TH_BASE =
  "h-[var(--row-h-head)] px-3 text-[12px] font-medium tracking-[0.06em] whitespace-nowrap uppercase";
const TD_BASE = "px-3 align-middle";
const COLUMN_COUNT = 5;

/** Açık faturalar — satır bazlı, StokTable.tsx'in sıralanabilir tablo deseniyle aynı. */
export function AcikFaturalarTable({
  satirlar,
  loading,
  error,
  sort,
  onSortChange,
}: AcikFaturalarTableProps) {
  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLDivElement, HTMLDivElement>(
    satirlar.length
  );

  return (
    <div ref={wrapperRef} className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-auto transition-opacity",
          loading && "opacity-40"
        )}
      >
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-muted-foreground">
              <SiralanabilirBaslik
                alan="musteriAd"
                etiket="Müşteri"
                sort={sort}
                onSortChange={onSortChange}
                className="w-full"
              />
              <th scope="col" className={TH_BASE}>
                Belge
              </th>
              <th scope="col" className={TH_BASE}>
                Bant
              </th>
              <SiralanabilirBaslik
                alan="gun"
                etiket="Gün"
                sort={sort}
                onSortChange={onSortChange}
                sayisal
              />
              <SiralanabilirBaslik
                alan="kalanTutar"
                etiket="Kalan tutar"
                sort={sort}
                onSortChange={onSortChange}
                sayisal
                className="pr-3.5"
              />
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s) => {
              const riskli = s.gun >= 56 && borcOnemli(s.kalanTutar);
              return (
                <tr
                  key={`${s.musteriKod}-${s.belgeKod}`}
                  className="h-[var(--row-h)] border-b border-border/50"
                >
                  <td className={cn(TD_BASE, "max-w-0")}>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13.5px] text-foreground">
                        {s.musteriAd ?? s.musteriKod}
                      </span>
                      <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                        {s.musteriKod}
                        {s.temsilci ? ` · ${s.temsilci}` : ""}
                      </span>
                    </div>
                  </td>
                  <td className={cn(TD_BASE, "font-mono text-[12.5px] whitespace-nowrap text-muted-foreground")}>
                    {s.belgeKod}
                  </td>
                  <td className={cn(TD_BASE, "text-[13px] whitespace-nowrap text-muted-foreground")}>
                    {s.hafta}
                  </td>
                  <td className={cn(TD_BASE, "text-right font-mono text-[13px] whitespace-nowrap tabular-nums", riskli ? "text-destructive" : "text-muted-foreground")}>
                    {s.gun}
                  </td>
                  <td
                    className={cn(
                      TD_BASE,
                      "pr-3.5 text-right font-mono text-[13.5px] whitespace-nowrap tabular-nums",
                      riskli ? "font-medium text-destructive" : "text-foreground"
                    )}
                  >
                    {formatCurrency(s.kalanTutar)}
                  </td>
                </tr>
              );
            })}

            {!loading && satirlar.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-3 py-16 text-center align-middle">
                  <Typography.Heading level={6}>
                    {error ? "Veri yüklenemedi" : "Eşleşen açık fatura yok"}
                  </Typography.Heading>
                  <Typography.Paragraph size="sm" color="muted" className="mt-1">
                    {error ?? "Filtreleri gevşetin ya da arama terimini kısaltın."}
                  </Typography.Paragraph>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <ScrollBottomFade />
    </div>
  );
}

function SiralanabilirBaslik({
  alan,
  etiket,
  sort,
  onSortChange,
  sayisal = false,
  className,
}: {
  alan: AcikFaturaSortField;
  etiket: string;
  sort: AcikFaturaSort;
  onSortChange: (sort: AcikFaturaSort) => void;
  sayisal?: boolean;
  className?: string;
}) {
  const aktif = sort.field === alan;
  const varsayilanYon = sayisal ? "desc" : "asc";

  return (
    <th
      scope="col"
      aria-sort={aktif ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(TH_BASE, sayisal && "text-right", className)}
    >
      <button
        type="button"
        onClick={() =>
          onSortChange({
            field: alan,
            dir: aktif ? (sort.dir === "asc" ? "desc" : "asc") : varsayilanYon,
          })
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          sayisal && "flex-row-reverse",
          aktif && "text-foreground"
        )}
      >
        {etiket}
        {aktif ? (
          sort.dir === "asc" ? (
            <ArrowUpIcon className="size-3" aria-hidden />
          ) : (
            <ArrowDownIcon className="size-3" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );
}
