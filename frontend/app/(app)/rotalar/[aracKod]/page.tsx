"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  LoaderIcon,
  MapPinIcon,
  PlusIcon,
  RouteIcon,
  SatelliteDishIcon,
  UserIcon,
  XIcon,
} from "lucide-react";

import { PaletIzgarasi } from "@/components/rota/PaletIzgarasi";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DEPOT } from "@/lib/depot";
import { formatKg, formatNumber } from "@/lib/format";
import { dolulukHesapla, surebilirMi } from "@/lib/rota/atama";
import { type Bolge } from "@/lib/rota/bolge";
import { bolgeRengi } from "@/lib/rota/bolge-renk";
import {
  BAYAT_GUN,
  gunUzunlugu,
  saatMetni,
  sonrakiKalkis,
  varisZamani,
} from "@/lib/rota/operasyon";
import { RISK_COLORS, RISK_SHORT_LABELS } from "@/lib/risk-style";
import { cn } from "@/lib/utils";
import type { RotaDuragi } from "@/hooks/useRotaPlani";

import { useRotaPlaniBaglami } from "../RotaPlaniProvider";

/**
 * Yük detayı — bir aracın BUGÜNKÜ planı.
 *
 * Kaydedilmiş plan geçmişi değil; üzerinde çalışılan taslak. Düzenleme burada
 * yapılıyor, taslak `RotaPlaniProvider`'da yaşadığı için ekranlar arası
 * geçişte kaybolmuyor.
 */
export default function YukDetayiSayfasi({
  params,
}: {
  params: Promise<{ aracKod: string }>;
}) {
  const { aracKod } = use(params);
  const {
    loading,
    soforler,
    aracBul,
    aracDuraklari,
    havuz,
    bolgeler,
    durakBolgesi,
    aracSoforu,
    soforSabitle,
    soforununAracKodu,
    tercihler,
    durakEkle,
    durakCikar,
    aracTemizle,
    optimizeEt,
    optimizeEdilenler,
    rotaBilgileri,
    optimizeHatalari,
  } = useRotaPlaniBaglami();

  const [vurgulanan, setVurgulanan] = useState<string | null>(null);
  const [soforDrawerAcik, setSoforDrawerAcik] = useState(false);

  const arac = aracBul(aracKod);
  const duraklar = aracDuraklari(aracKod);
  const sofor = aracSoforu(aracKod);
  const rotaBilgi = rotaBilgileri[aracKod] ?? null;

  const doluluk = useMemo(
    () => (arac ? dolulukHesapla(arac, duraklar) : null),
    [arac, duraklar]
  );

  const gun = useMemo(
    () =>
      rotaBilgi && arac
        ? gunUzunlugu({
            surusSaniye: rotaBilgi.saniye,
            durakSayisi: duraklar.length,
            takograf: arac.takograf,
          })
        : null,
    [rotaBilgi, arac, duraklar.length]
  );

  /**
   * Havuzu (bu araca atanabilecek bekleyen siparişler) bölgeye göre kümeler —
   * `bolgeler`/`durakBolgesi` haritanın "Bölgeler" sekmesiyle AYNI kümeleme
   * (bkz. RotaPlaniProvider), ekranlar arası tutarlı kalsın diye tekrar
   * hesaplanmıyor. Koordinatsız durak hiçbir bölgeye giremez (`bolge.ts`) —
   * onlar "Bölgesiz" grubunda kalır, havuzdan hiç düşmezler.
   */
  const havuzGruplari = useMemo(() => {
    const gruplar = new Map<string, { bolge: Bolge | null; duraklar: RotaDuragi[] }>();
    for (const d of havuz) {
      const bolge = durakBolgesi.get(d.musteriKodu) ?? null;
      const anahtar = bolge?.kod ?? "";
      const mevcut = gruplar.get(anahtar);
      if (mevcut) mevcut.duraklar.push(d);
      else gruplar.set(anahtar, { bolge, duraklar: [d] });
    }
    // Bölgeler dizisindeki sırayla (haritadaki Bölgeler listesiyle aynı sıra),
    // sonra bölgesizler en sona.
    const sirali: { bolge: Bolge | null; duraklar: RotaDuragi[] }[] = [];
    for (const b of bolgeler) {
      const grup = gruplar.get(b.kod);
      if (grup) sirali.push(grup);
    }
    const bolgesiz = gruplar.get("");
    if (bolgesiz) sirali.push(bolgesiz);
    return sirali;
  }, [havuz, bolgeler, durakBolgesi]);

  /**
   * Şoför seçici — ehliyeti bu aracı KESİNLİKLE süremeyenler (fiziken imkansız)
   * sona atılır ve devre dışı bırakılır; başka bir araçta görevli olanlar
   * yalnız UYARILIR, engellenmez — hangi şoförü nereye kaydıracağına sevkiyatçı
   * karar verir (bkz. `soforSabitle` yorumundaki gerekçe).
   */
  const soforSecenekleri = useMemo(() => {
    if (!arac) return [];
    return soforler
      .map((s) => {
        const uygunMu = surebilirMi(s, arac);
        const digerAracKod = soforununAracKodu(s.kod);
        const mesgul = digerAracKod != null && digerAracKod !== aracKod;
        return {
          sofor: s,
          uygunMu,
          mesgul,
          digerAracAdi: mesgul ? (aracBul(digerAracKod!)?.ad ?? digerAracKod) : null,
        };
      })
      .sort((a, b) => {
        if (a.uygunMu !== b.uygunMu) return a.uygunMu ? -1 : 1;
        if (a.mesgul !== b.mesgul) return a.mesgul ? 1 : -1;
        return a.sofor.ad.localeCompare(b.sofor.ad, "tr");
      });
  }, [arac, soforler, soforununAracKodu, aracKod, aracBul]);

  if (!arac) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[13px] text-muted-foreground">
            {loading ? "Filo yükleniyor…" : `"${aracKod}" kodlu araç bulunamadı.`}
          </p>
          <Link
            href="/rotalar"
            className="text-[12.5px] text-foreground underline-offset-2 hover:underline"
          >
            Planlamaya dön
          </Link>
        </div>
      </div>
    );
  }

  const kalkis = sonrakiKalkis();
  const varis = gun ? varisZamani(kalkis, gun.toplamSaniye) : null;
  const agirlikBaglayici = doluluk?.baglayiciKisit === "agirlik";
  const baglayiciYuzde = agirlikBaglayici
    ? (doluluk?.kgYuzde ?? 0)
    : (doluluk?.cuvalYuzde ?? 0);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <Link
          href="/rotalar"
          className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" strokeWidth={1.75} aria-hidden />
          <span className="hidden sm:inline">Planlama</span>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
          {arac.ad} · yük detayı
        </h1>
        {doluluk?.asim ? (
          <span className="shrink-0 rounded bg-destructive/15 px-2 py-0.5 text-[11.5px] font-medium text-destructive">
            kapasite aşımı
          </span>
        ) : null}
        {duraklar.length >= 2 ? (
          <button
            type="button"
            onClick={() => void optimizeEt(aracKod)}
            disabled={optimizeEdilenler.includes(aracKod)}
            className="flex shrink-0 items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            {optimizeEdilenler.includes(aracKod) ? (
              <LoaderIcon className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
            ) : (
              <RouteIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
            )}
            Rotayı optimize et
          </button>
        ) : null}
        <Link
          href="/rotalar/harita"
          className="flex shrink-0 items-center gap-1.5 rounded bg-foreground px-2.5 py-1.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90"
        >
          <MapPinIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
          Haritada gör
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-px bg-border lg:grid-cols-[20rem_1fr]">
          {/* Sol kolon: araç bilgisi + kapasite + günlük */}
          <div className="flex flex-col gap-px bg-border">
            <Kart baslik="Araç bilgisi">
              <Sheet open={soforDrawerAcik} onOpenChange={setSoforDrawerAcik}>
                <SheetTrigger
                  render={
                    <button
                      type="button"
                      className="-m-1 flex items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-accent/50"
                    />
                  }
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
                    <UserIcon className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] text-muted-foreground">Şoför</p>
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {sofor?.ad ?? "Atanmadı"}
                    </p>
                  </div>
                  {sofor ? (
                    <span
                      className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                      title={
                        sofor.ehliyetSinifi === "C"
                          ? "C ehliyeti — tüm araçlar"
                          : "B ehliyeti — Kangoo ve Transit"
                      }
                    >
                      {sofor.ehliyetSinifi}
                    </span>
                  ) : null}
                  <ChevronRightIcon
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-sm">
                  <SheetHeader>
                    <SheetTitle>Şoför seç</SheetTitle>
                    <SheetDescription>
                      {arac.ad} için — ehliyeti uygun olmayan ve başka araçta
                      görevli şoförler işaretli görünür
                    </SheetDescription>
                  </SheetHeader>
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 pb-4">
                    <button
                      type="button"
                      onClick={() => {
                        soforSabitle(aracKod, null);
                        setSoforDrawerAcik(false);
                      }}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        !sofor
                          ? "border-foreground/30 bg-accent/40"
                          : "border-border hover:bg-accent/30"
                      )}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent">
                        <XIcon className="size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] text-foreground">Atanmadı</span>
                      {!sofor ? (
                        <CheckIcon className="size-4 shrink-0 text-foreground" strokeWidth={2} aria-hidden />
                      ) : null}
                    </button>

                    {soforSecenekleri.map(({ sofor: s, uygunMu, mesgul, digerAracAdi }) => {
                      const secili = sofor?.kod === s.kod;
                      return (
                        <button
                          key={s.kod}
                          type="button"
                          disabled={!uygunMu}
                          onClick={() => {
                            soforSabitle(aracKod, s.kod);
                            setSoforDrawerAcik(false);
                          }}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                            secili
                              ? "border-foreground/30 bg-accent/40"
                              : "border-border hover:bg-accent/30",
                            !uygunMu && "cursor-not-allowed opacity-40 hover:bg-transparent"
                          )}
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent">
                            <UserIcon className="size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] text-foreground">{s.ad}</p>
                            {!uygunMu ? (
                              <p className="text-[11px] text-muted-foreground">
                                Bu aracı süremez (ehliyet {s.ehliyetSinifi})
                              </p>
                            ) : mesgul ? (
                              <p className="text-[11px] text-caution">{digerAracAdi} aracında görevli</p>
                            ) : null}
                          </div>
                          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {s.ehliyetSinifi}
                          </span>
                          {secili ? (
                            <CheckIcon className="size-4 shrink-0 text-foreground" strokeWidth={2} aria-hidden />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </SheetContent>
              </Sheet>

              <dl className="grid grid-cols-3 gap-2 border-t border-border/60 pt-2.5">
                <Alan etiket="Durak" deger={formatNumber(duraklar.length)} />
                <Alan etiket="Palet gözü" deger={formatNumber(arac.paletKapasite ?? 0)} />
                <Alan etiket="Takograf" deger={arac.takograf ? "var" : "yok"} />
              </dl>

              <div className="flex items-center gap-2 border-t border-border/60 pt-2.5 text-[12px]">
                <span className="min-w-0 truncate text-muted-foreground">
                  {DEPOT.label}
                </span>
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="shrink-0 font-mono text-foreground tabular-nums">
                  {saatMetni(kalkis)}
                  {varis ? ` → ${saatMetni(varis)}` : ""}
                </span>
              </div>
            </Kart>

            <Kart baslik="Kapasite ve yük">
              {doluluk ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="font-sans text-[2rem] leading-none font-semibold text-foreground">
                      %{Math.round(baglayiciYuzde)}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {agirlikBaglayici ? "ağırlık bağlayıcı" : "hacim bağlayıcı"}
                    </span>
                  </div>
                  <Bar
                    etiket="Ağırlık"
                    yuzde={doluluk.kgYuzde}
                    deger={formatKg(doluluk.kg)}
                    kapasite={arac.maxKg != null ? formatKg(arac.maxKg) : "tanımsız"}
                    baglayici={agirlikBaglayici}
                  />
                  <Bar
                    etiket="Hacim"
                    yuzde={doluluk.cuvalYuzde}
                    deger={`${formatNumber(Math.round(doluluk.cuvalEsdeger))} çuval`}
                    kapasite={`${formatNumber(arac.cuvalKapasite)} çuval`}
                    baglayici={!agirlikBaglayici}
                  />
                  {baglayiciYuzde < tercihler.dolulukEsigi && duraklar.length > 0 ? (
                    <p className="flex items-start gap-1.5 text-[11.5px] text-caution">
                      <AlertTriangleIcon className="mt-px size-3 shrink-0" strokeWidth={2} aria-hidden />
                      <span>
                        Hedef doluluğun (%{tercihler.dolulukEsigi}) altında — durak
                        eklemeyi veya daha küçük araç kullanmayı düşün.
                      </span>
                    </p>
                  ) : null}
                  {doluluk.olcusuzVar ? (
                    <p className="flex items-start gap-1.5 text-[11.5px] text-caution">
                      <AlertTriangleIcon className="mt-px size-3 shrink-0" strokeWidth={2} aria-hidden />
                      <span>Ölçüsü bilinmeyen ürün var — gerçek yük daha ağır olabilir.</span>
                    </p>
                  ) : null}
                </>
              ) : null}
            </Kart>

            <Kart baslik="Aktivite günlüğü">
              {gun ? (
                <Olay
                  saat={saatMetni(kalkis)}
                  metin={`Depodan çıkış · ${duraklar.length} durak`}
                />
              ) : null}
              {rotaBilgi ? (
                <Olay
                  saat="—"
                  metin={`Güzergâh optimize edildi · ${formatNumber(
                    Math.round(rotaBilgi.metre / 1000)
                  )} km${
                    gun
                      ? `, ${Math.round(gun.surusSaniye / 60)} dk sürüş + ${Math.round(
                          gun.servisSaniye / 60
                        )} dk boşaltma`
                      : ""
                  }`}
                />
              ) : null}
              {gun && gun.molaSaniye > 0 ? (
                <Olay saat="—" metin="Takograf molası eklendi (30 dk)" />
              ) : null}
              {varis ? <Olay saat={saatMetni(varis)} metin="Depoya dönüş" /> : null}
              {duraklar.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  Bu araca henüz durak atanmadı.
                </p>
              ) : null}

              {/*
                Arvento araç takibi buraya bağlanacak. API anahtarı yok, veri
                uydurulmuyor — bölüm açıkça "bağlanmadı" diyor.
              */}
              <div className="mt-1 flex items-start gap-1.5 border-t border-border/60 pt-2.5 text-[11.5px] text-muted-foreground">
                <SatelliteDishIcon className="mt-px size-3 shrink-0" strokeWidth={1.75} aria-hidden />
                <span>
                  Canlı araç konumu bağlanmadı — Arvento API anahtarı gelince
                  aracın anlık ve geçmiş konumu bu listeye karışacak.
                </span>
              </div>
            </Kart>
          </div>

          {/* Sağ kolon: görsel + palet ızgarası + durak listesi */}
          <div className="flex flex-col gap-px bg-border">
            <div className="flex flex-col gap-4 bg-background p-4">
              <PaletIzgarasi
                arac={arac}
                duraklar={duraklar}
                onDurakSec={setVurgulanan}
                vurgulananMusteri={vurgulanan}
                onDurakCikar={durakCikar}
                aracKod={aracKod}
              />
            </div>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
              <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4">
                <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                  Durak sırası
                </h2>
                {duraklar.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => aracTemizle(aracKod)}
                    className="text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Aracı boşalt
                  </button>
                ) : null}
              </header>
              {optimizeHatalari[aracKod] ? (
                <p className="border-b border-destructive/25 bg-destructive/10 px-4 py-2 text-[11.5px] text-destructive">
                  {optimizeHatalari[aracKod]}
                </p>
              ) : null}
              {duraklar.length === 0 ? (
                <p className="px-4 py-6 text-[12.5px] text-muted-foreground">
                  Aşağıdan sipariş ekleyin.
                </p>
              ) : (
                <ol className="divide-y divide-border/40">
                  {duraklar.map((d, i) => (
                    <li
                      key={d.musteriKodu}
                      className={cn(
                        "flex min-w-0 items-center gap-2 px-4 py-2 transition-colors",
                        vurgulanan === d.musteriKodu && "bg-accent/50"
                      )}
                    >
                      <span className="w-5 shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      {d.riskDurumu ? (
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: RISK_COLORS[d.riskDurumu] }}
                          title={RISK_SHORT_LABELS[d.riskDurumu]}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                        {d.unvan}
                      </span>
                      <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                        {formatNumber(Math.round(d.cuvalEsdeger))} çuval
                      </span>
                      <button
                        type="button"
                        onClick={() => durakCikar(d.musteriKodu)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={`${d.unvan} durağını çıkar`}
                      >
                        <XIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>

        {/* Alt: bu araca sipariş ata */}
        <section className="border-t border-border bg-background">
          <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4">
            <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
              {arac.ad} aracına sipariş ata
            </h2>
            <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
              {formatNumber(havuz.length)} bekleyen
            </span>
          </header>
          {havuz.length === 0 ? (
            <p className="px-4 py-6 text-[12.5px] text-muted-foreground">
              Havuz boş — bekleyen yükün tamamı araçlara dağıtıldı.
            </p>
          ) : (
            <div className="flex flex-col gap-5 p-4">
              {havuzGruplari.map(({ bolge, duraklar: grupDuraklari }) => (
                <div key={bolge?.kod ?? "bolgesiz"} className="flex flex-col gap-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: bolge ? bolgeRengi(bolge.kod) : "var(--muted-foreground)" }}
                    />
                    <h3 className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-foreground">
                      {bolge?.ad ?? "Bölgesiz — konumu yok"}
                    </h3>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {formatNumber(grupDuraklari.length)}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {grupDuraklari.map((d) => (
                      <div
                        key={d.musteriKodu}
                        className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3"
                      >
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                            {d.unvan}
                          </span>
                          {d.yasGun != null && d.yasGun >= 1 ? (
                            <span
                              className={cn(
                                "shrink-0 font-mono text-[11px] tabular-nums",
                                d.yasGun >= BAYAT_GUN
                                  ? "text-caution"
                                  : "text-muted-foreground"
                              )}
                            >
                              {formatNumber(d.yasGun)} günlük
                            </span>
                          ) : null}
                        </div>
                        <dl className="grid grid-cols-3 gap-2">
                          <Alan etiket="Bölge" deger={d.ilce ?? d.sehir ?? "—"} />
                          <Alan etiket="Ağırlık" deger={formatKg(Math.round(d.kg))} />
                          <Alan
                            etiket="Hacim"
                            deger={`${formatNumber(Math.round(d.cuvalEsdeger))} çuval`}
                          />
                        </dl>
                        <button
                          type="button"
                          onClick={() => durakEkle(d.musteriKodu, aracKod)}
                          disabled={d.lat == null || d.lon == null}
                          className="flex items-center justify-center gap-1.5 rounded border border-border py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                          title={
                            d.lat == null
                              ? "Koordinatı yok — plana giremez"
                              : `${d.unvan} durağını ${arac.ad} aracına ekle`
                          }
                        >
                          <PlusIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
                          Bu araca ekle
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Kart({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 bg-background p-4">
      <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
        {baslik}
      </h2>
      {children}
    </section>
  );
}

function Alan({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted-foreground">{etiket}</dt>
      <dd className="truncate font-mono text-[12px] text-foreground tabular-nums">
        {deger}
      </dd>
    </div>
  );
}

function Olay({ saat, metin }: { saat: string; metin: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <ClockIcon
        className="mt-0.5 size-3 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
        {saat}
      </span>
      <span className="min-w-0 flex-1 text-[12px] text-foreground">{metin}</span>
    </div>
  );
}

function Bar({
  etiket,
  yuzde,
  deger,
  kapasite,
  baglayici,
}: {
  etiket: string;
  yuzde: number | null;
  deger: string;
  kapasite: string;
  baglayici: boolean;
}) {
  const asim = yuzde != null && yuzde > 100;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className={cn(baglayici ? "text-foreground" : "text-muted-foreground")}>
          {etiket}
          {baglayici ? " · bağlayıcı" : ""}
        </span>
        <span
          className={cn(
            "font-mono tabular-nums",
            asim ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {deger} / {kapasite}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            "h-full rounded-full",
            asim ? "bg-destructive" : baglayici ? "bg-caution" : "bg-foreground/40"
          )}
          style={{ width: `${Math.min(100, yuzde ?? 0)}%` }}
        />
      </div>
    </div>
  );
}
