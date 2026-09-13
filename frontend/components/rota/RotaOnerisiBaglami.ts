"use client";

import { createContext, useContext } from "react";

import type { RotaOnerisiBlock, RotaOnerisiEylemi } from "@/lib/agent-blocks";

/**
 * Tek bir önerilen adımın ÇÖZÜLMÜŞ hâli — model yalnız görünen adları
 * verdiği için (bkz. `RotaHaritaEylemBaglami`'ndeki aynı ilke) `sayfa`
 * bunları dahili koda çözer. `ok: false` ise ekranda öyle bir kayıt yok —
 * kart bunu "Uygula" düğmesini devre dışı bırakarak gösterir, sessiz no-op
 * YOK (bu bir veri mutasyonu, `harita_eylemi`'nin aksine).
 */
export type RotaOnerisiAdimCozum =
  | {
      ok: true;
      eylem: "durak_tasi";
      musteriKodu: string;
      durakEtiket: string;
      hedefAracKod: string;
      hedefAracEtiket: string;
      pozisyon?: number;
      dolulukOncesi: number;
      dolulukSonrasi: number;
    }
  | { ok: true; eylem: "durak_havuza_al"; musteriKodu: string; durakEtiket: string }
  | { ok: true; eylem: "araci_optimize_et"; hedefAracKod: string; hedefAracEtiket: string }
  | { ok: false; eylem: RotaOnerisiEylemi; hata: string };

export type RotaOnerisiUygulamaSonucu = {
  ok: boolean;
  mesaj: string;
  /** Uygulamadan hemen sonra kısa süre geçerli — yalnız AI-önerisi geri alma
   * akışı için, genel bir undo/redo değil. */
  geriAl?: () => void;
};

export interface RotaOnerisiBaglamDegeri {
  /** Bloktaki isimleri çözer, HİÇBİR ŞEYE dokunmaz — kartın önizlemesi için. */
  cozumle: (block: RotaOnerisiBlock) => RotaOnerisiAdimCozum[];
  /** Çözülmüş adımları canlı taslağa uygular. Çağıran taraf (kart) tüm
   * adımların `ok: true` olduğunu önceden garanti etmeli. */
  uygula: (cozumler: RotaOnerisiAdimCozum[]) => RotaOnerisiUygulamaSonucu;
}

const Baglam = createContext<RotaOnerisiBaglamDegeri | null>(null);

export const RotaOnerisiSaglayici = Baglam.Provider;

/**
 * `rota_onerisi` bloğunun canlı taslağa gerçekten uygulanabilmesi için köprü.
 * `RotaHaritaEylemBaglami` ile aynı ilke (yalnız `/rotalar/harita` sağlar,
 * başka sayfada `null` döner, `AgentMarkdown` jenerik kalsın diye fırlatma
 * yok) — ama bu köprü salt-okunur navigasyon değil, VERİ MUTASYONU taşıyor.
 */
export function useRotaOnerisiBaglami(): RotaOnerisiBaglamDegeri | null {
  return useContext(Baglam);
}
