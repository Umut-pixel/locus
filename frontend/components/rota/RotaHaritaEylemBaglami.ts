"use client";

import { createContext, useContext } from "react";

import type { HaritaEylemiBlock } from "@/lib/agent-blocks";

export type HaritaEylemi = Omit<HaritaEylemiBlock, "type">;

/**
 * Rota haritası ekranındaki filtre/sekme/kamera durumunu AI'nın `harita_eylemi`
 * bloklarıyla yönlendirmesi için köprü. Yalnız `/rotalar/harita` sağlar; aynı
 * mesaj başka bir sayfada (ör. `/sohbet`) render edilirse `null` döner —
 * `useRotaPlaniBaglami`'nin aksine burada fırlatma yok, çünkü `AgentMarkdown`
 * jenerik ve provider'sız da kullanılabilir olmalı.
 */
const Baglam = createContext<((eylem: HaritaEylemi) => void) | null>(null);

export const RotaHaritaEylemSaglayici = Baglam.Provider;

export function useRotaHaritaEylemi(): ((eylem: HaritaEylemi) => void) | null {
  return useContext(Baglam);
}
