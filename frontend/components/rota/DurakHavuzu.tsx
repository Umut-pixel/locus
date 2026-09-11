"use client";

import { useMemo } from "react";

import { AlertTriangleIcon, CheckCircle2Icon, MapPinOffIcon, PackageIcon } from "lucide-react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import type { RotaDuragi } from "@/hooks/useRotaPlani";
import type { Bolge } from "@/lib/rota/bolge";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { depoyaKm } from "@/lib/depot";
import { UZAK_ESIGI_KM } from "@/lib/rota/planla";
import { HAVUZ_HEDEFI, useSurukleme } from "./surukleme";

import { bolgeRengi } from "@/lib/rota/bolge-renk";
import { BAYAT_GUN } from "@/lib/rota/operasyon";
import { formatKg, formatNumber } from "@/lib/format";
import { RISK_COLORS, RISK_SHORT_LABELS } from "@/lib/risk-style";
import { cn } from "@/lib/utils";

interface DurakHavuzuProps {
  duraklar: RotaDuragi[];
  /** Seçili araç yoksa tıklama pasif — kullanıcı önce araç seçmeli. */
  seciliAracAdi: string | null;
  onDurakEkle: (musteriKodu: string) => void;
  loading: boolean;
  /** musteriKodu → bölge. Havuz bölge başlıklarıyla gruplanır. */
  durakBolgesi: Map<string, Bolge>;
}

interface HavuzGrubu {
  ad: string;
  /** Bölgesiz grupta null — renk noktası ve `BolgeOzeti` ile eşleşme buradan. */
  kod: string | null;
  ilceler: string[];
  km: number | null;
  duraklar: RotaDuragi[];
  kg: number;
}

/** Bölgesiz kalanlar (koordinatsız) en sona. */
const BOLGESIZ = "Konumsuz";

/**
 * Henüz araca atanmamış bekleyen sipariş yükü. Sağdaki araç kartlarından biri
 * seçiliyken bir durağa tıklamak onu o araca yükler.
 */
export function DurakHavuzu({
  duraklar,
  seciliAracAdi,
  onDurakEkle,
  loading,
  durakBolgesi,
}: DurakHavuzuProps) {
  const bos = duraklar.length === 0;

  /**
   * Havuz bölgeye göre gruplanır — "hangi bölgeye hangi yük bekliyor" sorusu
   * düz bir listede okunamıyordu. Gruplar depoya uzaklığa göre sıralı:
   * yakın işler üstte, uzak hatlar altta.
   */
  const gruplar = useMemo<HavuzGrubu[]>(() => {
    const m = new Map<string, HavuzGrubu>();
    for (const d of duraklar) {
      const b = durakBolgesi.get(d.musteriKodu);
      const ad = b?.ad ?? BOLGESIZ;
      const grup = m.get(ad) ?? {
        ad,
        kod: b?.kod ?? null,
        ilceler: b?.ilceler ?? [],
        km: b?.depoyaKm ?? null,
        duraklar: [],
        kg: 0,
      };
      grup.duraklar.push(d);
      grup.kg += d.kg;
      m.set(ad, grup);
    }
    return [...m.values()].sort((a, b) => {
      if (a.km == null) return 1;
      if (b.km == null) return -1;
      return a.km - b.km;
    });
  }, [duraklar, durakBolgesi]);
  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    duraklar.length
  );

  const { durum, basla, suruklendiMi, etkin } = useSurukleme();
  /** Araçtan havuza geri sürükleme sırasında havuz hedef olarak parlıyor. */
  const havuzHedefte = durum?.hedefKod === HAVUZ_HEDEFI;

  const toplamKg = duraklar.reduce((t, d) => t + d.kg, 0);

  return (
    <section
      ref={wrapperRef}
      // Araçtan geri sürüklenen durak buraya bırakılıyor.
      data-birak-hedef={HAVUZ_HEDEFI}
      className={cn(
        // Kenarlık sarmalayıcı kartta — burada `lg:border-r` eski yan yana
        // düzenden kalmıştı ve yuvarlak kartın içinde başıboş bir çizgi çiziyordu.
        "relative flex min-w-0 flex-col overflow-hidden transition-colors",
        havuzHedefte && "bg-accent/40 ring-2 ring-inset ring-foreground/30"
      )}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <PackageIcon
            className={cn("size-3.5 shrink-0", !bos && "text-caution")}
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="truncate">Havuzda kalan</span>
        </h2>
        {!bos ? (
          <span className="shrink-0 font-mono text-[12.5px] font-medium text-foreground tabular-nums">
            {formatKg(Math.round(toplamKg))}
          </span>
        ) : null}
      </header>

      <p className="flex h-9 shrink-0 items-center border-b border-border/60 px-3.5 text-[12px] text-muted-foreground">
        <span className="truncate">
          {havuzHedefte
            ? "Bırak → durak havuza geri döner"
            : seciliAracAdi
              ? `Tıklanan durak → ${seciliAracAdi}`
              : etkin
                ? "Bir araç seçin ya da durağı araç kartına sürükleyin"
                : "Yüklemek için önce bir araç kartı seçin"}
        </span>
      </p>

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto transition-opacity",
          loading && "opacity-40"
        )}
      >
        {bos ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <CheckCircle2Icon
              className="size-6 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-[13px] text-muted-foreground">
              Havuz boş — bekleyen yükün tamamı araçlara dağıtıldı.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {gruplar.map((g) => (
              <li key={g.ad}>
                <div
                  className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-border/60 bg-muted/40 px-3.5 py-1.5 backdrop-blur-sm"
                  title={
                    g.ilceler.length > 0
                      ? `İlçeler: ${g.ilceler.join(", ")}`
                      : "İlçe bilgisi olmayan duraklar koordinat hücresine göre kümelendi"
                  }
                >
                  {/*
                    Bölge rengi — liste hep aynı gri metindi, hangi siparişin
                    hangi bölgeye ait olduğu yalnız okuyarak anlaşılıyordu.
                    Renk `BolgeOzeti` ve araç kartlarındaki bölge rozetleriyle
                    AYNI (bkz. `bolgeRengi`), ekranlar arası takip edilebilsin.
                  */}
                  {g.kod ? (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: bolgeRengi(g.kod) }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                    {g.ad}
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                    {formatNumber(g.duraklar.length)} durak ·{" "}
                    {formatKg(Math.round(g.kg))}
                    {g.km != null ? ` · ${Math.round(g.km)} km` : ""}
                  </span>
                </div>
                <ul className="divide-y divide-border/50">
                  {g.duraklar.map((d) => (
                    <DurakSatiri
                      key={d.musteriKodu}
                      durak={d}
                      pasif={seciliAracAdi == null}
                      suruklenebilir={etkin}
                      suruluyor={durum?.musteriKodu === d.musteriKodu}
                      onSuruklemeBasla={(e, durak) =>
                        basla(e, { durak, kaynakAracKod: null })
                      }
                      onSec={() => {
                        // pointerup'tan sonra gelen click sürüklemeyi tekrar
                        // uygulamasın diye yutuluyor.
                        if (suruklendiMi()) return;
                        onDurakEkle(d.musteriKodu);
                      }}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ScrollBottomFade />
    </section>
  );
}

function DurakSatiri({
  durak,
  pasif,
  suruklenebilir,
  suruluyor,
  onSuruklemeBasla,
  onSec,
}: {
  durak: RotaDuragi;
  pasif: boolean;
  suruklenebilir: boolean;
  /** Şu an sürükleniyor — satır yerinde soluk kalır, önizleme imleci takip eder. */
  suruluyor: boolean;
  onSuruklemeBasla: (event: React.PointerEvent, durak: RotaDuragi) => void;
  onSec: () => void;
}) {
  const konumsuz = durak.lat == null || durak.lon == null;
  const uzaklikKm =
    durak.lat != null && durak.lon != null
      ? depoyaKm({ lat: durak.lat, lon: durak.lon })
      : null;

  // Koordinatsız durak plana giremez, sürüklenmesinin de anlamı yok.
  const tutulabilir = suruklenebilir && !konumsuz;

  return (
    <li
      className={cn(
        "relative bg-background transition-opacity",
        suruluyor && "opacity-40"
      )}
    >
      {/*
        `disabled` DEĞİL, `aria-disabled`: dokunmatikte sürükleme kapalı olduğu
        için araç seçilmeden önce havuzun TAMAMI devre dışı kalıyordu — hem ilk
        dokunuş boşa gidiyor hem de liste sekme sırasından tümüyle düşüyordu.
        Artık satır odaklanabilir, tıklama no-op ve neden `title`'da.
      */}
      <button
        type="button"
        onPointerDown={tutulabilir ? (e) => onSuruklemeBasla(e, durak) : undefined}
        onClick={pasif || konumsuz ? undefined : onSec}
        aria-disabled={pasif || konumsuz}
        className={cn(
          "flex w-full min-w-0 flex-col gap-1 px-3.5 py-2 text-left transition-colors",
          !pasif && !konumsuz && "hover:bg-accent/50",
          tutulabilir && "cursor-grab active:cursor-grabbing",
          !tutulabilir && (pasif || konumsuz) && "cursor-default",
          (pasif || konumsuz) && "opacity-60"
        )}
        title={
          konumsuz
            ? "Koordinatı yok — haritaya konamaz, plana giremez"
            : pasif
              ? `${durak.unvan} — önce bir araç kartı seçin ya da durağı karta sürükleyin`
              : `${durak.unvan} durağını seçili araca ekle`
        }
      >
        <div className="flex min-w-0 items-baseline gap-2">
          {durak.riskDurumu ? (
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: RISK_COLORS[durak.riskDurumu] }}
              title={RISK_SHORT_LABELS[durak.riskDurumu]}
              aria-label={RISK_SHORT_LABELS[durak.riskDurumu]}
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
            {durak.unvan}
          </span>
          <span className="shrink-0 font-mono text-[12.5px] font-medium text-foreground tabular-nums">
            {formatKg(Math.round(durak.kg))}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground">
          <span className="min-w-0 truncate">{durak.ilce ?? durak.sehir ?? "—"}</span>
          <span className="shrink-0 tabular-nums">
            {formatNumber(Math.round(durak.cuvalEsdeger))} çuval
          </span>
          {uzaklikKm != null ? (
            <span
              className={cn(
                "shrink-0 tabular-nums",
                uzaklikKm >= UZAK_ESIGI_KM && "text-caution"
              )}
              title={
                uzaklikKm >= UZAK_ESIGI_KM
                  ? "Bölge dışı — sipariş birikince ayrı araçla gidiyor"
                  : "Depoya kuş uçuşu mesafe"
              }
            >
              {formatNumber(Math.round(uzaklikKm))} km
            </span>
          ) : null}
          {durak.yasGun != null && durak.yasGun >= 1 ? (
            <span
              className={cn(
                "shrink-0 tabular-nums",
                durak.yasGun >= BAYAT_GUN && "text-caution"
              )}
              title={
                durak.yasGun >= BAYAT_GUN
                  ? `En eski siparişi ${durak.yasGun} günlük — hâlâ geçerli mi kontrol edin`
                  : "En eski bekleyen siparişin yaşı"
              }
            >
              {formatNumber(durak.yasGun)} günlük
            </span>
          ) : null}
          {konumsuz ? (
            <span className="flex shrink-0 items-center gap-1 text-destructive">
              <MapPinOffIcon className="size-3" strokeWidth={2} aria-hidden />
              konum yok
            </span>
          ) : null}
          {durak.olcusuzSatir > 0 ? (
            <span
              className="flex shrink-0 items-center gap-1 text-caution"
              title={`${durak.olcusuzSatir} satırın ölçüsü bilinmiyor — yük olduğundan az görünüyor.`}
            >
              <AlertTriangleIcon className="size-3" strokeWidth={2} aria-hidden />
              ölçüsüz
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}
