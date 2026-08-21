"use client";

import { cn } from "@/lib/utils";

export type OperasyonPaneli = "bekleyen" | "riskli";

interface PanelGecisiProps {
  aktif: OperasyonPaneli;
  onChange: (panel: OperasyonPaneli) => void;
}

const SECENEKLER: { deger: OperasyonPaneli; etiket: string; baslik: string }[] = [
  {
    deger: "bekleyen",
    etiket: "Bekleyen",
    baslik: "Henüz faturalaşmamış siparişler (Sipariş Durum Raporu)",
  },
  {
    deger: "riskli",
    etiket: "Riskli",
    baslik: "90+ gündür teslimat almamış müşteriler",
  },
];

/**
 * Tek panelde iki veri kümesi arasında geçiş — StokDagilim'in marka/kategori
 * kontrolüyle aynı segmented desen, aynı ölçüler.
 */
export function PanelGecisi({ aktif, onChange }: PanelGecisiProps) {
  return (
    <div
      role="group"
      aria-label="Panel içeriği"
      className="flex items-center gap-0.5 rounded-md bg-secondary/60 p-0.5"
    >
      {SECENEKLER.map((s) => (
        <button
          key={s.deger}
          type="button"
          onClick={() => onChange(s.deger)}
          aria-pressed={aktif === s.deger}
          title={s.baslik}
          className={cn(
            "h-6 rounded-[5px] px-2 text-[12px] font-medium transition-colors",
            aktif === s.deger
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {s.etiket}
        </button>
      ))}
    </div>
  );
}
