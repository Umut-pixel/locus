"use client";

import { useState } from "react";
import {
  ArchiveIcon,
  ChevronDownIcon,
  LoaderIcon,
  MapPinOffIcon,
  RotateCwIcon,
  TruckIcon,
  UserIcon,
} from "lucide-react";

import {
  useKayitliPlanlar,
  type KayitliGun,
  type KayitliPlan,
} from "@/hooks/useKayitliPlanlar";
import { formatKg, formatNumber } from "@/lib/format";
import { RISK_COLORS, RISK_SHORT_LABELS } from "@/lib/risk-style";
import { cn } from "@/lib/utils";

function tarihMetni(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
}

function sureMetni(saniye: number | null): string | null {
  if (saniye == null || saniye <= 0) return null;
  const dk = Math.round(saniye / 60);
  if (dk < 60) return `${dk} dk`;
  return `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
}

/**
 * Kaydedilmiş sevkiyat planları.
 *
 * ERP'de araç verisi olmadığı için (1.979 sevk belgesinin hepsi aynı sahte
 * plakada) "hangi yük hangi araçla, kim sürerek gitti" sorusunun tek cevabı
 * bu kayıtlar. Yük değerleri plan anında DONDURULMUŞ — bugünkü bekleyen
 * sipariş tablosu değişse de bu satırlar sabit kalır.
 */
export function KayitliPlanlar() {
  const { gunler, loading, error, ozet, tazele } = useKayitliPlanlar();

  if (loading && gunler.length === 0) {
    return (
      <p className="flex items-center gap-2 px-3.5 py-8 text-[13px] text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" strokeWidth={1.75} aria-hidden />
        Kayıtlı planlar yükleniyor…
      </p>
    );
  }

  if (error) {
    return (
      <p className="m-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-2 text-[12.5px] text-destructive">
        {error}
      </p>
    );
  }

  if (gunler.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <ArchiveIcon className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <p className="text-[13px] text-muted-foreground">
          Henüz kaydedilmiş plan yok.
        </p>
        <p className="max-w-sm text-[12px] text-muted-foreground opacity-80">
          Planlama sekmesinde durakları dağıtıp <b>Planı kaydet</b> deyince
          o günün yükü buraya düşer.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5">
        <span className="text-[12px] text-muted-foreground">
          Son 90 günde{" "}
          <b className="text-foreground tabular-nums">
            {formatNumber(ozet.planSayisi)}
          </b>{" "}
          araç planı ·{" "}
          <b className="text-foreground tabular-nums">
            {formatNumber(ozet.gunSayisi)}
          </b>{" "}
          gün
        </span>
        <button
          type="button"
          onClick={tazele}
          className="flex items-center gap-1 text-[11.5px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          <RotateCwIcon
            className={cn("size-3", loading && "animate-spin")}
            strokeWidth={1.75}
            aria-hidden
          />
          Yenile
        </button>
      </div>

      {gunler.map((gun) => (
        <GunKarti key={gun.planTarihi} gun={gun} />
      ))}
    </div>
  );
}

function GunKarti({ gun }: { gun: KayitliGun }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/60 bg-accent/20 px-3.5 py-2">
        <h3 className="text-[13px] font-medium text-foreground">
          {tarihMetni(gun.planTarihi)}
        </h3>
        <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
          {formatNumber(gun.planlar.length)} araç ·{" "}
          {formatNumber(gun.toplamDurak)} durak · {formatKg(Math.round(gun.toplamKg))}
        </span>
      </header>

      <div className="divide-y divide-border/40">
        {gun.planlar.map((plan) => (
          <PlanSatiri key={plan.id} plan={plan} />
        ))}
      </div>
    </section>
  );
}

function PlanSatiri({ plan }: { plan: KayitliPlan }) {
  const [acik, setAcik] = useState(false);

  const doluluk =
    plan.kgDoluluk != null && plan.cuvalDoluluk != null
      ? Math.max(plan.kgDoluluk, plan.cuvalDoluluk)
      : (plan.kgDoluluk ?? plan.cuvalDoluluk);
  const agirlikBaglayici =
    plan.kgDoluluk != null &&
    plan.cuvalDoluluk != null &&
    plan.kgDoluluk > plan.cuvalDoluluk;
  const sure = sureMetni(plan.googleSureSn);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setAcik((o) => !o)}
        aria-expanded={acik}
        className="flex min-w-0 items-center gap-2 px-3.5 py-2 text-left transition-colors hover:bg-accent/40"
      >
        <TruckIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
          {plan.aracAd}
        </span>

        <span className="flex min-w-0 shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground">
          <UserIcon className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="truncate">{plan.soforAd ?? "şoför yok"}</span>
        </span>

        <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
          {formatNumber(plan.durakSayisi)} durak
        </span>
        <span className="shrink-0 font-mono text-[11.5px] text-foreground tabular-nums">
          {formatKg(Math.round(plan.toplamKg))}
        </span>
        {doluluk != null ? (
          <span
            className="shrink-0 font-mono text-[11.5px] font-medium text-foreground tabular-nums"
            title={
              agirlikBaglayici
                ? "Ağırlık bağlayıcıydı"
                : "Hacim bağlayıcıydı"
            }
          >
            %{Math.round(doluluk)}
          </span>
        ) : null}
        {sure ? (
          <span className="hidden shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums sm:inline">
            {sure}
          </span>
        ) : null}

        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            acik && "rotate-180"
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>

      {acik ? (
        plan.duraklar.length === 0 ? (
          <p className="px-3.5 pb-2.5 text-[11.5px] text-muted-foreground">
            Bu plana ait durak kaydı yok.
          </p>
        ) : (
          <ol className="border-t border-border/30 bg-accent/10">
            {plan.duraklar.map((d) => (
              <li
                key={`${d.sira}-${d.musteriKodu}`}
                className="flex min-w-0 items-center gap-2 px-3.5 py-1.5"
              >
                <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                  {d.sira}
                </span>
                {d.riskDurumu ? (
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: RISK_COLORS[d.riskDurumu] }}
                    title={RISK_SHORT_LABELS[d.riskDurumu]}
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                  {d.unvan ?? d.musteriKodu}
                </span>
                {d.unvan == null ? (
                  <span
                    className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
                    title="Müşteri kaydı master'da bulunamadı — plan satırı korunuyor"
                  >
                    <MapPinOffIcon className="size-3" strokeWidth={2} aria-hidden />
                    kayıt yok
                  </span>
                ) : (
                  <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                    {d.ilce ?? d.sehir ?? "—"}
                  </span>
                )}
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                  {formatNumber(Math.round(d.cuvalEsdeger))} çuval
                </span>
                <span className="shrink-0 font-mono text-[11.5px] text-foreground tabular-nums">
                  {formatKg(Math.round(d.kg))}
                </span>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </div>
  );
}
