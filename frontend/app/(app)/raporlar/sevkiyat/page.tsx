"use client";

import { Typography } from "@heroui/react";

import { EnRiskliMusterilerPanel } from "@/components/sevkiyat/EnRiskliMusterilerPanel";
import { PlakaOdemeDagilimi } from "@/components/sevkiyat/PlakaOdemeDagilimi";
import { RutPerformansTablosu } from "@/components/sevkiyat/RutPerformansTablosu";
import { SevkiyatOzet } from "@/components/sevkiyat/SevkiyatOzet";
import { SevkiyatSikligiTrendi } from "@/components/sevkiyat/SevkiyatSikligiTrendi";
import { TeslimatGecikmeDagilimi } from "@/components/sevkiyat/TeslimatGecikmeDagilimi";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { useRaporTazeligi } from "@/hooks/useMusteriRaporlama";
import { SEVKIYAT_REPORT_ID, useSevkiyatRaporu } from "@/hooks/useSevkiyatRaporu";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function SevkiyatRaporlariPage() {
  const {
    loading,
    error,
    ozet,
    rutlar,
    enRiskliMusteriler,
    sikligiTrendi,
    plakalar,
    odemeTipleri,
  } = useSevkiyatRaporu();

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <div className="flex min-w-0 items-center gap-3">
          <Typography.Heading level={5} className="shrink-0 tracking-tight">
            Sevkiyat Raporları
          </Typography.Heading>
          <span
            className="inline-flex h-6 shrink-0 cursor-help items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 font-mono text-[12.5px] font-medium text-emerald-400 tabular-nums"
            title="Rut kodu atanmış aktif rut sayısı — musteriler_rapor'un son senkronundan."
          >
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
            {formatNumber(ozet.aktifRutSayisi)}
          </span>
          <Typography.Paragraph size="sm" color="muted" truncate className="hidden md:block">
            Teslimat gecikmesi, rut performansı ve sevkiyat sıklığı
          </Typography.Paragraph>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <VeriTazeligi />
        </div>
      </div>

      {error ? (
        <Typography
          type="body-sm"
          className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-3.5 py-2 text-destructive"
        >
          {error}
        </Typography>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SevkiyatOzet ozet={ozet} loading={loading} />

        <div className="grid border-b border-border lg:grid-cols-2 [&>section]:h-[22rem]">
          <TeslimatGecikmeDagilimi riskDagilimi={ozet.riskDagilimi} loading={loading} />
          <EnRiskliMusterilerPanel satirlar={enRiskliMusteriler} loading={loading} />
        </div>

        <SevkiyatSikligiTrendi gunler={sikligiTrendi} loading={loading} />

        <PlakaOdemeDagilimi plakalar={plakalar} odemeTipleri={odemeTipleri} loading={loading} />

        <div className="h-[26rem]">
          <RutPerformansTablosu satirlar={rutlar} loading={loading} error={error} />
        </div>
      </div>
    </div>
  );
}

/** SevkiyatRaporuKup (5130) — rut/teslimat rakamları bu çekime dayanıyor. */
function VeriTazeligi() {
  const { saatOnce, loading } = useRaporTazeligi(SEVKIYAT_REPORT_ID);

  if (loading || saatOnce == null) return null;

  const kritik = saatOnce >= 48;
  const uyari = saatOnce >= 24;
  const metin =
    saatOnce < 1 ? "az önce" : saatOnce < 24 ? `${saatOnce} saat önce` : `${Math.floor(saatOnce / 24)} gün önce`;

  return (
    <span
      className="hidden shrink-0 items-center gap-1.5 md:flex"
      title="SevkiyatRaporuKup (5130) Panorama'dan en son ne zaman çekildi."
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          kritik ? "bg-red-400" : uyari ? "bg-amber-400" : "bg-emerald-400"
        )}
        aria-hidden
      />
      <span className="text-[12px] text-muted-foreground">Veri</span>
      <span
        className={cn(
          "font-mono text-[12.5px] font-medium tabular-nums",
          kritik ? "text-red-400" : uyari ? "text-amber-400" : "text-foreground"
        )}
      >
        {metin}
      </span>
    </span>
  );
}
