"use client";

import { PencilIcon, SlidersHorizontalIcon } from "lucide-react";

import type { RotaAraci } from "@/hooks/useRotaPlani";
import type { Sofor } from "@/lib/rota/atama";
import {
  GUN_PENCERELERI,
  STRATEJILER,
  type Strateji,
  type Tercihler,
} from "@/lib/rota/tercihler";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TercihCubuguProps {
  tercihler: Tercihler;
  onDegis: (yeni: Partial<Tercihler>) => void;
  /** Filonun tamamı — elle araç seçimi için. */
  araclar: RotaAraci[];
  /** Sistemin seçtiği filo (aracKodlari null iken geçerli olan). */
  otomatikSecim: RotaAraci[];
  atamalar: Record<string, Sofor>;
  /** Şoför sınırı — bundan fazla araç elle seçilemez. */
  soforSayisi: number;
  /** Filo ve kadro düzenleme panelini aç. */
  onFiloDuzenle: () => void;
  loading: boolean;
}

const ESIK_SECENEKLERI = [50, 60, 70, 80, 90];

/**
 * Planlama tercihleri. Her seçimin etkisi `EtkiPaneli`'nde ölçülüp gösterilir —
 * "daha küçük araç kullan" uyarısını görüp bir şey yapamamak yerine burada
 * doğrudan denenebiliyor.
 */
export function TercihCubugu({
  tercihler,
  onDegis,
  araclar,
  otomatikSecim,
  atamalar,
  soforSayisi,
  onFiloDuzenle,
  loading,
}: TercihCubuguProps) {
  const otomatik = tercihler.aracKodlari == null;
  const secili = new Set(
    otomatik ? otomatikSecim.map((a) => a.kod) : tercihler.aracKodlari
  );

  const aracDegis = (kod: string) => {
    const sonraki = new Set(secili);
    if (sonraki.has(kod)) sonraki.delete(kod);
    else sonraki.add(kod);
    onDegis({ aracKodlari: [...sonraki] });
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-border px-3.5 py-2.5 transition-opacity",
        loading && "opacity-40"
      )}
    >
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
        <SlidersHorizontalIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
        Tercihler
      </span>

      {/* Tarih penceresi — havuza kaç günlük sipariş girsin */}
      <Grup etiket="Sipariş yaşı">
        {GUN_PENCERELERI.map((p) => (
          <Secenek
            key={p.etiket}
            secili={tercihler.gunPenceresi === p.deger}
            onClick={() => onDegis({ gunPenceresi: p.deger })}
            title={
              p.deger == null
                ? "Panorama ne diyorsa hepsi — aylardır bekleyen sipariş de dahil"
                : `Son ${p.deger} gün içinde girilen siparişler`
            }
          >
            {p.etiket}
          </Secenek>
        ))}
      </Grup>

      {/* Dağıtım stratejisi */}
      <Grup etiket="Dağıtım">
        {STRATEJILER.map((s) => (
          <Secenek
            key={s.deger}
            secili={tercihler.strateji === s.deger}
            onClick={() => onDegis({ strateji: s.deger as Strateji })}
            title={s.aciklama}
          >
            {s.etiket}
          </Secenek>
        ))}
      </Grup>

      {/* Hedef doluluk eşiği */}
      <Grup etiket="Hedef doluluk">
        {ESIK_SECENEKLERI.map((e) => (
          <Secenek
            key={e}
            secili={tercihler.dolulukEsigi === e}
            onClick={() => onDegis({ dolulukEsigi: e })}
            title={`Bu yüzdenin altında kalan araç "yarı boş çıkıyor" uyarısı alır`}
          >
            %{e}
          </Secenek>
        ))}
      </Grup>

      {/* Uzak bölge ayırma */}
      <Grup etiket="Uzak bölge">
        <Secenek
          secili={!tercihler.uzakAyir}
          onClick={() => onDegis({ uzakAyir: false })}
          title="Uzak duraklar şehir içi turla aynı araca binebilir"
        >
          Karışık
        </Secenek>
        <Secenek
          secili={tercihler.uzakAyir}
          onClick={() => onDegis({ uzakAyir: true })}
          title="Uzak duraklar önce ayrı bir araca yüklenir — Melih'in tarif ettiği işleyiş"
        >
          Ayrı tur
        </Secenek>
      </Grup>

      {/* Elle araç seçimi */}
      <Grup
        etiket={`Araçlar (${formatNumber(secili.size)}/${formatNumber(soforSayisi)} şoför)`}
      >
        {araclar.map((a) => {
          const sofor = atamalar[a.kod];
          return (
            <Secenek
              key={a.kod}
              secili={secili.has(a.kod)}
              onClick={() => aracDegis(a.kod)}
              title={
                sofor
                  ? `${a.ad} — ${sofor.ad}`
                  : `${a.ad} — bu seçimde şoför düşmüyor`
              }
            >
              {a.ad.replace(/^(Renault|Ford|Isuzu)\s+/, "")}
            </Secenek>
          );
        })}
        {!otomatik ? (
          <button
            type="button"
            onClick={() => onDegis({ aracKodlari: null })}
            className="ml-1 shrink-0 text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            otomatiğe dön
          </button>
        ) : null}
      </Grup>

      <button
        type="button"
        onClick={onFiloDuzenle}
        className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        title="Şoför adlarını, kapasiteleri ve istiap hadlerini düzenle"
      >
        <PencilIcon className="size-3" strokeWidth={1.75} aria-hidden />
        Filo ve kadro
      </button>
    </div>
  );
}

function Grup({
  etiket,
  children,
}: {
  etiket: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-[11.5px] text-muted-foreground">
        {etiket}
      </span>
      <div className="flex shrink-0 items-center gap-0.5 rounded border border-border/70 p-0.5">
        {children}
      </div>
    </div>
  );
}

function Secenek({
  secili,
  onClick,
  title,
  children,
}: {
  secili: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={secili}
      title={title}
      className={cn(
        "shrink-0 rounded-sm px-1.5 py-0.5 text-[11.5px] whitespace-nowrap transition-colors",
        secili
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
