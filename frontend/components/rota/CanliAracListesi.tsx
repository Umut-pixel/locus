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

/**
 * Grup içi sıra: hareket edenler önce, bayatlar sona.
 * "Şu an yolda olan kim" en sık sorulan soru.
 */
function sirala(a: CanliAracKonumu, b: CanliAracKonumu): number {
  if (a.hareket !== b.hareket) return a.hareket ? -1 : 1;
  if (a.bayat !== b.bayat) return a.bayat ? 1 : -1;
  return a.plaka.localeCompare(b.plaka, "tr");
}

function GrupBasligi({ metin, adet }: { metin: string; adet: number }) {
  return (
    <li className="flex items-center gap-2 bg-muted/25 px-2.5 py-1">
      <span className="text-[10px] font-medium tracking-[0.07em] text-muted-foreground uppercase">
        {metin}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
        {adet}
      </span>
    </li>
  );
}

function AracSatiri({
  konum: k,
  odakli,
  onOdaklan,
}: {
  konum: CanliAracKonumu;
  odakli: boolean;
  onOdaklan: (konum: CanliAracKonumu) => void;
}) {
  const baslik = k.aracAdi ?? k.plaka;
  const durum = k.bayat
    ? "Son bilinen konum"
    : k.hareket
      ? `${k.hizKmh != null ? Math.round(k.hizKmh) : "?"} km/s`
      : "Duruyor";

  return (
    <li>
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
            {durum} · {yasMetni(yasSaniye(k))} önce
            {k.adres ? ` · ${k.adres}` : ""}
          </span>
        </span>
      </button>
    </li>
  );
}

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

  /*
   * İki grup: önce sevkiyat araçları, sonra şahıs araçları.
   *
   * Şahıs araçları listeden ÇIKARILMIYOR — Arvento onları da bildiriyor ve
   * haritada görünüyorlar; listede olmasalar "haritadaki bu gri nokta da ne"
   * sorusu cevapsız kalırdı. Ama karar verirken önce bizim araçlarımız gelmeli.
   *
   * Sevkiyat ayrımının kaynağı `arvento_araclar.sevkiyat` — araç sınıfı değil
   * (35ASM899 sevkiyat aracı ama OTOMOBIL sınıfında).
   */
  const sevkiyat = konumlar.filter((k) => k.sevkiyat).sort(sirala);
  const sahis = konumlar.filter((k) => !k.sevkiyat).sort(sirala);

  // Tek grup varsa başlık gereksiz gürültü.
  const gruplu = sevkiyat.length > 0 && sahis.length > 0;

  const satir = (k: CanliAracKonumu) => (
    <AracSatiri
      key={k.node}
      konum={k}
      odakli={odakliNode === k.node}
      onOdaklan={onOdaklan}
    />
  );

  return (
    <ul className="divide-y divide-border/30">
      {gruplu ? (
        <>
          <GrupBasligi metin="Sevkiyat" adet={sevkiyat.length} />
          {sevkiyat.map(satir)}
          <GrupBasligi metin="Şahıs araçları" adet={sahis.length} />
          {sahis.map(satir)}
        </>
      ) : (
        [...sevkiyat, ...sahis].map(satir)
      )}
    </ul>
  );
}
