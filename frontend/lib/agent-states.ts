import type { OrbState } from "thinking-orbs";

/** UI fazı — chat + upload aktivitesine bağlanır. */
export type AgentPhase =
  | "idle"
  | "listening"
  | "shaping"
  | "solving"
  | "searching"
  | "composing"
  | "working";

/** DataImportFlow stage — asistan orb’unu sürükler. */
export type ImportActivity =
  | "idle"
  | "uploading"
  | "uploaded"
  | "matching"
  | "done"
  | "error";

export type AgentOrbConfig = {
  orbState: OrbState;
  label: string;
  speed: number;
  /** 0–1; header nefes / enerji animasyonu için */
  energy: number;
};

export const AGENT_ORB: Record<AgentPhase, AgentOrbConfig> = {
  idle: {
    orbState: "listening",
    label: "Hazır",
    speed: 0.55,
    energy: 0.25,
  },
  listening: {
    orbState: "listening",
    label: "Dinliyor…",
    speed: 1,
    energy: 0.4,
  },
  shaping: {
    orbState: "shaping",
    label: "Haritayı analiz ediyor…",
    speed: 1.35,
    energy: 0.7,
  },
  solving: {
    orbState: "solving",
    label: "Haritayı analiz ediyor…",
    speed: 1.15,
    energy: 0.75,
  },
  searching: {
    orbState: "searching",
    label: "Düşünüyor…",
    speed: 1.2,
    energy: 0.8,
  },
  composing: {
    orbState: "composing",
    label: "Yanıtlıyor…",
    speed: 1.35,
    energy: 0.65,
  },
  working: {
    orbState: "working",
    label: "Haritayı analiz ediyor…",
    speed: 1.5,
    energy: 0.85,
  },
};

export function importActivityToPhase(
  activity: ImportActivity | null | undefined
): AgentPhase | null {
  if (!activity || activity === "idle") return null;
  if (activity === "uploading" || activity === "uploaded") return "shaping";
  if (activity === "matching") return "solving";
  if (activity === "done") return "solving";
  if (activity === "error") return "idle";
  return null;
}

/** Excel parse sonrası statik analiz metni (yarın veriye bağlanacak). */
export const DEMO_ANALYSIS =
  "1.204 müşteri haritada görünüyor. İzmir yoğunluğu öne çıkıyor; 47 riskli nokta rota odaklı kontrol istiyor. Manisa–Aydın koridorunda teslimat boşluğu belirgin.";

/**
 * Düşünce akışı havuzu — Türkçe eğlenceli “AI mırıldanmaları”
 * (shimmering / fumbling / noodling / rumbling ruhu).
 * Her seferinde rastgele bir alt küme seçilir.
 */
export const DEMO_THOUGHTS = [
  "Işıl ışıl haritayı tarıyorum…",
  "Didik didik filtreleri kurcalıyorum…",
  "Fıldır fıldır rota düğümlerine bakıyorum…",
  "Fısıl fısıl riskleri yokluyorum…",
  "Kıvıl kıvıl yoğunlukları tartıyorum…",
  "Pıt pıt noktaları eşleştiriyorum…",
  "Mırıl mırıl şehirleri geziyorum…",
  "Şıpır şıpır veriyi döküyorum…",
  "Tıklım tıklım kümeleri yokluyorum…",
  "Hışır hışır satırları eleyorum…",
  "Gıcır gıcır koordinatları oturtuyorum…",
  "Fısıl fısıl mahalleleri yokluyorum…",
  "Zırıl zırıl riskleri sıralıyorum…",
  "Kıpır kıpır rotayı örüyorum…",
  "Fıldır fıldır müşteri kodlarını tarıyorum…",
  "Işıl ışıl teslimat izlerini süzüyorum…",
  "Didik didik boşlukları arıyorum…",
  "Mırıldanarak harita katmanlarını karıştırıyorum…",
];

const THOUGHT_PICK_COUNT = 5;

/** Her çağrıda farklı, karışık bir düşünce dizisi. */
export function pickThoughtSequence(
  count = THOUGHT_PICK_COUNT
): string[] {
  const pool = [...DEMO_THOUGHTS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/** Fly-out / fly-in süreleri (ms) — CSS ile uyumlu (~%20 daha yavaş). */
export const THOUGHT_FLY_MS = 460;
export const THOUGHT_HOLD_MS = 1140;
