"use client";

import { AlertTriangleIcon, LoaderIcon, RouteIcon, TruckIcon, XIcon } from "lucide-react";

import type { RotaAraci, RotaDuragi } from "@/hooks/useRotaPlani";
import { dolulukHesapla, kalanKapasite, type Sofor } from "@/lib/rota/atama";
import {
  gunUzunlugu,
  saatMetni,
  sonrakiKalkis,
  varisZamani,
} from "@/lib/rota/operasyon";
import { formatKg, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Google Routes'tan dönen trafikli güzergâh özeti. */
export interface RotaBilgisi {
  saniye: number;
  metre: number;
  trafik: string;
}

interface AracKartiProps {
  arac: RotaAraci;
  /** Bu aracı sürecek şoför — kadroda karşılığı yoksa null. */
  sofor: Sofor | null;
  /** "Yarı boş çıkıyor" uyarı eşiği — tercih çubuğundan gelir. */
  dolulukEsigi: number;
  duraklar: RotaDuragi[];
  /** Kart tıklanınca havuzdaki seçili durak buraya eklenir. */
  secili: boolean;
  onSec: () => void;
  onDurakCikar: (musteriKodu: string) => void;
  onTemizle: () => void;
  /** Google Routes ile durak sırasını trafiğe göre diz. */
  onOptimize: () => void;
  optimizeEdiliyor: boolean;
  rotaBilgi: RotaBilgisi | null;
  optimizeHatasi: string | null;
}

function sureMetni(saniye: number): string {
  const dk = Math.round(saniye / 60);
  if (dk < 60) return `${dk} dk`;
  return `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
}

function yuzdeMetni(deger: number | null): string {
  if (deger == null) return "—";
  return `%${Math.round(deger)}`;
}

/**
 * Tek araç + çift doluluk barı.
 *
 * Ağırlık ve hacim AYRI gösterilir çünkü ortalama çuval 14,56 kg: 60 çuvallık
 * Kangoo hacmi dolmadan istiap haddini aşıyor. Hangi kısıt önce doluyorsa
 * "bağlayıcı" etiketi onda.
 */
export function AracKarti({
  arac,
  sofor,
  dolulukEsigi,
  duraklar,
  secili,
  onSec,
  onDurakCikar,
  onTemizle,
  onOptimize,
  optimizeEdiliyor,
  rotaBilgi,
  optimizeHatasi,
}: AracKartiProps) {
  const doluluk = dolulukHesapla(arac, duraklar);
  const kalan = kalanKapasite(arac, duraklar);

  const agirlikBaglayici = doluluk.baglayiciKisit === "agirlik";
  const kgAsim = doluluk.kgYuzde != null && doluluk.kgYuzde > 100;
  const cuvalAsim = doluluk.cuvalYuzde > 100;

  /**
   * Google yalnız SÜRÜŞ süresini veriyor. Boşaltma (durak × 15 dk) ve
   * takograf molası eklenmezse tur olduğundan kısa görünür, "bu güne sığar mı"
   * sorusu yanlış cevaplanır.
   */
  const gun = rotaBilgi
    ? gunUzunlugu({
        surusSaniye: rotaBilgi.saniye,
        durakSayisi: duraklar.length,
        takograf: arac.takograf,
      })
    : null;
  const varis = gun ? varisZamani(sonrakiKalkis(), gun.toplamSaniye) : null;

  /** Melih: araçlar dolmadan çıkmasın. Engel değil, uyarı. */
  const bagliyiciYuzde = agirlikBaglayici
    ? (doluluk.kgYuzde ?? doluluk.cuvalYuzde)
    : doluluk.cuvalYuzde;
  const dusukDoluluk =
    duraklar.length > 0 && !doluluk.asim && bagliyiciYuzde < dolulukEsigi;

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col border-b border-border transition-colors",
        secili && "bg-accent/40"
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-3.5">
        <button
          type="button"
          onClick={onSec}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-pressed={secili}
          title={
            secili
              ? "Seçili araç — havuzdan tıklanan durak buraya eklenir"
              : "Bu aracı seç"
          }
        >
          <TruckIcon
            className={cn(
              "size-3.5 shrink-0",
              doluluk.asim ? "text-destructive" : secili ? "text-amber-400" : "text-muted-foreground"
            )}
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="truncate text-[12px] font-medium tracking-[0.06em] text-foreground uppercase">
            {arac.ad}
          </span>
          {sofor ? (
            <span
              className="shrink-0 truncate text-[11.5px] text-muted-foreground"
              title={`${sofor.ad} — ${sofor.ehliyetSinifi} sınıfı ehliyet`}
            >
              {sofor.ad}
            </span>
          ) : null}
          {doluluk.asim ? (
            <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
              aşım
            </span>
          ) : null}
        </button>

        <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground tabular-nums">
          {formatNumber(duraklar.length)} durak
        </span>
        {duraklar.length >= 2 ? (
          <button
            type="button"
            onClick={onOptimize}
            disabled={optimizeEdiliyor}
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            title="Durak sırasını trafiğe göre optimize et (Google Routes)"
            aria-label={`${arac.ad} güzergâhını optimize et`}
          >
            {optimizeEdiliyor ? (
              <LoaderIcon className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
            ) : (
              <RouteIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
            )}
          </button>
        ) : null}
        {duraklar.length > 0 ? (
          <button
            type="button"
            onClick={onTemizle}
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            title="Aracı boşalt"
            aria-label={`${arac.ad} aracını boşalt`}
          >
            <XIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </header>

      <div className="flex flex-col gap-2.5 px-3.5 py-3">
        <DolulukBari
          etiket="Ağırlık"
          yuzde={doluluk.kgYuzde}
          deger={formatKg(doluluk.kg)}
          kapasite={arac.maxKg != null ? formatKg(arac.maxKg) : "tanımsız"}
          baglayici={agirlikBaglayici}
          asim={kgAsim}
          /* Ruhsat istiap haddi henüz Melih'ten teyit edilmedi */
          tahmini={!arac.maxKgTeyitli && arac.maxKg != null}
        />
        <DolulukBari
          etiket="Hacim"
          yuzde={doluluk.cuvalYuzde}
          deger={`${formatNumber(Math.round(doluluk.cuvalEsdeger))} çuval`}
          kapasite={`${formatNumber(arac.cuvalKapasite)} çuval`}
          baglayici={!agirlikBaglayici && doluluk.baglayiciKisit != null}
          asim={cuvalAsim}
          tahmini={false}
        />

        {arac.maxKg == null ? (
          <p className="flex items-start gap-1.5 text-[11.5px] text-amber-400">
            <AlertTriangleIcon className="mt-px size-3 shrink-0" strokeWidth={2} aria-hidden />
            <span>İstiap haddi girilmemiş — yalnız hacim kısıtı hesaplanıyor.</span>
          </p>
        ) : duraklar.length > 0 && !doluluk.asim ? (
          <p className="text-[11.5px] text-muted-foreground">
            {formatNumber(Math.floor(kalan.cuval))} çuval
            {kalan.kg != null ? ` / ${formatKg(kalan.kg)}` : ""} daha sığar
          </p>
        ) : null}

        {dusukDoluluk ? (
          <p className="flex items-start gap-1.5 text-[11.5px] text-amber-400">
            <AlertTriangleIcon className="mt-px size-3 shrink-0" strokeWidth={2} aria-hidden />
            <span>
              Yarı boş çıkıyor (%{Math.round(bagliyiciYuzde)}) — durak eklemeyi
              veya daha küçük araç kullanmayı düşün.
            </span>
          </p>
        ) : null}

        {rotaBilgi && gun && varis ? (
          <div className="flex flex-col gap-0.5 text-[11.5px] text-muted-foreground tabular-nums">
            <p>
              Depoya dönüşle {sureMetni(gun.toplamSaniye)} ·{" "}
              {formatNumber(Math.round(rotaBilgi.metre / 1000))} km ·{" "}
              {saatMetni(sonrakiKalkis())} → {saatMetni(varis)}
              <span className="ml-1 opacity-70">
                ({rotaBilgi.trafik === "TRAFFIC_AWARE_OPTIMAL" ? "trafik" : "trafik~"})
              </span>
            </p>
            <p className="opacity-70">
              {sureMetni(gun.surusSaniye)} sürüş +{" "}
              {sureMetni(gun.servisSaniye)} boşaltma
              {gun.molaSaniye > 0
                ? ` + ${sureMetni(gun.molaSaniye)} takograf molası`
                : ""}
            </p>
          </div>
        ) : null}

        {optimizeHatasi ? (
          <p className="flex items-start gap-1.5 text-[11.5px] text-destructive">
            <AlertTriangleIcon className="mt-px size-3 shrink-0" strokeWidth={2} aria-hidden />
            <span>{optimizeHatasi}</span>
          </p>
        ) : null}

        {doluluk.olcusuzVar ? (
          <p className="flex items-start gap-1.5 text-[11.5px] text-amber-400">
            <AlertTriangleIcon className="mt-px size-3 shrink-0" strokeWidth={2} aria-hidden />
            <span>Ölçüsü bilinmeyen ürün var — gerçek yük daha ağır olabilir.</span>
          </p>
        ) : null}
      </div>

      {duraklar.length > 0 ? (
        <ol className="divide-y divide-border/40 border-t border-border/40">
          {duraklar.map((d, i) => (
            <li
              key={d.musteriKodu}
              className="flex min-w-0 items-center gap-2 px-3.5 py-1.5"
            >
              <span className="w-4 shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                {d.unvan}
              </span>
              <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                {formatKg(d.kg)}
              </span>
              <button
                type="button"
                onClick={() => onDurakCikar(d.musteriKodu)}
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                title="Havuza geri al"
                aria-label={`${d.unvan} durağını havuza geri al`}
              >
                <XIcon className="size-3" strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function DolulukBari({
  etiket,
  yuzde,
  deger,
  kapasite,
  baglayici,
  asim,
  tahmini,
}: {
  etiket: string;
  yuzde: number | null;
  deger: string;
  kapasite: string;
  baglayici: boolean;
  asim: boolean;
  tahmini: boolean;
}) {
  const genislik = yuzde == null ? 0 : Math.min(100, Math.max(0, yuzde));

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 text-[11.5px] text-muted-foreground">{etiket}</span>
        {baglayici ? (
          <span
            className="shrink-0 rounded bg-foreground/10 px-1 text-[10.5px] text-foreground"
            title="Bu kısıt önce doluyor — aracın gerçek sınırı bu."
          >
            bağlayıcı
          </span>
        ) : null}
        {tahmini ? (
          <span
            className="shrink-0 rounded bg-amber-500/15 px-1 text-[10.5px] text-amber-400"
            title="Ruhsat istiap haddi henüz teyit edilmedi — tahmini değer."
          >
            tahmini
          </span>
        ) : null}
        <span
          className={cn(
            "ml-auto shrink-0 font-mono text-[12.5px] font-medium tabular-nums",
            asim ? "text-destructive" : "text-foreground"
          )}
        >
          {yuzdeMetni(yuzde)}
        </span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={yuzde ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${etiket} doluluğu`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            asim ? "bg-destructive" : baglayici ? "bg-amber-400" : "bg-foreground/40"
          )}
          style={{ width: `${genislik}%` }}
        />
      </div>

      <span className="text-[11px] text-muted-foreground tabular-nums">
        {deger} / {kapasite}
      </span>
    </div>
  );
}
