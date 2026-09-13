"use client";

import { useEffect, useMemo, useState } from "react";

import {
  useRotaOnerisiBaglami,
  type RotaOnerisiAdimCozum,
} from "@/components/rota/RotaOnerisiBaglami";
import { Button } from "@/components/ui/button";
import type { RotaOnerisiBlock } from "@/lib/agent-blocks";

/** "Geri al" düğmesinin görünür kaldığı süre — genel bir undo stack değil,
 * yalnız AI'nin az önceki değişikliğini hızlıca telafi etmek için. */
const GERI_AL_SURESI_MS = 20_000;

function adimSatiri(c: RotaOnerisiAdimCozum): string {
  if (!c.ok) return c.hata;
  if (c.eylem === "durak_tasi") {
    const pozisyon = c.pozisyon != null ? ` (${c.pozisyon}. sıraya)` : "";
    return `${c.durakEtiket} → ${c.hedefAracEtiket}${pozisyon} — doluluk %${Math.round(c.dolulukOncesi)} → %${Math.round(c.dolulukSonrasi)}`;
  }
  if (c.eylem === "durak_havuza_al") return `${c.durakEtiket} havuza alınacak`;
  return `${c.hedefAracEtiket} yeniden optimize edilecek`;
}

/**
 * `rota_onerisi` bloğunun görünen karşılığı — `RecommendCard`'ın görsel
 * kabuğunu paylaşır ama içerik farklı: seçenek arasından biri değil, tek bir
 * (çok adımlı olabilen) değişiklik önce/sonra diliyle gösterilir.
 *
 * `MapActionChip` gibi kendi context'ini (`useRotaOnerisiBaglami`) doğrudan
 * okur — `AgentAssistant`/`AgentMarkdown` üzerinden `onAccept` prop'u
 * geçirmeye gerek yok, yalnız `/rotalar/harita`da gerçek bir karşılığı var.
 */
export function RotaOnerisiKarti({ block }: { block: RotaOnerisiBlock }) {
  const baglam = useRotaOnerisiBaglami();
  const [durum, setDurum] = useState<"bekliyor" | "uygulandi" | "hata">("bekliyor");
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [geriAl, setGeriAl] = useState<(() => void) | null>(null);

  const cozumler = useMemo(
    () => (baglam ? baglam.cozumle(block) : []),
    [baglam, block]
  );

  // "Geri al" süresiz açık kalmasın — bir süre sonra sessizce kapanır,
  // düğme kaybolur ama plan olduğu gibi (uygulanmış hâliyle) kalır.
  useEffect(() => {
    if (!geriAl) return;
    const zamanlayici = window.setTimeout(() => setGeriAl(null), GERI_AL_SURESI_MS);
    return () => window.clearTimeout(zamanlayici);
  }, [geriAl]);

  if (!baglam) return null;

  const gecerli = cozumler.length > 0 && cozumler.every((c) => c.ok);

  return (
    <div className="mb-3 w-full overflow-hidden rounded-[14px] bg-card shadow-agent last:mb-0">
      <div className="px-4 pt-4 pb-3">
        <span className="text-[14px] font-medium text-ink">{block.baslik}</span>
        {block.aciklama ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{block.aciklama}</p>
        ) : null}
        <ul className="mt-2 space-y-1">
          {cozumler.map((c, i) => (
            <li
              key={i}
              className={c.ok ? "text-[12.5px] text-ink-2" : "text-[12.5px] text-ink-red"}
            >
              {adimSatiri(c)}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
          {durum !== "bekliyor" ? mesaj : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {durum === "uygulandi" && geriAl ? (
            <Button
              variant="secondary"
              size="sm"
              className="text-[12.5px]"
              onClick={() => {
                geriAl();
                setDurum("bekliyor");
                setGeriAl(null);
                setMesaj(null);
              }}
            >
              Geri al
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={durum === "uygulandi" ? "secondary" : "default"}
            disabled={!gecerli || durum === "uygulandi"}
            className="text-[12.5px]"
            onClick={() => {
              const sonuc = baglam.uygula(cozumler);
              setMesaj(sonuc.mesaj);
              setDurum(sonuc.ok ? "uygulandi" : "hata");
              setGeriAl(sonuc.ok && sonuc.geriAl ? () => sonuc.geriAl! : null);
            }}
          >
            {durum === "uygulandi" ? "Uygulandı" : (block.cta ?? "Uygula")}
          </Button>
        </span>
      </div>
    </div>
  );
}
