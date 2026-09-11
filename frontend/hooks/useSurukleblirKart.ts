"use client";

import { useCallback, useRef, useState, type PointerEvent, type RefObject } from "react";

interface SurukleblirKartSonucu {
  /** Kartın kendisine — pozisyon hesaplarken sınırları ölçmek için. */
  cardRef: RefObject<HTMLDivElement | null>;
  /** Tutamaca (başlık şeridi) takılacak pointer olayları + imleç stili. */
  tutamacProps: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
    style: { cursor: string; touchAction: string };
  };
  /** Kartın köküne uygulanacak transform. */
  style: { transform?: string };
  suruklendi: boolean;
}

/**
 * Harita üstü yüzen kartlara (Planlamaya dön, araç/bölge listesi, plan
 * karnesi, durak kartı) sürükleme kazandıran paylaşılan hook.
 *
 * `CustomerDetailPanel`'deki tam sheet/elastic sürükleme sisteminin sade
 * hâli: yalnız `translate3d` ile takip, GSAP'a ya da `motion/react`'e
 * ihtiyaç yok — kart bırakılınca geri sıçramıyor, olduğu yerde kalıyor.
 * Tutamaç içindeki gerçek kontroller (buton, link) tıklamayı sürüklemeye
 * kaptırmasın diye `closest("button, a, input, ...")` ile hariç tutuluyor.
 */
export function useSurukleblirKart(
  containerRef: RefObject<HTMLDivElement | null>,
  /**
   * Çağıran zaten kendi ölçüm ref'ini tutuyorsa (ör. `DurakDetayKarti`
   * konumlandırma için) onu paylaşmak için — verilmezse hook kendi ref'ini
   * kurar.
   */
  disaridanCardRef?: RefObject<HTMLDivElement | null>
): SurukleblirKartSonucu {
  const kendiCardRef = useRef<HTMLDivElement>(null);
  const cardRef = disaridanCardRef ?? kendiCardRef;
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [suruklendi, setSuruklendi] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    hareketEtti: boolean;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button != null && e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, textarea, select, [role='button']")) return;
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        baseX: pos.x,
        baseY: pos.y,
        hareketEtti: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos]
  );

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.hareketEtti && Math.hypot(dx, dy) > 3) {
      drag.hareketEtti = true;
      setSuruklendi(true);
    }
    if (!drag.hareketEtti) return;

    let nextX = drag.baseX + dx;
    let nextY = drag.baseY + dy;

    // Kart konteynerin (harita alanı) dışına tamamen çıkmasın — en az
    // 32px'i her zaman görünür/tutulabilir kalsın.
    const card = cardRef.current;
    const container = containerRef.current;
    if (card && container) {
      const cardR = card.getBoundingClientRect();
      const contR = container.getBoundingClientRect();
      // Sürüklemeden ÖNCEKİ (flow) konumu — offset bundan hesaplanıyor.
      const flowLeft = cardR.left - pos.x;
      const flowTop = cardR.top - pos.y;
      const margin = 32;
      const minX = contR.left - flowLeft - cardR.width + margin;
      const maxX = contR.right - flowLeft - margin;
      const minY = contR.top - flowTop - cardR.height + margin;
      const maxY = contR.bottom - flowTop - margin;
      nextX = Math.min(Math.max(nextX, minX), maxX);
      nextY = Math.min(Math.max(nextY, minY), maxY);
    }

    setPos({ x: nextX, y: nextY });
  }, [containerRef, pos.x, pos.y]);

  const endDrag = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    // `suruklendi` bir sonraki click event'inin tıklama sayılıp
    // sayılmayacağını ayırt etmek için kısa bir an true kalıyor.
    if (drag.hareketEtti) {
      window.setTimeout(() => setSuruklendi(false), 0);
    }
  }, []);

  return {
    cardRef,
    tutamacProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      style: { cursor: "grab", touchAction: "none" },
    },
    style: pos.x !== 0 || pos.y !== 0 ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` } : {},
    suruklendi,
  };
}
