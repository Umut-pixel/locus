"use client";

import { SegmentedSwitch } from "@/components/ui/segmented-switch";

export type OperasyonPaneli = "bekleyen" | "riskli";

interface PanelGecisiProps {
  aktif: OperasyonPaneli;
  onChange: (panel: OperasyonPaneli) => void;
}

const SECENEKLER = [
  {
    value: "bekleyen" as const,
    label: "Bekleyen",
    title: "Henüz faturalaşmamış siparişler (Sipariş Durum Raporu)",
  },
  {
    value: "riskli" as const,
    label: "Riskli",
    title: "90+ gündür teslimat almamış müşteriler",
  },
];

export function PanelGecisi({ aktif, onChange }: PanelGecisiProps) {
  return (
    <SegmentedSwitch
      value={aktif}
      onChange={onChange}
      options={SECENEKLER}
      ariaLabel="Panel içeriği"
    />
  );
}
