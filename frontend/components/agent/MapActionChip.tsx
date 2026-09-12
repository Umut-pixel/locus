"use client";

import { memo, useEffect, useRef } from "react";

import { useRotaHaritaEylemi } from "@/components/rota/RotaHaritaEylemBaglami";
import type { HaritaEylemiBlock } from "@/lib/agent-blocks";

const SEKME_ADI: Record<string, string> = {
  araclar: "Araçlar",
  bolgeler: "Bölgeler",
  kaydedilenler: "Kayıtlı",
};

const KRITER_ADI: Record<string, string> = {
  sure: "Süre",
  maliyet: "Maliyet",
  esneklik: "Esneklik",
  yukRiski: "Yük riski",
  guvenilirlik: "Güvenilirlik",
  surusGuvenligi: "Sürüş güvenliği",
  sahaZorlugu: "Saha zorluğu",
};

function etiketUret(block: HaritaEylemiBlock): string | null {
  switch (block.eylem) {
    case "bolgeyi_filtrele":
      return block.sorgu ? `${block.sorgu} bölgesine odaklanıldı` : null;
    case "araci_filtrele":
      return block.sorgu ? `${block.sorgu} filtrelendi` : null;
    case "sekmeyi_degistir":
      return block.sekme ? `${SEKME_ADI[block.sekme]} sekmesine geçildi` : null;
    case "karneyi_vurgula":
      return block.anahtar
        ? `${KRITER_ADI[block.anahtar] ?? block.anahtar} vurgulandı`
        : null;
    case "filtreyi_temizle":
      return "Filtre temizlendi";
  }
}

/**
 * `harita_eylemi` bloğunun görünen karşılığı — yalnız `/rotalar/harita`da
 * gerçek bir etkisi var (bkz. `RotaHaritaEylemBaglami`). Başka bir sayfada
 * (`/sohbet`, `/home`) aynı mesaj yeniden render edilirse context `null`
 * gelir, bileşen sessizce hiçbir şey yapmaz/göstermez.
 */
export const MapActionChip = memo(function MapActionChip({
  block,
}: {
  block: HaritaEylemiBlock;
}) {
  const uygula = useRotaHaritaEylemi();
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!uygula || appliedRef.current) return;
    appliedRef.current = true;
    uygula({
      eylem: block.eylem,
      sorgu: block.sorgu,
      sekme: block.sekme,
      anahtar: block.anahtar,
    });
    // Yalnız mount'ta bir kez uygulanır — streaming sırasında blok yeniden
    // ayrıştırılıp aynı bileşen aynı `key` ile yeniden render edilse bile
    // (bkz. AgentMarkdown), `appliedRef` ikinci bir uygulamayı engeller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uygula]);

  if (!uygula) return null;
  const etiket = etiketUret(block);
  if (!etiket) return null;

  return <p className="mb-3 text-[12px] text-ink-3 last:mb-0">↳ {etiket}</p>;
});
