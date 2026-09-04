"use client";

import { formatNumber } from "@/lib/format";
import type { ZincirIlerlemesi } from "@/lib/panorama-manual-sync";
import type { RaporOzeti } from "@/lib/panorama-raporlar";

/** Toast dar; uzun listede ilk N adım gösterilip gerisi sayıya iniyor. */
const GORUNUR_ADIM = 4;

function Isaret({ durum }: { durum: ZincirIlerlemesi["durum"] }) {
  if (durum === "bitti") {
    return (
      <span aria-hidden className="text-success">
        ✓
      </span>
    );
  }
  if (durum === "hata") {
    return (
      <span aria-hidden className="text-destructive">
        ✕
      </span>
    );
  }
  if (durum === "calisiyor") {
    return (
      <span aria-hidden className="inline-block animate-spin">
        ◠
      </span>
    );
  }
  return (
    <span aria-hidden className="opacity-40">
      ·
    </span>
  );
}

/**
 * Çekim sürerken toast'ta görünen adım listesi.
 * Bittikçe satırlar tikleniyor — kullanıcı hangi raporun sırada olduğunu
 * başka sayfadayken de görebiliyor.
 */
export function CekimAdimlari({ ilerleme }: { ilerleme: ZincirIlerlemesi[] }) {
  const biten = ilerleme.filter((a) => a.durum === "bitti").length;
  const gorunur = ilerleme.slice(0, GORUNUR_ADIM);
  const kalan = ilerleme.length - gorunur.length;

  return (
    <span className="mt-0.5 flex flex-col gap-0.5 text-[11.5px] leading-4">
      <span className="tabular-nums opacity-70">
        {biten}/{ilerleme.length} tamamlandı
      </span>
      {gorunur.map((a) => (
        <span key={a.anahtar} className="flex items-baseline gap-1.5">
          <Isaret durum={a.durum} />
          <span className="min-w-0 flex-1 truncate">{a.ad}</span>
          {a.durum === "bitti" && a.satirSayisi != null ? (
            <span className="shrink-0 tabular-nums opacity-70">
              {formatNumber(a.satirSayisi)}
            </span>
          ) : null}
        </span>
      ))}
      {kalan > 0 ? (
        <span className="opacity-60">+{kalan} rapor daha</span>
      ) : null}
    </span>
  );
}

/**
 * Çekim bitince toast'ta kalan kısa özet — neyin güncellendiği.
 * Toast birkaç saniye sonra kapanıyor; detay kartta duruyor.
 */
export function CekimOzeti({ raporlar }: { raporlar: RaporOzeti[] }) {
  const gorunur = raporlar.slice(0, GORUNUR_ADIM);
  const kalan = raporlar.length - gorunur.length;

  return (
    <span className="mt-0.5 flex flex-col gap-0.5 text-[11.5px] leading-4">
      {gorunur.map((r) => (
        <span key={r.anahtar} className="flex items-baseline gap-1.5">
          <span className="min-w-0 flex-1 truncate">{r.ad}</span>
          {r.satirSayisi != null ? (
            <span className="shrink-0 tabular-nums opacity-70">
              {formatNumber(r.satirSayisi)} satır
            </span>
          ) : null}
        </span>
      ))}
      {kalan > 0 ? (
        <span className="opacity-60">+{kalan} rapor daha</span>
      ) : null}
    </span>
  );
}
