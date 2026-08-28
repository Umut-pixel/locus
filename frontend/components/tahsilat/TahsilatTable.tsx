"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Typography } from "@heroui/react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import type {
  TahsilatSatiri,
  TahsilatSort,
  TahsilatSortField,
} from "@/hooks/useTahsilatRaporu";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TahsilatTableProps {
  satirlar: TahsilatSatiri[];
  loading: boolean;
  error: string | null;
  sort: TahsilatSort;
  onSortChange: (sort: TahsilatSort) => void;
}

const TH_BASE =
  "h-[var(--row-h-head)] px-3 text-[12px] font-medium tracking-[0.06em] whitespace-nowrap uppercase";
const TD_BASE = "px-3 align-middle";
const COLUMN_COUNT = 6;

export function TahsilatTable({
  satirlar,
  loading,
  error,
  sort,
  onSortChange,
}: TahsilatTableProps) {
  const { wrapperRef, scrollRef } = useScrollBottomFade<
    HTMLDivElement,
    HTMLDivElement
  >(satirlar.length);

  return (
    <div ref={wrapperRef} className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-auto transition-opacity",
          loading && "opacity-40"
        )}
      >
        <table className="w-full min-w-[56rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-muted-foreground">
              <SiralanabilirBaslik
                alan="islemTarihi"
                etiket="Tarih"
                sort={sort}
                onSortChange={onSortChange}
                sayisal
              />
              <SiralanabilirBaslik
                alan="musteriUnvan"
                etiket="Müşteri"
                sort={sort}
                onSortChange={onSortChange}
                className="w-full"
              />
              <th scope="col" className={TH_BASE}>
                Tür
              </th>
              <SiralanabilirBaslik
                alan="tutar"
                etiket="Tutar"
                sort={sort}
                onSortChange={onSortChange}
                sayisal
              />
              <SiralanabilirBaslik
                alan="vadeTarihi"
                etiket="Vade"
                sort={sort}
                onSortChange={onSortChange}
                sayisal
              />
              <th scope="col" className={cn(TH_BASE, "pr-3.5")}>
                ST
              </th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s) => (
              <tr
                key={s.belgeKod || `${s.musteriKod}-${s.islemTarihi}-${s.tutar}`}
                className="h-[var(--row-h)] border-b border-border/50"
              >
                <td
                  className={cn(
                    TD_BASE,
                    "font-mono text-[13px] whitespace-nowrap tabular-nums text-muted-foreground"
                  )}
                >
                  {formatDate(s.islemTarihi)}
                </td>
                <td className={cn(TD_BASE, "max-w-0")}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13.5px] text-foreground">
                      {s.musteriUnvan ?? s.musteriKod}
                    </span>
                    <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                      {s.musteriKod}
                      {s.odemeDurum ? ` · ${s.odemeDurum}` : ""}
                    </span>
                  </div>
                </td>
                <td
                  className={cn(
                    TD_BASE,
                    "text-[13px] whitespace-nowrap text-muted-foreground"
                  )}
                >
                  {s.tahsilatTur ?? "—"}
                </td>
                <td
                  className={cn(
                    TD_BASE,
                    "text-right font-mono text-[13.5px] whitespace-nowrap tabular-nums",
                    s.odenmedi ? "text-amber-400" : "text-foreground"
                  )}
                >
                  {formatCurrency(s.tutar)}
                </td>
                <td
                  className={cn(
                    TD_BASE,
                    "text-right font-mono text-[13px] whitespace-nowrap tabular-nums text-muted-foreground"
                  )}
                >
                  {formatDate(s.vadeTarihi)}
                </td>
                <td
                  className={cn(
                    TD_BASE,
                    "pr-3.5 text-[13px] whitespace-nowrap text-muted-foreground"
                  )}
                >
                  {s.satisTemsilcisi ?? "—"}
                </td>
              </tr>
            ))}

            {!loading && satirlar.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMN_COUNT}
                  className="px-3 py-16 text-center align-middle"
                >
                  <Typography.Heading level={6}>
                    {error ? "Veri yüklenemedi" : "Eşleşen tahsilat yok"}
                  </Typography.Heading>
                  <Typography.Paragraph
                    size="sm"
                    color="muted"
                    className="mt-1"
                  >
                    {error ??
                      "Filtreleri gevşetin ya da arama terimini kısaltın."}
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
  alan: TahsilatSortField;
  etiket: string;
  sort: TahsilatSort;
  onSortChange: (sort: TahsilatSort) => void;
  sayisal?: boolean;
  className?: string;
}) {
  const aktif = sort.field === alan;
  const varsayilanYon = sayisal ? "desc" : "asc";

  return (
    <th
      scope="col"
      aria-sort={
        aktif ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
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
