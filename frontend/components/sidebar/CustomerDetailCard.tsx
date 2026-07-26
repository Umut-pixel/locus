"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency, formatDate, formatKg, formatNumber } from "@/lib/format";
import { HASSASIYET_LABELS, RISK_COLORS, RISK_LABELS } from "@/lib/risk-style";
import type { MusteriHarita } from "@/lib/types";

const GECIKME_ESIK_GUN = 90;

interface CustomerDetailCardProps {
  musteri: MusteriHarita;
  onClose: () => void;
  onShowRoute: (rutKod: string) => void;
}

export function CustomerDetailCard({
  musteri,
  onClose,
  onShowRoute,
}: CustomerDetailCardProps) {
  const accent = RISK_COLORS[musteri.risk_durumu];
  const hicTeslimat = musteri.risk_durumu === "hic_teslimat_yok";
  const gecikmeGun = musteri.son_teslimattan_gecen_gun;
  const gecikmeYuzde =
    !hicTeslimat && gecikmeGun != null
      ? Math.min(Math.round((gecikmeGun / GECIKME_ESIK_GUN) * 100), 999)
      : null;

  return (
    <Card
      className="pointer-events-auto w-80 gap-0 overflow-hidden border-0 py-0 shadow-2xl ring-0"
      style={{
        boxShadow: `0 0 0 1px ${accent}55, 0 16px 40px -12px rgba(0,0,0,0.65)`,
      }}
    >
      {/* Üst risk şeridi — referans görseldeki kırmızı çerçeve karşılığı */}
      <div className="h-[3px] w-full" style={{ backgroundColor: accent }} />

      <CardHeader className="gap-1 px-4 pt-3 pb-2">
        <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          {musteri.musteri_kodu}
          {musteri.sehir ? ` · ${musteri.sehir}` : ""}
          {musteri.ilce ? ` / ${musteri.ilce}` : ""}
        </p>
        <p className="line-clamp-2 font-mono text-sm leading-snug font-semibold tracking-wide uppercase">
          {musteri.unvan}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-0 px-4 pb-4">
        {/* Kapasite / gecikme satırı + yüzde */}
        {gecikmeYuzde != null ? (
          <div className="pb-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                Gecikme: {formatNumber(gecikmeGun ?? 0)} / {GECIKME_ESIK_GUN} gün
              </span>
              <span
                className="font-mono text-xl font-bold tabular-nums"
                style={{ color: accent }}
              >
                {gecikmeYuzde}%
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden bg-muted">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.min(gecikmeYuzde, 100)}%`,
                  backgroundColor: accent,
                }}
              />
            </div>
          </div>
        ) : (
          <p
            className="pb-3 font-mono text-xs tracking-widest uppercase"
            style={{ color: accent }}
          >
            Teslimat yok
          </p>
        )}

        {/* Risk rengine göre ayraç */}
        <div className="mb-3 h-px w-full" style={{ backgroundColor: accent }} />

        {/* Ana etiket:değer bloğu — referans görseldeki gövde kutusu */}
        <div className="mb-3 bg-muted/60 px-3 py-2.5">
          <dl className="flex flex-col gap-1.5 font-mono text-xs uppercase">
            <Kv
              label="Durum"
              value={RISK_LABELS[musteri.risk_durumu]}
              valueColor={accent}
            />
            <Kv label="Müşteri durumu" value={musteri.durum ?? "—"} />
            <Kv label="Toplam ciro" value={formatCurrency(musteri.toplam_tutar)} />
            <Kv label="Son teslimat" value={formatDate(musteri.son_teslimat_tarihi)} />
          </dl>
        </div>

        {/* İkincil meta — daha soluk */}
        <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[10px] text-muted-foreground uppercase">
          <MiniField
            label="Teslimat"
            value={formatNumber(musteri.toplam_teslimat_sayisi)}
          />
          <MiniField label="Ağırlık" value={formatKg(musteri.toplam_agirlik)} />
          <MiniField label="Rut" value={musteri.rut_kod ?? "—"} />
          {musteri.geocode_hassasiyet && (
            <MiniField
              label="Konum"
              value={HASSASIYET_LABELS[musteri.geocode_hassasiyet]}
            />
          )}
        </dl>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 rounded-sm font-mono text-[11px] tracking-wider uppercase"
            disabled={!musteri.rut_kod}
            onClick={() => musteri.rut_kod && onShowRoute(musteri.rut_kod)}
          >
            Rotada göster
          </Button>
          <Button
            size="sm"
            className="flex-1 rounded-sm bg-foreground font-mono text-[11px] tracking-wider text-background uppercase hover:bg-foreground/90"
            onClick={onClose}
          >
            Kapat
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Kv({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 tracking-widest text-muted-foreground">{label}:</dt>
      <dd
        className="truncate font-semibold tracking-wide"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="tracking-wide opacity-70">{label}</dt>
      <dd className="text-foreground normal-case">{value}</dd>
    </div>
  );
}
