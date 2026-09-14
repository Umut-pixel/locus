"use client";

import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  GUNLUK_TARAMA_LIMITI,
  TARAMA_SKIP_DAYS,
  type IlOnBilgi,
  type TaramaKotasi,
} from "@/lib/potansiyel-tarama";
import { cn } from "@/lib/utils";

/**
 * Tarama onay kartı.
 *
 * Haritaya çapalanmaz (iller ülke boyunda; `CustomerDetailPanel`'in pin
 * çapası burada anlamsız) — masaüstünde ortada, mobilde güvenli alanın
 * üstünde tam genişlik.
 *
 * Kartın asıl işi KARAR-2'nin gereği: taramayı başlatmadan ÖNCE kaç ilçenin
 * taze olduğunu, kaçının koordinatsız olduğunu ve tahmini Google çağrısını
 * göstermek. Sunucunun 409/429 yanıtları da burada satır içi görünür.
 */

function sayiBicim(n: number): string {
  return new Intl.NumberFormat("tr-TR").format(n);
}

function tarihBicim(iso: string | null): string {
  if (!iso) return "hiç";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "hiç";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function TaramaOnayKarti({
  onBilgi,
  kota,
  gonderiliyor,
  hata,
  onBaslat,
  onVazgec,
  className,
}: {
  onBilgi: IlOnBilgi | null;
  kota: TaramaKotasi | null;
  gonderiliyor: boolean;
  hata: string | null;
  onBaslat: () => void;
  onVazgec: () => void;
  className?: string;
}) {
  const yukleniyor = onBilgi == null;
  const kalan = kota?.kalan ?? null;
  const kotaDoldu = kalan != null && kalan <= 0;
  const hepsiTaze = onBilgi?.uyari === "hepsi_taze";
  const kapsamYok = onBilgi?.uyari === "kapsam_yok";
  const koordinatYok = onBilgi?.uyari === "koordinat_yok";
  const baslatilamaz =
    yukleniyor ||
    gonderiliyor ||
    hepsiTaze ||
    kapsamYok ||
    koordinatYok ||
    kotaDoldu;

  return (
    <div
      className={cn(
        "pointer-events-auto w-full max-w-sm rounded-2xl border border-border/45 bg-popover/66 p-4 text-popover-foreground",
        "shadow-[0_14px_40px_-16px_rgba(0,0,0,0.55)] backdrop-blur-[24px] backdrop-saturate-150",
        className
      )}
      role="dialog"
      aria-label="Tarama onayı"
    >
      {yukleniyor ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" strokeWidth={1.75} />
          İl bilgisi okunuyor…
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight">{onBilgi.ad}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {onBilgi.ilceSayisi} ilçe
              {onBilgi.yogunIlceSayisi > 0
                ? ` · ${onBilgi.yogunIlceSayisi} yoğun`
                : ""}
            </span>
          </div>

          <dl className="mt-3 space-y-1.5 text-sm">
            {kapsamYok ? (
              <p className="text-destructive">
                Bu il henüz kapsamda değil — ilçe merkezi kaydı yok. Seed
                çalıştırılmadan taranamaz.
              </p>
            ) : koordinatYok ? (
              <p className="text-destructive">
                Bu ilin {onBilgi.koordinatsizSayisi} ilçesinin hiçbirinin
                koordinatı çözülememiş; taranacak nokta yok.
              </p>
            ) : hepsiTaze ? (
              <p className="text-destructive">
                Tüm ilçeler taze. Son tarama {tarihBicim(onBilgi.sonTarama)};{" "}
                {TARAMA_SKIP_DAYS} gün dolmadan yeni sonuç beklenmez.
              </p>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Taranacak</dt>
                  <dd className="font-medium tabular-nums">
                    {onBilgi.taranacakIlceSayisi} ilçe
                  </dd>
                </div>
                {onBilgi.tazeIlceSayisi > 0 ? (
                  <p className="text-caution">
                    {onBilgi.tazeIlceSayisi} ilçe son {TARAMA_SKIP_DAYS} günde
                    tarandı, bu turda atlanacak.
                  </p>
                ) : null}
                {onBilgi.koordinatsizSayisi > 0 ? (
                  <p className="text-caution">
                    {onBilgi.koordinatsizSayisi} ilçenin koordinatı yok,
                    taranmayacak.
                  </p>
                ) : null}
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Tahmini</dt>
                  <dd className="tabular-nums">
                    ≈{sayiBicim(onBilgi.tahminiCagri.alt)}–
                    {sayiBicim(onBilgi.tahminiCagri.ust)} Google araması
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Süre</dt>
                  <dd className="tabular-nums">
                    ~{onBilgi.tahminiSureDk.alt}–{onBilgi.tahminiSureDk.ust} dk
                  </dd>
                </div>
              </>
            )}

            {kota ? (
              <div className="flex items-baseline justify-between gap-3 border-t border-border/40 pt-1.5">
                <dt className="text-muted-foreground">Bugün kalan hak</dt>
                <dd
                  className={cn(
                    "font-medium tabular-nums",
                    kotaDoldu && "text-caution"
                  )}
                >
                  {kota.kalan}/{kota.limit ?? GUNLUK_TARAMA_LIMITI}
                </dd>
              </div>
            ) : null}
          </dl>
        </>
      )}

      {hata ? (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {hata}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onVazgec} disabled={gonderiliyor}>
          Vazgeç
        </Button>
        <Button size="sm" onClick={onBaslat} disabled={baslatilamaz}>
          {gonderiliyor ? (
            <>
              <Loader2Icon className="size-4 animate-spin" strokeWidth={1.75} />
              Başlatılıyor…
            </>
          ) : (
            "Taramayı başlat"
          )}
        </Button>
      </div>
    </div>
  );
}
