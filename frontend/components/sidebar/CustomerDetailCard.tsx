"use client";

import { XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate, formatKg, formatNumber } from "@/lib/format";
import { HASSASIYET_LABELS, RISK_COLORS, RISK_LABELS } from "@/lib/risk-style";
import type { MusteriHarita } from "@/lib/types";

interface CustomerDetailCardProps {
  musteri: MusteriHarita;
  onClose: () => void;
}

export function CustomerDetailCard({ musteri, onClose }: CustomerDetailCardProps) {
  return (
    <Card className="pointer-events-auto w-80 shadow-lg">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="leading-snug">{musteri.unvan}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {musteri.musteri_kodu}
              {musteri.sehir ? ` · ${musteri.sehir}` : ""}
              {musteri.ilce ? ` / ${musteri.ilce}` : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="shrink-0"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            className="border-0"
            style={{
              backgroundColor: `${RISK_COLORS[musteri.risk_durumu]}1a`,
              color: RISK_COLORS[musteri.risk_durumu],
            }}
          >
            {RISK_LABELS[musteri.risk_durumu]}
          </Badge>
          {musteri.durum && <Badge variant="outline">{musteri.durum}</Badge>}
        </div>

        <Separator />

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Field label="Son teslimat" value={formatDate(musteri.son_teslimat_tarihi)} />
          <Field
            label="Son teslimattan gün"
            value={
              musteri.son_teslimattan_gecen_gun != null
                ? `${formatNumber(musteri.son_teslimattan_gecen_gun)} gün`
                : "—"
            }
          />
          <Field
            label="Toplam teslimat"
            value={formatNumber(musteri.toplam_teslimat_sayisi)}
          />
          <Field label="Toplam tutar" value={formatCurrency(musteri.toplam_tutar)} />
          <Field label="Toplam ağırlık" value={formatKg(musteri.toplam_agirlik)} />
          <Field label="Rut" value={musteri.rut_kod ?? "—"} />
        </dl>

        {musteri.geocode_hassasiyet && (
          <>
            <Separator />
            <p className="text-xs text-muted-foreground">
              Konum kaynağı: {HASSASIYET_LABELS[musteri.geocode_hassasiyet]}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
