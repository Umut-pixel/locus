"use client";

/**
 * Canlı araç listesi — "araçlarım nerede" sorusunun haritayı kalabalıklaştırmayan cevabı.
 *
 * Neden gerekli: 2026-09-14'te ölçüldü — filonun çoğu depoda park hâlinde
 * duruyor ve hepsi aynı koordinatı bildiriyor, ayrıca kamera rota planına göre
 * kuruluyor. Sonuç: 8 araçtan 4'ü deponun dibinde 2 piksel içinde üst üste,
 * 3'ü kadrajın tamamen dışında kalıyordu. Haritada imleç vardı ama araç
 * "görünmüyordu".
 *
 * Bu liste aracı adıyla/plakasıyla bulunabilir kılar; tıklayınca harita o
 * araca uçar (`onOdaklan`). Yaş saniyesi saniye saniye tiklemez — 15 saniyede
 * bir tazelenir, çünkü veri zaten dakikada bir geliyor.
 */

import { useEffect, useState } from "react";
import { NavigationIcon, SatelliteDishIcon } from "lucide-react";

import {
  yasMetni,
  yasSaniye,
  type CanliAracKonumu,
} from "@/lib/rota/canli-konum";
import { cn } from "@/lib/utils";

interface CanliAracListesiProps {
  konumlar: CanliAracKonumu[];
  yukleniyor: boolean;
  /** Araca tıklanınca haritanın uçacağı nokta. */
  onOdaklan: (konum: CanliAracKonumu) => void;
  /** Şu an odaklanılmış aracın node'u — listede işaretlensin. */
  odakliNode?: string | null;
}

/** Yaş metni bu aralıkta tazelenir. Veri dakikada bir geliyor, daha sık anlamsız. */
const TAZELEME_MS = 15_000;

export function CanliAracListesi({
  konumlar,
  yukleniyor,
  onOdaklan,
  odakliNode,
}: CanliAracListesiProps) {
  // Yalnız "X dk önce" metnini yeniden hesaplatmak için — veri değişmiyor.
  const [, tikle] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tikle((n) => n + 1), TAZELEME_MS);
    return () => clearInterval(t);
  }, []);

  if (konumlar.length === 0) {
    return (
      <p className="flex items-start gap-2 px-2.5 py-3 text-[12px] text-muted-foreground">
        <SatelliteDishIcon className="mt-px size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span>
          {yukleniyor
            ? "Araç konumları yükleniyor…"
            : "Canlı araç konumu yok. n8n'deki Arvento workflow'u çalışmıyor ya da filo senkronu hiç yapılmamış olabilir."}
        </span>
      </p>
    );
  }

  // Hareket edenler üstte: "şu an yolda olan kim" en sık sorulan soru.
  const sirali = [...konumlar].sort((a, b) => {
    if (a.hareket !== b.hareket) return a.hareket ? -1 : 1;
    if (a.bayat !== b.bayat) return a.bayat ? 1 : -1;
    return a.plaka.localeCompare(b.plaka, "tr");
  });

  return (
    <ul className="divide-y divide-border/30">
      {sirali.map((k) => {
        const odakli = odakliNode === k.node;
        const baslik = k.aracAdi ?? k.plaka;
        const yas = yasMetni(yasSaniye(k));
        const durum = k.bayat
          ? "Son bilinen konum"
          : k.hareket
            ? `${k.hizKmh != null ? Math.round(k.hizKmh) : "?"} km/s`
            : "Duruyor";

        return (
          <li key={k.node}>
            <button
              type="button"
              onClick={() => onOdaklan(k)}
              aria-pressed={odakli}
              title={`${baslik} — haritada göster`}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left transition-colors",
                odakli ? "bg-accent/50" : "hover:bg-accent/30"
              )}
            >
              {/*
                Hareket halindeki araçta dönen ok, duranda sabit nokta.
                Bayat olan soluk — "şu anki yeri değil" demenin en sessiz yolu.
              */}
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center",
                  k.bayat
                    ? "text-caution"
                    : k.hareket
                      ? "text-foreground"
                      : "text-muted-foreground"
                )}
                aria-hidden
              >
                {k.hareket && k.yonDerece != null ? (
                  <NavigationIcon
                    className="size-3.5"
                    strokeWidth={2}
                    style={{ transform: `rotate(${k.yonDerece.toFixed(0)}deg)` }}
                  />
                ) : (
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      k.bayat ? "bg-caution" : "bg-muted-foreground"
                    )}
                  />
                )}
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12.5px] font-medium text-foreground">
                  {baslik}
                  {k.aracAdi ? (
                    <span className="ml-1.5 font-mono text-[10.5px] font-normal text-muted-foreground">
                      {k.plaka}
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {durum} · {yas} önce
                  {k.adres ? ` · ${k.adres}` : ""}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
