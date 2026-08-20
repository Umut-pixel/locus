"use client";

import { useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, SearchIcon } from "lucide-react";
import { Typography } from "@heroui/react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import { Input } from "@/components/ui/input";
import type { RutSatiri } from "@/hooks/useSevkiyatRaporu";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { formatCurrency, formatKg, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortField =
  | "rutKod"
  | "musteriSayisi"
  | "toplamAgirlik"
  | "toplamTutar"
  | "ortalamaGecikmeGun";
interface Sort {
  field: SortField;
  dir: "asc" | "desc";
}
const VARSAYILAN_SORT: Sort = { field: "toplamTutar", dir: "desc" };

interface RutPerformansTablosuProps {
  satirlar: RutSatiri[];
  loading: boolean;
  error: string | null;
}

const TH_BASE =
  "h-[var(--row-h-head)] px-3 text-[12px] font-medium tracking-[0.06em] whitespace-nowrap uppercase";
const TD_BASE = "px-3 align-middle";
const COLUMN_COUNT = 5;

/** Rut bazlı performans — arama kendi içinde (StokFilters gibi ayrı bir bileşene gerek yok, tek kolon). */
export function RutPerformansTablosu({
  satirlar,
  loading,
  error,
}: RutPerformansTablosuProps) {
  const [arama, setArama] = useState("");
  const [sort, setSort] = useState<Sort>(VARSAYILAN_SORT);

  const gorunen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    const filtreli = q
      ? satirlar.filter((s) =>
          `${s.rutKod} ${s.rutAciklama ?? ""}`.toLocaleLowerCase("tr").includes(q)
        )
      : satirlar;

    const yon = sort.dir === "asc" ? 1 : -1;
    return [...filtreli].sort((a, b) => {
      if (sort.field === "rutKod") return a.rutKod.localeCompare(b.rutKod, "tr") * yon;
      const av = a[sort.field] ?? -1;
      const bv = b[sort.field] ?? -1;
      const fark = av - bv;
      return fark !== 0 ? fark * yon : a.rutKod.localeCompare(b.rutKod, "tr");
    });
  }, [satirlar, arama, sort]);

  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLDivElement, HTMLDivElement>(
    gorunen.length
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3.5 py-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Rut kodu veya açıklaması"
            aria-label="Rut ara"
            className="h-9 min-w-0 rounded-md pl-8 text-[13px] md:text-[13px]"
          />
        </div>
        <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground tabular-nums">
          {formatNumber(gorunen.length)} rut
        </span>
      </div>

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
                  alan="rutKod"
                  etiket="Rut"
                  sort={sort}
                  onSortChange={setSort}
                  className="w-full"
                />
                <SiralanabilirBaslik
                  alan="musteriSayisi"
                  etiket="Müşteri"
                  sort={sort}
                  onSortChange={setSort}
                  sayisal
                />
                <SiralanabilirBaslik
                  alan="toplamAgirlik"
                  etiket="Ağırlık"
                  sort={sort}
                  onSortChange={setSort}
                  sayisal
                />
                <SiralanabilirBaslik
                  alan="toplamTutar"
                  etiket="Tutar"
                  sort={sort}
                  onSortChange={setSort}
                  sayisal
                />
                <SiralanabilirBaslik
                  alan="ortalamaGecikmeGun"
                  etiket="Ort. gecikme"
                  sort={sort}
                  onSortChange={setSort}
                  sayisal
                  className="pr-3.5"
                />
              </tr>
            </thead>
            <tbody>
              {gorunen.map((s) => {
                const riskli = s.riskliMusteriSayisi > 0;
                return (
                  <tr
                    key={s.rutKod}
                    className="h-[var(--row-h)] border-b border-border/50"
                  >
                    <td className={cn(TD_BASE, "max-w-0")}>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[13.5px] text-foreground">
                          {s.rutKod}
                        </span>
                        <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                          {s.rutAciklama ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className={cn(TD_BASE, "text-right font-mono text-[13px] whitespace-nowrap tabular-nums")}>
                      <span
                        className={cn(
                          riskli ? "font-medium text-destructive" : "text-foreground"
                        )}
                        title={riskli ? `${s.riskliMusteriSayisi} riskli müşteri` : undefined}
                      >
                        {formatNumber(s.musteriSayisi)}
                      </span>
                    </td>
                    <td className={cn(TD_BASE, "text-right font-mono text-[13px] whitespace-nowrap text-muted-foreground tabular-nums")}>
                      {formatKg(s.toplamAgirlik)}
                    </td>
                    <td className={cn(TD_BASE, "text-right font-mono text-[13.5px] whitespace-nowrap text-foreground tabular-nums")}>
                      {formatCurrency(s.toplamTutar)}
                    </td>
                    <td className={cn(TD_BASE, "pr-3.5 text-right font-mono text-[13px] whitespace-nowrap tabular-nums", riskli ? "text-destructive" : "text-muted-foreground")}>
                      {s.ortalamaGecikmeGun != null ? `${s.ortalamaGecikmeGun} gün` : "—"}
                    </td>
                  </tr>
                );
              })}

              {!loading && gorunen.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-3 py-16 text-center align-middle">
                    <Typography.Heading level={6}>
                      {error ? "Veri yüklenemedi" : "Eşleşen rut yok"}
                    </Typography.Heading>
                    <Typography.Paragraph size="sm" color="muted" className="mt-1">
                      {error ?? "Arama terimini kısaltın."}
                    </Typography.Paragraph>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <ScrollBottomFade />
      </div>
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
  alan: SortField;
  etiket: string;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
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
