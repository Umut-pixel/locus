"use client";

import { useMemo, useState } from "react";
import { CheckIcon, LoaderIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToastManager } from "@/components/ui/toast";
import type { SecimBlock } from "@/lib/agent-blocks";
import {
  manualSyncToastDescription,
  waitForManualPipeline,
  writeManualSyncAt,
} from "@/lib/panorama-manual-sync";
import { cn } from "@/lib/utils";

type Durum = "bekliyor" | "calisiyor" | "bitti";

function Kutu({ isaretli }: { isaretli: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        isaretli
          ? "border-transparent bg-ink text-card"
          : "border-line-strong bg-card"
      )}
    >
      {isaretli ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
    </span>
  );
}

/**
 * Çoktan seçmeli aksiyon kartı — şimdilik tek aksiyonu var: rapor çekme.
 *
 * `RecommendCard` tek bir öneriyi onaylatır; bu kart bir KÜME seçtirir.
 * Seçim doğrudan API'ye gider, asistana geri sorulmaz: kullanıcı zaten neyi
 * istediğini işaretledi, araya bir model turu daha koymak yalnız gecikme olurdu.
 *
 * İlerleme ana sayfadaki "Şimdi çek" ile aynı yoldan takip edilir
 * (toast.promise + panorama_sync_runs anketi).
 */
export function SelectCard({ block }: { block: SecimBlock }) {
  const toast = useToastManager();
  const [secili, setSecili] = useState<Set<string>>(
    () => new Set(block.secenekler.filter((s) => s.onIsaretli).map((s) => s.key))
  );
  const [durum, setDurum] = useState<Durum>("bekliyor");

  const hepsi = secili.size === block.secenekler.length;
  const hicbiri = secili.size === 0;
  const kilitli = durum !== "bekliyor";

  const ozet = useMemo(() => {
    if (hicbiri) return "Hiçbiri seçilmedi";
    if (hepsi) return `Hepsi — ${block.secenekler.length} rapor`;
    return `${secili.size} rapor seçili`;
  }, [secili.size, hepsi, hicbiri, block.secenekler.length]);

  function degistir(key: string) {
    if (kilitli) return;
    setSecili((o) => {
      if (!block.coklu) return new Set([key]);
      const s = new Set(o);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return s;
    });
  }

  function hepsiniDegistir() {
    if (kilitli) return;
    setSecili(hepsi ? new Set() : new Set(block.secenekler.map((s) => s.key)));
  }

  function calistir() {
    if (hicbiri || kilitli) return;

    // Hepsi seçiliyken seçim GÖNDERİLMEZ: n8n Guard'ı boş listeyi "bütün
    // zincirler" olarak okuyor, eski davranış birebir korunsun.
    const secim = hepsi
      ? null
      : block.secenekler.filter((s) => secili.has(s.key)).map((s) => s.key);

    const basladi = Date.now();
    const waitNote = manualSyncToastDescription(new Date(basladi), secim);
    setDurum("calisiyor");

    const run = (async () => {
      const res = await fetch("/api/sync/panorama/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(secim ? { reportIds: secim } : {}),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(body?.error ?? "Çekim başlatılamadı.");
      }
      writeManualSyncAt(basladi);
      return waitForManualPipeline(basladi, secim);
    })();

    toast.promise(run, {
      loading: {
        type: "loading",
        title: "Panorama çekiliyor…",
        description: waitNote,
        timeout: 0,
      },
      success: (data: string) => {
        setDurum("bitti");
        return {
          type: "success",
          title: "Çekim tamamlandı",
          description: data,
          timeout: 10_000,
        };
      },
      error: (err: unknown) => {
        setDurum("bekliyor");
        const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
        return {
          type: "error",
          title: msg.includes("zaman aşımı")
            ? "Çekim bitmedi"
            : "Çekim başlatılamadı",
          description: msg,
          timeout: 12_000,
        };
      },
    });
  }

  return (
    <div className="agent-table-shell my-3 w-full">
      <div className="flex items-baseline gap-2 px-4 pt-3.5 pb-2">
        <span className="text-[14px] font-medium text-ink">{block.title}</span>
        <span className="ml-auto text-[11.5px] tabular-nums text-ink-3">
          {ozet}
        </span>
      </div>

      <ul className="flex flex-col border-t border-line">
        {block.coklu ? (
          <li>
            <button
              type="button"
              onClick={hepsiniDegistir}
              disabled={kilitli}
              aria-pressed={hepsi}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-hover disabled:opacity-60"
            >
              <Kutu isaretli={hepsi} />
              <span className="text-[13px] font-medium text-ink">Hepsi</span>
            </button>
          </li>
        ) : null}

        {block.secenekler.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => degistir(s.key)}
              disabled={kilitli}
              aria-pressed={secili.has(s.key)}
              className="flex w-full items-start gap-2.5 border-t border-line px-4 py-2.5 text-left transition-colors hover:bg-hover disabled:opacity-60"
            >
              <span className="pt-0.5">
                <Kutu isaretli={secili.has(s.key)} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-5 text-ink">
                  {s.label}
                </span>
                {s.hint ? (
                  <span className="mt-0.5 block text-[11.5px] leading-4 text-ink-3">
                    {s.hint}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-line px-4 py-2.5">
        <Button size="sm" onClick={calistir} disabled={hicbiri || kilitli}>
          {durum === "calisiyor" ? (
            <>
              <LoaderIcon className="size-3.5 animate-spin" />
              Çekiliyor…
            </>
          ) : durum === "bitti" ? (
            <>
              <CheckIcon className="size-3.5" />
              Tamamlandı
            </>
          ) : (
            (block.cta ?? "Çek")
          )}
        </Button>
        <span className="text-[11.5px] text-ink-3">
          {durum === "calisiyor"
            ? "İlerleme bildirimde görünür."
            : "Panorama'dan canlı çekilir, birkaç dakika sürer."}
        </span>
      </div>
    </div>
  );
}
