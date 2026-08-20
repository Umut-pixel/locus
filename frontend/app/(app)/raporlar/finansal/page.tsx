"use client";

import { useCallback, useMemo, useState } from "react";
import { Typography } from "@heroui/react";

import { AcikFaturalarTable, VARSAYILAN_ACIK_FATURA_SORT, type AcikFaturaSort } from "@/components/finansal/AcikFaturalarTable";
import { BorcYaslandirmaDagilimi } from "@/components/finansal/BorcYaslandirmaDagilimi";
import { CiroTahsilatTrendi } from "@/components/finansal/CiroTahsilatTrendi";
import { EMPTY_FINANSAL_FILTERS, FinansalFilters, type FinansalFiltersTipi } from "@/components/finansal/FinansalFilters";
import { FinansalOzet } from "@/components/finansal/FinansalOzet";
import { TemsilciUrunDagilimi } from "@/components/finansal/TemsilciUrunDagilimi";
import { TopBorclularPanel } from "@/components/finansal/TopBorclularPanel";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import {
  BELGE_DETAY_REPORT_ID,
  YASLANDIRMA_REPORT_ID,
  useRaporTazeligi,
} from "@/hooks/useMusteriRaporlama";
import { useFinansalRaporu } from "@/hooks/useFinansalRaporu";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function FinansalRaporlarPage() {
  const {
    loading,
    error,
    ozet,
    bantlar,
    topBorclular,
    acikFaturalar,
    ciroGunluk,
    temsilciDagilimi,
    urunGrubuDagilimi,
  } = useFinansalRaporu();

  const [filters, setFilters] = useState<FinansalFiltersTipi>(EMPTY_FINANSAL_FILTERS);
  const [sort, setSort] = useState<AcikFaturaSort>(VARSAYILAN_ACIK_FATURA_SORT);

  const handleTemsilciSec = useCallback((ad: string) => {
    setFilters((f) => ({ ...f, temsilci: f.temsilci === ad ? null : ad }));
  }, []);

  const acikFaturalarGorunen = useMemo(() => {
    const arama = filters.arama.trim().toLocaleLowerCase("tr");
    const filtreli = acikFaturalar.filter((s) => {
      if (filters.temsilci && s.temsilci !== filters.temsilci) return false;
      if (arama) {
        const havuz = `${s.musteriAd ?? ""} ${s.musteriKod}`.toLocaleLowerCase("tr");
        if (!havuz.includes(arama)) return false;
      }
      return true;
    });

    const yon = sort.dir === "asc" ? 1 : -1;
    return [...filtreli].sort((a, b) => {
      if (sort.field === "musteriAd") {
        return (a.musteriAd ?? a.musteriKod).localeCompare(b.musteriAd ?? b.musteriKod, "tr") * yon;
      }
      const fark = a[sort.field] - b[sort.field];
      return fark !== 0 ? fark * yon : a.musteriKod.localeCompare(b.musteriKod, "tr");
    });
  }, [acikFaturalar, filters, sort]);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <div className="flex min-w-0 items-center gap-3">
          <Typography.Heading level={5} className="shrink-0 tracking-tight">
            Finansal Raporlar
          </Typography.Heading>
          <span
            className="inline-flex h-6 shrink-0 cursor-help items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 font-mono text-[12.5px] font-medium text-emerald-400 tabular-nums"
            title="Açık fatura sayısı — v_panorama_acik_fatura_vade_kup_guncel'in son senkronundan."
          >
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
            {formatNumber(acikFaturalar.length)}
          </span>
          <Typography.Paragraph size="sm" color="muted" truncate className="hidden md:block">
            Tahsilat, borç yaşlandırması ve ciro kırılımı
          </Typography.Paragraph>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <VeriTazeligi />
        </div>
      </div>

      <FinansalFilters filters={filters} onChange={setFilters} />

      {error ? (
        <Typography
          type="body-sm"
          className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-3.5 py-2 text-destructive"
        >
          {error}
        </Typography>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <FinansalOzet ozet={ozet} loading={loading} />

        <div className="grid border-b border-border lg:grid-cols-2 [&>section]:h-[19rem]">
          <BorcYaslandirmaDagilimi bantlar={bantlar} loading={loading} />
          <TopBorclularPanel satirlar={topBorclular} loading={loading} />
        </div>

        <CiroTahsilatTrendi gunler={ciroGunluk} loading={loading} />

        <TemsilciUrunDagilimi
          temsilciDagilimi={temsilciDagilimi}
          urunGrubuDagilimi={urunGrubuDagilimi}
          loading={loading}
          seciliTemsilci={filters.temsilci}
          onTemsilciSec={handleTemsilciSec}
        />

        <AcikFaturalarTable
          satirlar={acikFaturalarGorunen}
          loading={loading}
          error={error}
          sort={sort}
          onSortChange={setSort}
        />
      </div>
    </div>
  );
}

/** ST Yaşlandırma (5530) ve Belge Detay (5450) — borç ve ciro rakamları bu iki çekime dayanıyor. */
function VeriTazeligi() {
  const yaslandirma = useRaporTazeligi(YASLANDIRMA_REPORT_ID);
  const belgeDetay = useRaporTazeligi(BELGE_DETAY_REPORT_ID);

  const enEski = [yaslandirma, belgeDetay]
    .filter((t) => t.saatOnce != null)
    .sort((a, b) => (b.saatOnce ?? 0) - (a.saatOnce ?? 0))[0];

  if (!enEski || enEski.saatOnce == null) return null;

  const kritik = enEski.saatOnce >= 48;
  const uyari = enEski.saatOnce >= 24;
  const metin =
    enEski.saatOnce < 1
      ? "az önce"
      : enEski.saatOnce < 24
        ? `${enEski.saatOnce} saat önce`
        : `${Math.floor(enEski.saatOnce / 24)} gün önce`;

  return (
    <span
      className="hidden shrink-0 items-center gap-1.5 md:flex"
      title="ST Yaşlandırma (5530) ve Belge Detay (5450) raporlarının en eski olanının Panorama'dan son çekim zamanı."
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
