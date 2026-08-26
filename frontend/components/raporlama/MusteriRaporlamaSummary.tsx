"use client";

import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import { motion } from "motion/react";

import {
  YASLANDIRMA_REPORT_ID,
  gecikmeBandiEtiketi,
  raporlamaFiltersActive,
  useBolgeDisiOzet,
  useNetCiroTrendi,
  useRaporTazeligi,
  type RaporlamaFilters,
  type RaporlamaSummary,
} from "@/hooks/useMusteriRaporlama";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { riskShortLabelsForMode, type RiskMetricMode } from "@/lib/risk-mode";
import { RISK_COLORS, RISK_ORDER } from "@/lib/risk-style";
import { cn } from "@/lib/utils";

interface MusteriRaporlamaSummaryProps {
  totalCount: number;
  summary: RaporlamaSummary;
  loading: boolean;
  riskMode: RiskMetricMode;
  /** Açık bakiye toplamının hangi alanı özetlediğini etiketlemek için. */
  filters: RaporlamaFilters;
}

/** 24 saati aşan borç verisi amber, 48 saati aşan kırmızı — n8n'de 5530 cron'u yok. */
const TAZELIK_UYARI_SAAT = 24;
const TAZELIK_KRITIK_SAAT = 48;

/**
 * Açık Bakiye ve Borç riski tamamen ST Yaşlandırma'ya (5530) dayanıyor ve bu
 * rapor otomatik çekilmiyor. Verinin kaç saatlik olduğunu göstermezsek bayat
 * borçla karar alınıyor ve ekranda hiçbir iz kalmıyor.
 */
function BorcTazeligi() {
  const { saatOnce, loading } = useRaporTazeligi(YASLANDIRMA_REPORT_ID);

  if (loading || saatOnce == null) return null;

  const kritik = saatOnce >= TAZELIK_KRITIK_SAAT;
  const uyari = saatOnce >= TAZELIK_UYARI_SAAT;
  const metin =
    saatOnce < 1
      ? "az önce"
      : saatOnce < 24
        ? `${saatOnce} saat önce`
        : `${Math.floor(saatOnce / 24)} gün önce`;

  return (
    <span
      className="flex shrink-0 items-center gap-1.5"
      title={`ST Yaşlandırma (5530) Panorama'dan en son ${metin} çekildi. Açık bakiye ve borç riski bu veriye dayanıyor.`}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          kritik
            ? "bg-red-400"
            : uyari
              ? "bg-amber-400"
              : "bg-emerald-400"
        )}
        aria-hidden
      />
      <span className="text-[12px] text-muted-foreground">Borç verisi</span>
      <span
        className={cn(
          "font-mono font-medium tabular-nums",
          kritik
            ? "text-red-400"
            : uyari
              ? "text-amber-400"
              : "text-foreground"
        )}
      >
        {metin}
      </span>
    </span>
  );
}

/**
 * ±%0.05 içindeki günlük değişim "durgun" sayılır — bu sadece kayan nokta
 * gürültüsüne karşı bir taban, iş kararı değil. musteri_metrik_gecmis günde
 * bir kez (pg_cron, 08:15 TR) dolduğu için gerçek gün-gün farkları çoğu zaman
 * %0.1–1 aralığında kalıyor (2026-08-13→17: -%16.7, +%1.0, -%0.07, +%0.41,
 * %0). Eski %0.5 eşiği bu farkların çoğunu "durgun"a yutuyordu — gösterge
 * neredeyse hiç ok göstermiyordu. Bkz. useNetCiroTrendi.
 */
const NET_CIRO_TREND_ESIK = 0.0005;

/**
 * Toplam net ciro'nun bir önceki güne göre yönü. Yalnızca filtre yokken
 * gösterilir — musteri_metrik_gecmis segment/şehir/temsilci taşımıyor,
 * filtreli bir kümeyle karşılaştırma yanıltıcı olur (bkz. useNetCiroTrendi).
 */
function NetCiroTrend({
  guncelToplam,
  filters,
}: {
  guncelToplam: number;
  filters: RaporlamaFilters;
}) {
  const aktif = !raporlamaFiltersActive(filters);
  const { oncekiTarih, oncekiToplam, loading } = useNetCiroTrendi(aktif);

  if (!aktif || loading || oncekiToplam == null || oncekiTarih == null) return null;

  const degisim =
    oncekiToplam === 0 ? 0 : (guncelToplam - oncekiToplam) / Math.abs(oncekiToplam);
  const yon: "yukari" | "asagi" | "durgun" =
    Math.abs(degisim) < NET_CIRO_TREND_ESIK ? "durgun" : degisim > 0 ? "yukari" : "asagi";
  const yuzde = `%${Math.abs(degisim * 100).toFixed(2)}`;
  const baslik =
    yon === "durgun"
      ? `${formatDate(oncekiTarih)} toplamına göre neredeyse değişmedi (${yuzde})`
      : yon === "yukari"
        ? `${formatDate(oncekiTarih)} toplamına göre ${yuzde} arttı`
        : `${formatDate(oncekiTarih)} toplamına göre ${yuzde} azaldı`;

  return (
    <span
      className={cn(
        "ml-1 inline-flex items-center",
        yon === "yukari"
          ? "text-emerald-400"
          : yon === "asagi"
            ? "text-red-400"
            : "text-muted-foreground"
      )}
      title={baslik}
      aria-label={baslik}
    >
      {yon === "durgun" ? (
        <MinusIcon className="size-3.5" aria-hidden />
      ) : (
        <motion.span
          className="inline-flex"
          animate={{ y: yon === "yukari" ? [0, -2, 0] : [0, 2, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          {yon === "yukari" ? (
            <ArrowUpIcon className="size-3.5" aria-hidden />
          ) : (
            <ArrowDownIcon className="size-3.5" aria-hidden />
          )}
        </motion.span>
      )}
    </span>
  );
}

/**
 * Master'da kaydı olmadığı için bu tabloda HİÇ görünmeyen ciro.
 *
 * BelgeDetayRaporu (5450) DistGrup'un tamamını kapsıyor; müşteri master'ına
 * henüz yazılmamış kodlar (landing'de yok, yeni fatura vb.) burada kalır.
 * Filtre yokken gösterilir — filtrelenmiş bir toplamın yanında durursa yanıltır.
 */
function BolgeDisiCiro({ filters }: { filters: RaporlamaFilters }) {
  const aktif = !raporlamaFiltersActive(filters);
  const { musteriSayisi, netCiro, loading } = useBolgeDisiOzet(aktif);

  if (!aktif || loading || !netCiro || !musteriSayisi) return null;

  return (
    <span
      className="flex shrink-0 items-center gap-1.5 text-muted-foreground"
      title={
        `Panorama belge raporunda olup müşteri master'ında kaydı olmayan ` +
        `${formatNumber(musteriSayisi)} müşteri (${formatCurrency(netCiro)}) ` +
        `yukarıdaki toplama dahil değil.`
      }
    >
      <span className="text-[12px]">master dışı</span>
      <span className="font-mono font-medium tabular-nums">
        {formatCurrency(netCiro)}
      </span>
      <span className="text-[12px]">/ {formatNumber(musteriSayisi)} müşteri</span>
    </span>
  );
}

/**
 * Alt durum çubuğu — dashboard kartı değil. Filtrelenmiş kümenin tamamını
 * (görünen sayfayı değil) özetler; tek satır. 2026-08-10: ilk yoğun geçişten
 * (44px) sonra "çok dar" geri bildirimiyle ~%20 büyütüldü (~52px).
 */
export function MusteriRaporlamaSummary({
  totalCount,
  summary,
  loading,
  riskMode,
  filters,
}: MusteriRaporlamaSummaryProps) {
  const riskLabels = riskShortLabelsForMode(riskMode);
  const bandEtiketi = gecikmeBandiEtiketi(filters);
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-x-5 gap-y-1 overflow-x-auto border-t border-border bg-muted/25 px-3.5 text-[13.5px] whitespace-nowrap">
      <span className="font-mono font-medium text-foreground tabular-nums">
        {formatNumber(totalCount)}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          müşteri
        </span>
      </span>

      <Ayirac />

      <span
        className="inline-flex items-center font-mono font-medium text-foreground tabular-nums"
        title="KDV hariç net satış geliri (Brüt − İskonto). Muhasebe anlamında ciro budur."
      >
        {loading ? "…" : formatCurrency(summary.toplamNetCiro)}
        {!loading && (
          <NetCiroTrend guncelToplam={summary.toplamNetCiro} filters={filters} />
        )}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          net ciro
        </span>
      </span>

      {/*
        Aynı kümenin KDV dahil hâli — müşteriden tahsil edilen tutar. Panorama'nın
        "Net Tutar" kolonu bu; ciro ile karıştırılıp "rakam tutmuyor" denen yer
        burasıydı (bkz. melih-not-ciro-mutabakat.md). İkisi yan yana durunca
        fark KDV olarak okunuyor.
      */}
      <span
        className="inline-flex shrink-0 items-center font-mono tabular-nums text-muted-foreground"
        title="Müşteriden tahsil edilen toplam (KDV dahil). Panorama'nın belge raporundaki 'Net Tutar' kolonu bu rakamdır — tahsilat/borç konuşurken bunu kullanın."
      >
        {loading ? "…" : formatCurrency(summary.toplamNetCiroKdvDahil)}
        <span className="ml-1.5 font-sans text-[12px] font-normal">
          KDV dahil
        </span>
      </span>

      <Ayirac />

      {/* Bant seçiliyken tabloda gösterilen kolonun TÜM veri üzerindeki toplamı. */}
      <span
        className={cn(
          "font-mono font-medium tabular-nums",
          bandEtiketi ? "text-amber-400" : "text-foreground"
        )}
        title={
          bandEtiketi
            ? `Filtreye uyan tüm müşterilerin ${bandEtiketi} bandındaki borç toplamı`
            : "Filtreye uyan tüm müşterilerin açık bakiye toplamı"
        }
      >
        {loading ? "…" : formatCurrency(summary.toplamAcikBakiye)}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          {bandEtiketi ? `${bandEtiketi} borç` : "açık bakiye"}
        </span>
      </span>

      <Ayirac />

      <div className="flex items-center gap-x-4">
        {RISK_ORDER.map((risk) => (
          <span key={risk} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: RISK_COLORS[risk] }}
              aria-hidden
            />
            <span className="font-mono font-medium text-foreground tabular-nums">
              {loading ? "…" : formatNumber(summary.riskDagilimi[risk])}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {riskLabels[risk]}
            </span>
          </span>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-x-5 pl-5">
        <BolgeDisiCiro filters={filters} />
        <BorcTazeligi />
      </div>
    </div>
  );
}

function Ayirac() {
  return <span className="h-4 w-px shrink-0 bg-border" aria-hidden />;
}
