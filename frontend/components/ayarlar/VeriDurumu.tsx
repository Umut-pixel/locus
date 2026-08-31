"use client";

import Link from "next/link";

import { AyarlarBolum } from "@/components/ayarlar/AyarlarBolum";
import { usePanoramaRaporTazelikleri } from "@/hooks/usePanoramaRaporTazelikleri";
import { usePanoramaSyncStatus } from "@/hooks/usePanoramaSyncStatus";
import { formatIstanbulStamp } from "@/lib/panorama-schedule";
import { cn } from "@/lib/utils";

const TAZELIK_UYARI_SAAT = 24;
const TAZELIK_KRITIK_SAAT = 48;

function tazelikMetin(saatOnce: number | null): string {
  if (saatOnce == null) return "—";
  if (saatOnce < 1) return "az önce";
  if (saatOnce < 24) return `${saatOnce} saat önce`;
  return `${Math.floor(saatOnce / 24)} gün önce`;
}

function tazelikSinif(saatOnce: number | null): string {
  if (saatOnce == null) return "text-muted-foreground";
  if (saatOnce >= TAZELIK_KRITIK_SAAT) return "text-red-400";
  if (saatOnce >= TAZELIK_UYARI_SAAT) return "text-amber-400";
  return "text-foreground";
}

function noktaSinif(saatOnce: number | null): string {
  if (saatOnce == null) return "bg-muted-foreground/40";
  if (saatOnce >= TAZELIK_KRITIK_SAAT) return "bg-red-400";
  if (saatOnce >= TAZELIK_UYARI_SAAT) return "bg-amber-400";
  return "bg-emerald-400";
}

export function VeriDurumu() {
  const sync = usePanoramaSyncStatus();
  const { satirlar, loading: raporLoading } = usePanoramaRaporTazelikleri();
  const { status, loading, nextStamp } = sync;

  const durum = status.syncError
    ? { etiket: "Uyarı", sinif: "text-red-400", alt: status.syncError }
    : status.transformPending
      ? {
          etiket: "Harita bekleniyor",
          sinif: "text-amber-400",
          alt: "Landing alındı, transform geride.",
        }
      : {
          etiket: "Güncel",
          sinif: "text-foreground",
          alt: "Landing ve transform aynı nesil.",
        };

  return (
    <AyarlarBolum id="veri" baslik="Veri">
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
        <Kpi
          etiket="Son çekim"
          deger={formatIstanbulStamp(status.lastSyncAt) ?? "—"}
          alt="Panorama landing"
          loading={loading}
        />
        <Kpi
          etiket="Transform"
          deger={formatIstanbulStamp(status.lastTransformAt) ?? "—"}
          alt="Haritaya yazılma"
          loading={loading}
        />
        <Kpi etiket="Durum" deger={durum.etiket} alt={durum.alt} loading={loading} degerSinif={durum.sinif} />
        <Kpi
          etiket="Sonraki pencere"
          deger={nextStamp ?? "—"}
          alt="07:00 / 13:00 / 19:00 Istanbul"
          loading={false}
        />
      </div>

      {status.transformPending ? (
        <p className="border-b border-border px-3.5 py-2.5 text-[13px] text-muted-foreground">
          Sync alındı — harita bekleniyor.{" "}
          <Link href="/home" className="text-foreground underline-offset-4 hover:underline">
            Ana sayfadan çek
          </Link>
        </p>
      ) : null}

      <table className="w-full text-left text-[13px]">
        <thead className="text-[11px] tracking-wide text-muted-foreground uppercase">
          <tr className="border-b border-border">
            <th className="px-3.5 py-2 font-medium">Rapor</th>
            <th className="px-3.5 py-2 font-medium">Kimlik</th>
            <th className="px-3.5 py-2 text-right font-medium">Çekildi</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map((s) => (
            <tr key={s.id} className="border-b border-border/70 last:border-b-0">
              <td className="px-3.5 py-2">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      raporLoading ? "bg-muted-foreground/30" : noktaSinif(s.saatOnce)
                    )}
                    aria-hidden
                  />
                  <span className="font-medium">{s.ad}</span>
                  {s.bagimsiz ? (
                    <span className="text-[11px] text-muted-foreground">bağımsız</span>
                  ) : null}
                </span>
              </td>
              <td className="px-3.5 py-2 font-mono tabular-nums text-muted-foreground">
                {s.id}
              </td>
              <td
                className={cn(
                  "px-3.5 py-2 text-right font-mono tabular-nums",
                  raporLoading ? "text-muted-foreground" : tazelikSinif(s.saatOnce)
                )}
              >
                {raporLoading ? "…" : tazelikMetin(s.saatOnce)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AyarlarBolum>
  );
}

function Kpi({
  etiket,
  deger,
  alt,
  loading,
  degerSinif,
}: {
  etiket: string;
  deger: string;
  alt: string;
  loading: boolean;
  degerSinif?: string;
}) {
  return (
    <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
      <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
        {etiket}
      </span>
      <span
        className={cn(
          "font-sans text-[1.25rem] leading-none font-semibold tabular-nums transition-opacity",
          degerSinif ?? "text-foreground",
          loading && "opacity-40"
        )}
      >
        {deger}
      </span>
      <span className="text-[12px] text-muted-foreground">{alt}</span>
    </div>
  );
}
