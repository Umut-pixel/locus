"use client";

import { useId } from "react";
import { SearchIcon, XIcon } from "lucide-react";

import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PanelAramaSatiriProps {
  deger: string;
  onDegisim: (deger: string) => void;
  /** Filtre sonrası kalan satır sayısı. */
  gorunen: number;
  /** Filtre öncesi toplam. */
  toplam: number;
  placeholder: string;
  /** Erişilebilirlik etiketi — panel adıyla ("Bekleyen siparişlerde ara"). */
  etiket: string;
  className?: string;
}

/**
 * Panel içi arama satırı — başlığın hemen altında, `h-9`.
 *
 * Neden başlığın İÇİNE değil altına: panel sütunu dar (lg'de 1/3) ve
 * "Bekleyen siparişler" başlığı zaten ikon + sayaç + bekleyen↔riskli
 * anahtarını taşıyor; oraya bir input daha sıkıştırmak üçünü de kırpardı.
 * Satır, `BekleyenSiparislerPanel`'deki "Brüt tutar" şeridiyle aynı ölçüde
 * (h-9 / border-b / px-3.5) — iki şerit üst üste gelince tek bir blok gibi
 * okunuyor.
 *
 * Eşleşme sayacı bilerek var: liste kaydırmalı ve kısa, "hiç sonuç yok" ile
 * "sonuçlar aşağıda" ayrımı yoksa kullanıcı boş panele bakıp aramanın
 * bozuk olduğunu sanıyor.
 */
export function PanelAramaSatiri({
  deger,
  onDegisim,
  gorunen,
  toplam,
  placeholder,
  etiket,
  className,
}: PanelAramaSatiriProps) {
  const id = useId();
  const aktif = deger.trim().length > 0;
  const sonucYok = aktif && gorunen === 0;

  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3.5",
        className
      )}
    >
      <SearchIcon
        className={cn(
          "size-3.5 shrink-0 transition-colors",
          sonucYok ? "text-caution" : "text-muted-foreground"
        )}
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        id={id}
        type="search"
        value={deger}
        onChange={(e) => onDegisim(e.target.value)}
        onKeyDown={(e) => {
          // Escape ile temizle — fare hedefi küçük, listede gezerken hızlı çıkış.
          if (e.key === "Escape" && aktif) {
            e.stopPropagation();
            onDegisim("");
          }
        }}
        placeholder={placeholder}
        aria-label={etiket}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none",
          "placeholder:text-muted-foreground",
          // Tarayıcının yerleşik temizleme çarpısı — kendi düğmemiz var.
          "[&::-webkit-search-cancel-button]:appearance-none"
        )}
      />

      {aktif ? (
        <>
          <span
            className={cn(
              "shrink-0 font-mono text-[11.5px] tabular-nums",
              sonucYok ? "text-caution" : "text-muted-foreground"
            )}
            aria-live="polite"
          >
            {sonucYok ? "eşleşme yok" : `${formatNumber(gorunen)}/${formatNumber(toplam)}`}
          </span>
          <button
            type="button"
            onClick={() => onDegisim("")}
            aria-label="Aramayı temizle"
            title="Aramayı temizle (Esc)"
            className="-mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
}
