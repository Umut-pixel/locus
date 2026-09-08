"use client";

import type { BantDilimi } from "@/hooks/useFinansalRaporu";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BorcYaslandirmaDagilimiProps {
  bantlar: BantDilimi[];
  loading: boolean;
}

/** 56 gün ve üzeri bantlar — debtRiskDurumu ile aynı eşik (bkz. lib/risk-mode.ts). */
const RISKLI_BANT_KOLONLARI = new Set(["hf_56_62", "hf_63_69", "hf_70_ustu"]);

/**
 * 11 bantlık borç yaşlandırma dağılımı — Donut değil (5 dilim sınırı burada
 * uygun değil, bantlar sıralı bir eksen üzerinde okunmalı). Yatay bar,
 * en büyük banda göre ölçekli; 56+ gün bantları risk rengiyle vurgulanır.
 *
 * BOŞ BANT RİSK DEĞİLDİR. "63-69 gün ₺0" kırmızı yazılıyordu ve alarm gibi
 * okunuyordu; oysa o bantta açık fatura olmaması iyi haber. Risk rengi artık
 * yalnız tutarı olan bantlara uygulanıyor, sıfır bantlar soluk.
 *
 * Bant sıfırsa sebebini tooltip söylüyor: kaynakta (Panorama 5530) o vade
 * aralığında hiç açık fatura satırı yok. 2026-09-08 denetimi: `63 - 69` bandı
 * kaynak view'da HİÇ satır içermiyor — ayrıştırma hatası değil, gerçek sıfır.
 * Bant adı tanınmazsa senkron uyarısı `bilinmeyenHafta` ile ayrıca haber
 * veriyor (bkz. lib/sync/parse-yaslandirma-5530.ts), yani sessiz sıfır riski
 * ayrı bir kanaldan kapatılıyor.
 */
export function BorcYaslandirmaDagilimi({
  bantlar,
  loading,
}: BorcYaslandirmaDagilimiProps) {
  const enBuyuk = Math.max(1, ...bantlar.map((b) => b.tutar));
  const toplam = bantlar.reduce((a, b) => a + b.tutar, 0);

  return (
    <section className="flex min-w-0 flex-col lg:border-r lg:border-border">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Borç yaşlandırma dağılımı
        </h2>
        <span className="font-mono text-[12.5px] font-medium text-foreground tabular-nums">
          {formatCurrency(toplam)}
        </span>
      </header>

      <div
        className={cn(
          // `justify-center` + `overflow-y-auto` birlikte taşan içeriğin ÜST
          // ucunu erişilemez kılıyor — 11 bant sığmayınca ilk bant (01-06)
          // görünmez oluyordu. Hizalama başa alındı.
          "flex min-h-0 flex-1 flex-col justify-start gap-1.5 overflow-y-auto px-3.5 py-3 transition-opacity",
          loading && "opacity-40"
        )}
      >
        {bantlar.map((b, i) => {
          const bos = b.tutar <= 0;
          // Boş bant risk değil: kırmızı yalnız gerçekten para varken.
          const riskli = RISKLI_BANT_KOLONLARI.has(b.kolon) && !bos;
          const oran = b.tutar / enBuyuk;
          const cool = Math.round((1 - i / Math.max(1, bantlar.length - 1)) * 78 + 22);
          return (
            <div
              key={b.kolon}
              className="flex items-center gap-2.5"
              title={
                bos
                  ? `${b.label} gün: bu vade aralığında açık fatura yok.`
                  : `${b.label} gün gecikmiş açık bakiye: ${formatCurrency(b.tutar)}` +
                    (RISKLI_BANT_KOLONLARI.has(b.kolon) ? " — riskli bant (56+ gün)." : ".")
              }
            >
              <span className="w-16 shrink-0 text-[12px] text-muted-foreground">
                {b.label}
              </span>
              <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted/40">
                <div
                  className="h-full rounded-sm transition-[width] duration-500 ease-out"
                  style={{
                    width: `${Math.max(oran * 100, b.tutar > 0 ? 1.5 : 0)}%`,
                    backgroundColor: `color-mix(in oklab, var(--locus-blue) ${cool}%, var(--risk-bad))`,
                  }}
                />
              </div>
              <span
                className={cn(
                  "w-24 shrink-0 text-right font-mono text-[12.5px] tabular-nums",
                  bos
                    ? "text-muted-foreground/60"
                    : riskli
                      ? "text-[color:var(--risk-bad)]"
                      : "text-foreground"
                )}
              >
                {formatCurrency(b.tutar)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
