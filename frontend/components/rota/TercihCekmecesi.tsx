"use client";

import { useState } from "react";
import { AlertTriangleIcon, PencilIcon, SlidersHorizontalIcon } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SegmentedSwitch } from "@/components/ui/segmented-switch";
import {
  GUN_PENCERELERI,
  STRATEJILER,
  type Tercihler,
} from "@/lib/rota/tercihler";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TercihCekmecesiProps {
  tercihler: Tercihler;
  onDegis: (yeni: Partial<Tercihler>) => void;
  /** Filodaki aktif araç sayısı. */
  aracSayisi: number;
  /** Otomatik dağıtımın bugün kullandığı araç sayısı. */
  otomatikAracSayisi: number;
  /** Aktif şoför sayısı — otomatik dağıtım bundan fazla araç kullanamaz. */
  soforSayisi: number;
  /** Filo ve kadro düzenleme panelini aç. */
  onFiloDuzenle: () => void;
  loading: boolean;
}

const ESIK_SECENEKLERI = [50, 60, 70, 80, 90] as const;

/** `gunPenceresi` (number | null) ↔ SegmentedSwitch'in string değeri. */
const HEPSI = "hepsi";
const pencereDegeri = (p: number | null) => (p == null ? HEPSI : String(p));
const pencereEtiketi = (p: number | null) =>
  GUN_PENCERELERI.find((x) => x.deger === p)?.etiket ?? "—";

/**
 * Planlama tercihleri — ÇEKMECEDE.
 *
 * Eskiden bunlar iş alanının üstünde, tam genişlik, sürekli açık bir şeritti:
 * 13 segment butonu, üçü 4'ten fazla seçenekli. Oysa hepsi `localStorage`'a
 * yazılıyor, yani uygulama kendisi bunların "kur ve unut" olduğunu söylüyor.
 * Şerit yerine şimdi tek bir özet düğme var; asıl kontroller içeride.
 *
 * "Dağıtım" (strateji) grubu BURADA YOK: `EtkiPaneli` aynı üç seçeneği
 * ölçülmüş sonucuyla birlikte sunuyor ("Bölge %71 · 412 km"). İki ayrı yerde
 * aynı ayarı sunmak, üstelik biri sonucu göstermeden, gereksiz bir kopyaydı.
 */
export function TercihCekmecesi({
  tercihler,
  onDegis,
  aracSayisi,
  otomatikAracSayisi,
  soforSayisi,
  onFiloDuzenle,
  loading,
}: TercihCekmecesiProps) {
  const [acik, setAcik] = useState(false);
  const bolgeModu = tercihler.strateji === "bolge";
  const stratejiAdi =
    STRATEJILER.find((s) => s.deger === tercihler.strateji)?.etiket ??
    tercihler.strateji;
  /** Panorama'nın kendi penceresi 9 ay — "Hepsi" zombi siparişi içeri alır. */
  const pencereAcik = tercihler.gunPenceresi == null;

  return (
    <Sheet open={acik} onOpenChange={setAcik}>
      <SheetTrigger
        render={
          <button
            type="button"
            disabled={loading}
            title="Sipariş yaşı, hedef doluluk, uzak bölge ve filo ayarları"
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            )}
          />
        }
      >
        <SlidersHorizontalIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="hidden sm:inline">Tercihler</span>
        <span className="text-foreground">
          {stratejiAdi} · {pencereEtiketi(tercihler.gunPenceresi)} · %
          {tercihler.dolulukEsigi}
        </span>
        {pencereAcik ? (
          <AlertTriangleIcon
            className="size-3 shrink-0 text-caution"
            strokeWidth={2}
            aria-label="Sipariş yaşı sınırsız"
          />
        ) : null}
      </SheetTrigger>

      <SheetContent side="right" className="gap-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Planlama tercihleri</SheetTitle>
          <SheetDescription>
            Bu ayarlar tarayıcıda saklanır; her açılışta yeniden kurmanız
            gerekmez. Dağıtım stratejisi araç kartlarının üstündeki etki
            şeridinden — orada her seçeneğin ölçülmüş sonucu da görünüyor.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-6">
          <Ayar
            baslik="Sipariş yaşı"
            aciklama="Bekleyen yük havuzuna kaç günlük sipariş girsin."
          >
            <SegmentedSwitch
              ariaLabel="Sipariş yaşı"
              value={pencereDegeri(tercihler.gunPenceresi)}
              onChange={(v) =>
                onDegis({ gunPenceresi: v === HEPSI ? null : Number(v) })
              }
              options={GUN_PENCERELERI.map((p) => ({
                value: pencereDegeri(p.deger),
                label: p.etiket,
                title:
                  p.deger == null
                    ? "Panorama ne diyorsa hepsi — aylardır bekleyen sipariş de dahil"
                    : `Son ${p.deger} gün içinde girilen siparişler`,
              }))}
            />
            {pencereAcik ? (
              <p className="flex items-start gap-1.5 text-[11.5px] text-caution">
                <AlertTriangleIcon
                  className="mt-px size-3 shrink-0"
                  strokeWidth={2}
                  aria-hidden
                />
                <span>
                  Panorama&apos;nın kendi penceresi 9 ay. &quot;Hepsi&quot;
                  seçiliyken aylardır bekleyen siparişler de bugünkü havuza ve
                  toplam tonaja giriyor.
                </span>
              </p>
            ) : null}
          </Ayar>

          <Ayar
            baslik="Hedef doluluk"
            aciklama={'Bu yüzdenin altında kalan araç "yarı boş çıkıyor" uyarısı alır.'}
          >
            <SegmentedSwitch
              ariaLabel="Hedef doluluk"
              value={String(tercihler.dolulukEsigi)}
              onChange={(v) => onDegis({ dolulukEsigi: Number(v) })}
              options={ESIK_SECENEKLERI.map((e) => ({
                value: String(e),
                label: `%${e}`,
              }))}
            />
          </Ayar>

          <Ayar
            baslik="Uzak bölge"
            aciklama="Uzak duraklar şehir içi turla aynı araca binsin mi."
          >
            {bolgeModu ? (
              // Bölge stratejisinde uzak ayırma YAPININ İÇİNDE: uzak bantlar
              // zaten ayrı tur oluyor. Eskiden burada etiketli ama işlevsiz bir
              // kontrol grubu duruyordu; artık yalnız açıklama var.
              <p className="text-[12px] text-muted-foreground">
                Bölge stratejisinde uzak hatlar zaten ayrı tur oluyor ve en
                uzaktan başlayarak araç alıyor — ayrı bir ayar gerekmiyor.
              </p>
            ) : (
              <>
                <SegmentedSwitch
                  ariaLabel="Uzak bölge"
                  value={tercihler.uzakAyir ? "ayri" : "karisik"}
                  onChange={(v) => onDegis({ uzakAyir: v === "ayri" })}
                  options={[
                    {
                      value: "ayri",
                      label: "Ayrı tur (önerilen)",
                      title:
                        "Uzak duraklar önce ayrı bir araca yüklenir — Melih'in tarif ettiği işleyiş",
                    },
                    {
                      value: "karisik",
                      label: "Karışık",
                      title:
                        "Uzak duraklar şehir içi turla aynı araca binebilir — bir araç 20 km ile 400 km'yi birlikte taşıyabilir",
                    },
                  ]}
                />
                {!tercihler.uzakAyir ? (
                  <p className="flex items-start gap-1.5 text-[11.5px] text-caution">
                    <AlertTriangleIcon
                      className="mt-px size-3 shrink-0"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span>
                      &quot;Karışık&quot;te bir araç şehir içi turla birlikte
                      çok uzak bir durağı da alabilir (ör. İzmir içi + başka
                      şehir aynı araçta). Aksi gerekmedikçe &quot;Ayrı
                      tur&quot; kalsın.
                    </span>
                  </p>
                ) : null}
              </>
            )}
          </Ayar>

          <Ayar
            baslik="Filo ve kadro"
            aciklama="Otomatik dağıtım yükü karşılayan en küçük filoyu seçer ve şoför sayısını aşamaz. Kullanılmayan araçlar kilitli değil — kartına sürükleyerek elle yük koyabilirsiniz."
          >
            <p className="text-[12.5px] text-foreground">
              <span className="font-mono tabular-nums">
                {formatNumber(otomatikAracSayisi)}/{formatNumber(aracSayisi)}
              </span>{" "}
              araç ·{" "}
              <span className="font-mono tabular-nums">
                {formatNumber(soforSayisi)}
              </span>{" "}
              şoför
            </p>
            <button
              type="button"
              onClick={() => {
                setAcik(false);
                onFiloDuzenle();
              }}
              className="flex w-fit items-center gap-1.5 rounded border border-border px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-accent"
            >
              <PencilIcon className="size-3" strokeWidth={1.75} aria-hidden />
              Şoför ve kapasiteleri düzenle
            </button>
          </Ayar>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Ayar({
  baslik,
  aciklama,
  children,
}: {
  baslik: string;
  aciklama: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          {baslik}
        </h3>
        {/*
          Açıklama görünür metin — eskiden bu cümleler yalnız `title`
          içindeydi, yani dokunmatikte ve ekran okuyucuda hiç okunmuyordu.
        */}
        <p className="text-[11.5px] text-muted-foreground">{aciklama}</p>
      </div>
      {children}
    </section>
  );
}
