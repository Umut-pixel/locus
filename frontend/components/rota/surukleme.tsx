"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

import type { RotaDuragi } from "@/hooks/useRotaPlani";
import { formatKg, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Havuza geri bırakmak için kullanılan hedef kimliği. */
export const HAVUZ_HEDEFI = "havuz";

export interface SurukleYuku {
  durak: RotaDuragi;
  /** Nereden geliyor — havuzdan sürükleniyorsa null. */
  kaynakAracKod: string | null;
}

export interface SuruklemeDurumu {
  musteriKodu: string;
  kaynakAracKod: string | null;
  /** İmlecin üstünde durduğu hedef: araç kodu, `HAVUZ_HEDEFI` ya da null. */
  hedefKod: string | null;
}

interface Baglam {
  durum: SuruklemeDurumu | null;
  basla: (event: React.PointerEvent, yuk: SurukleYuku) => void;
  /**
   * Az önce sürükleme yapıldı mı? Okuyunca bayrağı sıfırlar.
   * pointerup'ı izleyen `click` olayını yutmak için — sürükleyip bırakan
   * kullanıcı ayrıca tıklamış sayılmasın.
   */
  suruklendiMi: () => boolean;
  etkin: boolean;
}

const Ctx = createContext<Baglam | null>(null);

/** İmlecin altındaki bırakma hedefi. Önizleme `pointer-events:none`. */
function hedefBul(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  return (
    el?.closest<HTMLElement>("[data-birak-hedef]")?.dataset.birakHedef ?? null
  );
}

interface AktifSurukleme extends SuruklemeDurumu {
  durak: RotaDuragi;
  x: number;
  y: number;
}

/**
 * Durak sürükleme — havuz ↔ araç, iki yönlü.
 *
 * Neden motion'ın `drag`'i değil: sürüklenen öğe havuzun `overflow` sınırında
 * kırpılıyordu ve `z-index` `overflow:hidden` atasından kaçamıyor. Önizleme
 * `document.body`'ye portal'lanınca kırpılma tamamen kalkıyor.
 *
 * `etkin` yalnız fare/trackpad'de true: dokunmatikte pointer olayları sayfa
 * kaydırmasıyla çakışıyor, orada tıklama akışı kullanılıyor.
 */
export function SuruklemeSaglayici({
  etkin,
  onBirak,
  children,
}: {
  etkin: boolean;
  onBirak: (yuk: SurukleYuku, hedefKod: string) => void;
  children: ReactNode;
}) {
  const [aktif, setAktif] = useState<AktifSurukleme | null>(null);
  const baslangic = useRef<{
    yuk: SurukleYuku;
    x0: number;
    y0: number;
    acildi: boolean;
  } | null>(null);
  const surukledi = useRef(false);

  // Callback kimliği her render değişebilir; effect'i yeniden kurmasın.
  const birakRef = useRef(onBirak);
  const etkinRef = useRef(etkin);
  useEffect(() => {
    birakRef.current = onBirak;
    etkinRef.current = etkin;
  });

  const basla = useCallback((event: React.PointerEvent, yuk: SurukleYuku) => {
    if (!etkinRef.current || event.button !== 0) return;
    baslangic.current = {
      yuk,
      x0: event.clientX,
      y0: event.clientY,
      acildi: false,
    };
    surukledi.current = false;
  }, []);

  useEffect(() => {
    const hareket = (e: PointerEvent) => {
      const b = baslangic.current;
      if (!b) return;
      // 6 px eşiği: altındaki hareket tıklama sayılır, sürükleme başlamaz.
      if (!b.acildi) {
        if (Math.hypot(e.clientX - b.x0, e.clientY - b.y0) < 6) return;
        b.acildi = true;
        surukledi.current = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      }
      const hedefKod = hedefBul(e.clientX, e.clientY);
      setAktif({
        durak: b.yuk.durak,
        musteriKodu: b.yuk.durak.musteriKodu,
        kaynakAracKod: b.yuk.kaynakAracKod,
        hedefKod,
        x: e.clientX,
        y: e.clientY,
      });
    };

    const bitir = (e: PointerEvent) => {
      const b = baslangic.current;
      baslangic.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (b?.acildi) {
        const hedefKod = hedefBul(e.clientX, e.clientY);
        // Geldiği yere bırakmak işlemsizdir.
        if (hedefKod && hedefKod !== (b.yuk.kaynakAracKod ?? HAVUZ_HEDEFI)) {
          birakRef.current(b.yuk, hedefKod);
        }
      }
      setAktif(null);
    };

    window.addEventListener("pointermove", hareket);
    window.addEventListener("pointerup", bitir);
    window.addEventListener("pointercancel", bitir);
    return () => {
      window.removeEventListener("pointermove", hareket);
      window.removeEventListener("pointerup", bitir);
      window.removeEventListener("pointercancel", bitir);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  const suruklendiMi = useCallback(() => {
    const oldu = surukledi.current;
    surukledi.current = false;
    return oldu;
  }, []);

  return (
    <Ctx.Provider value={{ durum: aktif, basla, suruklendiMi, etkin }}>
      {children}
      <Onizleme aktif={aktif} />
    </Ctx.Provider>
  );
}

export function useSurukleme(): Baglam {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useSurukleme yalnız SuruklemeSaglayici içinde kullanılabilir.");
  }
  return v;
}

/** Sürüklenen durağın imleci takip eden kartı — body'ye portal'lanır. */
function Onizleme({ aktif }: { aktif: AktifSurukleme | null }) {
  if (typeof document === "undefined") return null;

  const havuzaDonuyor = aktif?.hedefKod === HAVUZ_HEDEFI;

  return createPortal(
    <AnimatePresence>
      {aktif ? (
        <motion.div
          key="surukleme-onizleme"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className={cn(
            "pointer-events-none fixed z-[60] max-w-[16rem] rounded-lg px-3 py-2",
            "border border-border/60 bg-popover/95 text-popover-foreground",
            "shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)] backdrop-blur-[18px]",
            aktif.hedefKod && "ring-2 ring-foreground/50"
          )}
          style={{ left: aktif.x + 14, top: aktif.y + 14 }}
        >
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
              {aktif.durak.unvan}
            </span>
            <span className="shrink-0 font-mono text-[12px] tabular-nums">
              {formatKg(Math.round(aktif.durak.kg))}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {formatNumber(Math.round(aktif.durak.cuvalEsdeger))} çuval
            </span>
            <span className="truncate">
              {havuzaDonuyor
                ? "bırak → havuza geri al"
                : aktif.hedefKod
                  ? "bırak → araca ekle"
                  : aktif.kaynakAracKod
                    ? "havuza ya da başka araca sürükle"
                    : "bir araç kartına sürükle"}
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
