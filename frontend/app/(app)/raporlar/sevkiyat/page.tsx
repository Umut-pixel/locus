"use client";

import { useState } from "react";
import { Typography } from "@heroui/react";

import { BekleyenSiparislerPanel } from "@/components/sevkiyat/BekleyenSiparislerPanel";
import { EnRiskliMusterilerPanel } from "@/components/sevkiyat/EnRiskliMusterilerPanel";
import { PanelGecisi, type OperasyonPaneli } from "@/components/sevkiyat/PanelGecisi";
import { PlakaOdemeDagilimi } from "@/components/sevkiyat/PlakaOdemeDagilimi";
import { RutPerformansTablosu } from "@/components/sevkiyat/RutPerformansTablosu";
import { RutSiparisDolulukPanel } from "@/components/sevkiyat/RutSiparisDolulukPanel";
import { SevkiyatOzet } from "@/components/sevkiyat/SevkiyatOzet";
import { SevkiyatSikligiTrendi } from "@/components/sevkiyat/SevkiyatSikligiTrendi";
import { SonSevkiyatlarPanel } from "@/components/sevkiyat/SonSevkiyatlarPanel";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { DonemSecici } from "@/components/ui/donem-secici";
import { useRaporTazeligi } from "@/hooks/useMusteriRaporlama";
import {
  SEVKIYAT_REPORT_ID,
  SIPARIS_DURUM_REPORT_ID,
  useSevkiyatRaporu,
} from "@/hooks/useSevkiyatRaporu";
import { VARSAYILAN_DONEM, donemAraligi, type DonemAraligi } from "@/lib/donem";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function SevkiyatRaporlariPage() {
  const [aralik, setAralik] = useState<DonemAraligi>(() => donemAraligi(VARSAYILAN_DONEM));
  const {
    loading,
    error,
    ozet,
    rutlar,
    enRiskliMusteriler,
    sikligiTrendi,
    plakalar,
    odemeTipleri,
    bekleyenSiparisler,
    sonSevkiyatlar,
    rutSiparisDoluluk,
  } = useSevkiyatRaporu(aralik);

  /** Orta panel iki veri kümesini paylaşıyor — tek tuşla geçiş. */
  const [ortaPanel, setOrtaPanel] = useState<OperasyonPaneli>("bekleyen");

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
            Rut sipariş doluluğu, rut performansı ve sevkiyat sıklığı
          </Typography.Paragraph>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <VeriTazeligi />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-3.5 py-2.5">
        <DonemSecici deger={aralik} onChange={setAralik} />
        <Typography.Paragraph size="sm" color="muted" className="hidden lg:block">
          Sevkiyat sıklığı, plaka/ödeme kırılımı ve son sevkiyatlar seçili
          dönemi gösterir; bekleyen siparişler anlık durumdur.
        </Typography.Paragraph>
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

        {/*
         * Orta sütun iki veri kümesini paylaşıyor (bekleyen siparişler ↔ en
         * riskli müşteriler); sağ sütun gerçekleşmiş sevkiyatlar. Sıralama
         * bilinçli: soldan sağa "rut yükü → bekleyen iş → tamamlanan iş".
         */}
        <div className="grid border-b border-border lg:grid-cols-3 [&>section]:h-[22rem]">
          <RutSiparisDolulukPanel
            satirlar={rutSiparisDoluluk}
            aktifRutSayisi={ozet.aktifRutSayisi}
            loading={loading}
          />
          {ortaPanel === "bekleyen" ? (
            <BekleyenSiparislerPanel
              satirlar={bekleyenSiparisler}
              loading={loading}
              headerExtra={<PanelGecisi aktif={ortaPanel} onChange={setOrtaPanel} />}
            />
          ) : (
            <EnRiskliMusterilerPanel
              satirlar={enRiskliMusteriler}
              loading={loading}
              headerExtra={<PanelGecisi aktif={ortaPanel} onChange={setOrtaPanel} />}
            />
          )}
          <SonSevkiyatlarPanel satirlar={sonSevkiyatlar} loading={loading} />
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

/** SevkiyatRaporuKup (5130) ve sipariş belge detay (5451). */
function VeriTazeligi() {
  const sevkiyat = useRaporTazeligi(SEVKIYAT_REPORT_ID);
  const siparisDurum = useRaporTazeligi(SIPARIS_DURUM_REPORT_ID);

  const enEski = [sevkiyat, siparisDurum]
    .filter((t) => t.saatOnce != null)
    .sort((a, b) => (b.saatOnce ?? 0) - (a.saatOnce ?? 0))[0];

  if (!enEski || enEski.saatOnce == null) return null;
  const saatOnce = enEski.saatOnce;

  const kritik = saatOnce >= 48;
  const uyari = saatOnce >= 24;
  const metin =
    saatOnce < 1 ? "az önce" : saatOnce < 24 ? `${saatOnce} saat önce` : `${Math.floor(saatOnce / 24)} gün önce`;

  return (
    <span
      className="hidden shrink-0 items-center gap-1.5 md:flex"
      title="SevkiyatRaporuKup (5130) ve Belge detay sipariş (5451) — en eski çekimin zamanı."
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
