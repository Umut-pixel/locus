"use client";

import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SparklesIcon, XIcon } from "lucide-react";

import { AgentAssistant } from "@/components/agent/AgentAssistant";
import FluidOrb from "@/components/ui/fluid-orb";
import { useAgentSession } from "@/hooks/useAgentSession";
import { rotaAgentBaglamiUret, type RotaAgentBaglamGirdisi } from "@/lib/rota/agentBaglami";
import { cn } from "@/lib/utils";

/** Bağlam turdan tura değişmediğinde tam metin yerine bu kısa işaretçi gider —
 * modelin "not yoksa ekrandan ayrılmış" varsayımını bozmadan token tasarrufu.
 * `agent/instructions.md` bunu "önceki turdaki notu aynen kullan" diye okur. */
const BAGLAM_DEGISMEDI_NOTU = "[Rota haritası ekranı — durum önceki mesajla aynı]";

/** `harita/page.tsx`'teki `CAM` ile aynı border/blur/shadow dili — ama zemin
 * kasıtlı farklı: sohbet paneli haritanın rengini taşımasın diye saturasyon
 * düşürüldü, opaklık artırıldı (açıkta beyaz/gri, koyuda siyah/gri zemin). */
const CAM =
  "border border-border/45 bg-popover/78 text-popover-foreground " +
  "shadow-[0_14px_40px_-16px_rgba(0,0,0,0.55)] backdrop-blur-[24px] backdrop-saturate-50";

/** Locus mavi ailesinden (`--locus-blue-deep`) — orb rengi WebGL uniform'a JS
 * tarafında çevrildiği için CSS değişkeni okuyamıyor, literal senkron kopya. */
const ORB_COLOR = "#005670";

interface RotaHaritaAiBubbleProps {
  /** Sayfanın o anki durumu — modele "ekranda ne var, ne değişti" bağlamı için. */
  baglamGirdisi: RotaAgentBaglamGirdisi;
  /** Sağ altta yüzen plan karnesi/optimize kartının üst kenarı (viewport Y,
   * px) — verilirse panel bu sınırı GAP kadar boşluk bırakarak aşmaz. */
  altSinirY?: number | null;
}

/** `top-3`/`sm:top-4` ile senkron kalmalı — panelin kendi üst konumu. */
const TOP_OFFSET_PX = 16;
/** Panel altıyla plan karnesi üstü arasında istenen minimum boşluk. */
const ALT_BOSLUK_PX = 12;
const PANEL_MIN_H_PX = 288; // 18rem — dar viewport'ta bile kullanılabilir taban
const PANEL_MAX_H_PX = 512; // 32rem — mevcut tavanla aynı

/**
 * Rota haritasının sağ üst köşesinde duran AI komut balonu. Kapalıyken küçük
 * yuvarlak bir düğme; tıklanınca aynı öğe (motion `layout`) panele büyür.
 * İçerik `AgentAssistant` — ayrı bir chat mekanizması DEĞİL, uygulamanın tek
 * paylaşımlı sohbet oturumunun (`useAgentSession`) bir başka görünümü.
 */
export const RotaHaritaAiBubble = memo(function RotaHaritaAiBubble({
  baglamGirdisi,
  altSinirY,
}: RotaHaritaAiBubbleProps) {
  const [open, setOpen] = useState(false);
  const [okunmadi, setOkunmadi] = useState(false);
  const { busy } = useAgentSession();
  const reduced = useReducedMotion();
  const wasBusyRef = useRef(false);
  /** Son gönderilen TAM bağlam metni — turdan tura birebir aynıysa tekrar
   * göndermeyip kısa bir işaretçiyle yetinmek için (token tasarrufu). */
  const sonBaglamRef = useRef<string | null>(null);

  // Panel kapalıyken bir yanıt tamamlanırsa küçük bir rozetle haber ver —
  // AgentFollowCard bu sayfada bastırıldığı için o sinyali artık balon veriyor.
  useEffect(() => {
    if (wasBusyRef.current && !busy && !open) setOkunmadi(true);
    wasBusyRef.current = busy;
  }, [busy, open]);

  const buildContext = () => {
    const tamMetin = rotaAgentBaglamiUret(baglamGirdisi);
    if (tamMetin === sonBaglamRef.current) return BAGLAM_DEGISMEDI_NOTU;
    sonBaglamRef.current = tamMetin;
    return tamMetin;
  };

  // Dış kutu (baloncuk ⇄ panel) spring'i ~0.4s'de yerleşiyor; içerik onunla
  // yarışıp kutu hâlâ küçük/büyümekteyken belirmesin diye giriş gecikmeli —
  // çıkış ise kutu boyut değiştirmeye başlamadan hemen kaybolacak kadar hızlı.
  const enterTransition = reduced
    ? { duration: 0 }
    : { duration: 0.22, delay: 0.16, ease: [0.16, 1, 0.3, 1] as const };
  const exitTransition = reduced
    ? { duration: 0 }
    : { duration: 0.1, ease: "easeIn" as const };

  // Plan karnesi ölçülebildiyse panel yüksekliğini onun üstünde durur şekilde
  // sınırla — ölçülemediyse (henüz mount olmadı ya da sayfa bu prop'u hiç
  // vermiyor) mevcut `100dvh` tabanlı sınıfa güvenli şekilde düşer.
  const panelHeightPx =
    altSinirY != null
      ? Math.max(
          PANEL_MIN_H_PX,
          Math.min(PANEL_MAX_H_PX, altSinirY - TOP_OFFSET_PX - ALT_BOSLUK_PX)
        )
      : null;

  return (
    <motion.div
      layout
      transition={
        reduced ? { duration: 0 } : { type: "spring", bounce: 0.16, duration: 0.4 }
      }
      style={open && panelHeightPx != null ? { height: panelHeightPx } : undefined}
      className={cn(
        "pointer-events-auto absolute top-3 right-3 z-30 overflow-hidden sm:top-4 sm:right-4",
        CAM,
        open
          ? "h-[min(32rem,calc(100dvh-6rem))] w-[min(23rem,calc(100vw-1.5rem))] rounded-[20px]"
          : "size-11 rounded-full"
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div
            key="panel"
            initial={reduced ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1, transition: enterTransition }}
            exit={{ opacity: 0, scale: 0.98, transition: exitTransition }}
            className="flex h-full w-full flex-col"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                <SparklesIcon
                  className="size-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden
                />
                Asistan
              </span>
              <button
                type="button"
                aria-label="Asistanı kapat"
                onClick={() => setOpen(false)}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              >
                <XIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            <AgentAssistant
              className="min-h-0 flex-1"
              buildContext={buildContext}
              placeholder="Rota hakkında sor ya da komut ver…"
            />
          </motion.div>
        ) : (
          <motion.button
            key="bubble"
            type="button"
            initial={reduced ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, transition: enterTransition }}
            exit={{ opacity: 0, scale: 0.8, transition: exitTransition }}
            onClick={() => {
              setOpen(true);
              setOkunmadi(false);
            }}
            aria-label="AI asistanı aç"
            className="relative flex h-full w-full items-center justify-center"
          >
            {/* Düğmeyle (size-11 = 44px) birebir — daha küçük olsa aradaki
                boşluktan camın açık zemini sızıp orbun etrafında halka gibi görünüyordu. */}
            <FluidOrb size={44} color={ORB_COLOR} />
            {busy ? (
              <span
                className="absolute inset-0 animate-ping rounded-full bg-foreground/20"
                aria-hidden
              />
            ) : null}
            {!busy && okunmadi ? (
              <span
                className="absolute top-0.5 right-0.5 size-2 rounded-full bg-ink-red"
                aria-hidden
              />
            ) : null}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
