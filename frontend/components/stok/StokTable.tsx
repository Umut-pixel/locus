"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Typography } from "@heroui/react";

import type {
  StokSatiri,
  StokSort,
  StokSortField,
} from "@/hooks/useStokRaporu";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StokTableProps {
  satirlar: StokSatiri[];
  loading: boolean;
  error: string | null;
  sort: StokSort;
  onSortChange: (sort: StokSort) => void;
}

const TH_BASE =
  "h-[var(--row-h-head)] px-3 text-[12px] font-medium tracking-[0.06em] whitespace-nowrap uppercase";
const TD_BASE = "px-3 align-middle";
const COLUMN_COUNT = 7;

/**
 * Envanter tablosu — aynı zamanda dağılım grafiğinin "tablo görünümü" ikizi:
 * grafikteki her değer burada da metin olarak okunabiliyor, hiçbir sayı
 * yalnızca renge/tooltip'e bağlı kalmıyor.
 */
export function StokTable({
  satirlar,
  loading,
  error,
  sort,
  onSortChange,
}: StokTableProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("min-h-0 flex-1 overflow-auto transition-opacity", loading && "opacity-40")}>
        <table className="w-full min-w-[52rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-muted-foreground">
              <SiralanabilirBaslik
                alan="urun"
                etiket="Ürün"
                sort={sort}
                onSortChange={onSortChange}
                className="w-full"
              />
              <th scope="col" className={TH_BASE}>
                Marka
              </th>
              <th scope="col" className={TH_BASE}>
                Kategori
              </th>
              <SiralanabilirBaslik
                alan="miktar"
                etiket="Miktar"
                sort={sort}
                onSortChange={onSortChange}
                sayisal
              />
              <SiralanabilirBaslik
                alan="fiyat"
                etiket="Birim fiyat"
                sort={sort}
                onSortChange={onSortChange}
                sayisal
              />
              <SiralanabilirBaslik
                alan="brutTutar"
                etiket="Stok değeri"
                sort={sort}
                onSortChange={onSortChange}
                sayisal
              />
              <th scope="col" className={cn(TH_BASE, "pr-3.5 text-right")}>
                KDV&apos;li
              </th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s) => {
              const tukendi = s.miktar <= 0;
              return (
                <tr
                  key={s.urunKodu}
                  className="h-[var(--row-h)] border-b border-border/50 transition-colors duration-100 hover:bg-muted/30"
                >
                  <td className={cn(TD_BASE, "max-w-0")}>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13.5px] text-foreground">
                        {s.urun}
                      </span>
                      <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                        {s.urunKodu}
                        {s.birim ? ` · ${s.birim}` : ""}
                      </span>
                    </div>
                  </td>
                  <td className={cn(TD_BASE, "text-[13px] whitespace-nowrap text-muted-foreground")}>
                    {s.marka ?? "—"}
                  </td>
                  <td className={cn(TD_BASE, "text-[13px] whitespace-nowrap text-muted-foreground")}>
                    {s.kategori ?? "—"}
                  </td>
                  <td className={cn(TD_BASE, "text-right whitespace-nowrap")}>
                    {/* Tükenmiş satır durum rengiyle işaretli + "Yok" metni: renk tek başına taşımıyor. */}
                    <span
                      className={cn(
                        "font-mono text-[13.5px] tabular-nums",
                        tukendi ? "font-medium text-destructive" : "text-foreground"
                      )}
                    >
                      {tukendi ? "Yok" : formatNumber(s.miktar)}
                    </span>
                  </td>
                  <td className={cn(TD_BASE, "text-right font-mono text-[13px] whitespace-nowrap text-muted-foreground tabular-nums")}>
                    {formatCurrency(s.fiyat)}
                  </td>
                  <td className={cn(TD_BASE, "text-right font-mono text-[13.5px] whitespace-nowrap text-foreground tabular-nums")}>
                    {formatCurrency(s.brutTutar)}
                  </td>
                  <td className={cn(TD_BASE, "pr-3.5 text-right font-mono text-[13px] whitespace-nowrap text-muted-foreground tabular-nums")}>
                    {formatCurrency(s.kdvliTutar)}
                  </td>
                </tr>
              );
            })}

            {!loading && satirlar.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-3 py-16 text-center align-middle">
                  <Typography.Heading level={6}>
                    {error ? "Veri yüklenemedi" : "Eşleşen ürün yok"}
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
  alan: StokSortField;
  etiket: string;
  sort: StokSort;
  onSortChange: (sort: StokSort) => void;
  sayisal?: boolean;
  className?: string;
}) {
  const aktif = sort.field === alan;
  // Sayısal kolonlar önce büyükten küçüğe, metin kolonu A→Z açılır.
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
