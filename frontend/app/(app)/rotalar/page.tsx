"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LoaderIcon,
  MapIcon,
  SaveIcon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react";

import { DurakHavuzu } from "@/components/rota/DurakHavuzu";
import { EtkiPaneli } from "@/components/rota/EtkiPaneli";
import { FiloKadroPaneli } from "@/components/rota/FiloKadroPaneli";
import { KayitliPlanlar } from "@/components/rota/KayitliPlanlar";
import { PaletIzgarasi } from "@/components/rota/PaletIzgarasi";
import {
  HAVUZ_HEDEFI,
  SuruklemeSaglayici,
  useSurukleme,
  type SurukleYuku,
} from "@/components/rota/surukleme";
import { RotaOzetSeridi } from "@/components/rota/RotaOzetSeridi";
import { TercihCubugu } from "@/components/rota/TercihCubugu";
import type { HaritaRotasi } from "@/components/rota/RotaHaritasi";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useRaporTazeligi } from "@/hooks/useMusteriRaporlama";
import {
  ROTA_REPORT_ID,
  type RotaAraci,
  type RotaDuragi,
} from "@/hooks/useRotaPlani";
import { DEPOT, googleMapsDirUrl } from "@/lib/depot";
import { formatKg, formatNumber } from "@/lib/format";
import { dolulukHesapla } from "@/lib/rota/atama";
import { cn } from "@/lib/utils";

import { useRotaPlaniBaglami } from "./RotaPlaniProvider";

/**
 * Rota planlama — bento ana sayfa.
 *
 * Harita burada YOK, yalnız geçiş kartı var: küçük bir kutuda gösterilince
 * İzmir–Uşak arası bir turu okumak imkânsızdı. Asıl harita `/rotalar/harita`
 * tam ekranda, perde geçişiyle açılıyor.
 */
export default function RotalarPage() {
  const {
    loading,
    error,
    duraklar,
    araclar,
    cikanAraclar,
    elenenAraclar,
    filo,
    ozet,
    tazele,
    tercihler,
    tercihDegis,
    havuz,
    atananSayisi,
    aracDuraklari,
    rotalar,
    seciliArac,
    setSeciliArac,
    otomatikDagit,
    hepsiniTemizle,
    durakEkle,
    durakCikar,
    mevcutMetrik,
    etkiSecenekleri,
    planiKaydet,
    kaydediliyor,
    kayitDurumu,
  } = useRotaPlaniBaglami();

  const [filoPaneliAcik, setFiloPaneliAcik] = useState(false);
  /** Planlama = üzerinde çalışılan taslak, Kaydedilenler = dondurulmuş geçmiş. */
  const [sekme, setSekme] = useState<"planlama" | "kayitli">("planlama");
  /** Sürükleme yalnız fare/trackpad'de açık — buton metni de ona göre. */
  const fareVar = useMediaQuery("(pointer: fine)");

  const seciliAracAdi =
    cikanAraclar.find((a) => a.kod === seciliArac)?.ad ?? null;

  const yukluAraclar = cikanAraclar.filter(
    (a) => aracDuraklari(a.kod).length > 0
  );

  /**
   * Kartlarda filonun TAMAMI görünür. Bir araç bugün çıkamıyorsa sebebiyle
   * birlikte soluk gösteriliyor — listeden sessizce düşmesi "3D nerede?"
   * sorusuna yol açıyordu.
   */
  const cikanKodSeti = new Set(cikanAraclar.map((a) => a.kod));
  const elenenKodSeti = new Set(elenenAraclar.map((a) => a.kod));
  const gosterilecekAraclar = araclar;
  const haritaDurakSayisi = rotalar.reduce(
    (t, r) => t + r.duraklar.filter((d) => d.lat != null).length,
    0
  );

  /**
   * Bırakma: havuza → araçtan çıkar; araca → varsa eski aracından alıp ekle.
   * `durakCikar` durağı tüm araçlardan siliyor, havuzdan gelen için no-op.
   */
  const birak = useCallback(
    (yuk: SurukleYuku, hedefKod: string) => {
      const kod = yuk.durak.musteriKodu;
      if (hedefKod === HAVUZ_HEDEFI) {
        durakCikar(kod);
        return;
      }
      if (!cikanKodSeti.has(hedefKod)) return; // soluk kart hedef değil
      durakCikar(kod);
      durakEkle(kod, hedefKod);
    },
    [durakCikar, durakEkle, cikanKodSeti]
  );

  return (
    <SuruklemeSaglayici etkin={fareVar} onBirak={birak}>
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <h1 className="shrink-0 truncate text-[15px] font-semibold text-foreground">
          Rota planlama
        </h1>

        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5">
          <Sekme
            secili={sekme === "planlama"}
            onClick={() => setSekme("planlama")}
            title="Bugün üzerinde çalışılan taslak plan"
          >
            Planlama
          </Sekme>
          <Sekme
            secili={sekme === "kayitli"}
            onClick={() => setSekme("kayitli")}
            title="Kaydedilmiş planlar — yük değerleri o günkü hâliyle dondurulmuş"
          >
            Kaydedilenler
          </Sekme>
        </div>

        <div className="min-w-0 flex-1" />
        <VeriTazeligi />

        {sekme === "planlama" ? (
        <button
          type="button"
          onClick={otomatikDagit}
          disabled={loading || duraklar.length === 0 || cikanAraclar.length === 0}
          className="flex shrink-0 items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-40"
          title="Bekleyen yükü tercihlere göre araçlara dağıt"
        >
          <SparklesIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
          <span className="hidden sm:inline">Otomatik dağıt</span>
        </button>
        ) : null}
        {sekme === "planlama" && atananSayisi > 0 ? (
          <>
            <button
              type="button"
              onClick={hepsiniTemizle}
              className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              title="Planı sıfırla"
              aria-label="Planı sıfırla"
            >
              <Undo2Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void planiKaydet()}
              disabled={kaydediliyor}
              className="flex shrink-0 items-center gap-1.5 rounded bg-foreground px-2.5 py-1.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {kaydediliyor ? (
                <LoaderIcon className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
              ) : (
                <SaveIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
              )}
              <span className="hidden sm:inline">Planı kaydet</span>
            </button>
          </>
        ) : null}
      </header>

      {error ? (
        <p className="shrink-0 border-b border-destructive/25 bg-destructive/10 px-3.5 py-1.5 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
      {kayitDurumu ? (
        <p
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-b px-3.5 py-1.5 text-[12px]",
            kayitDurumu.tur === "ok"
              ? "border-border bg-accent/40 text-foreground"
              : "border-destructive/25 bg-destructive/10 text-destructive"
          )}
        >
          {kayitDurumu.tur === "ok" ? (
            <CheckIcon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          ) : null}
          {kayitDurumu.mesaj}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sekme === "kayitli" ? (
          <KayitliPlanlar />
        ) : (
        <>
        <RotaOzetSeridi ozet={ozet} filo={filo} loading={loading} />

        <TercihCubugu
          tercihler={tercihler}
          onDegis={tercihDegis}
          araclar={araclar}
          otomatikSecim={filo.secilen}
          atamalar={filo.atamalar}
          soforSayisi={ozet.soforSayisi.B + ozet.soforSayisi.C}
          cikanKodlar={cikanAraclar.map((a) => a.kod)}
          onFiloDuzenle={() => setFiloPaneliAcik(true)}
          loading={loading}
        />

        <EtkiPaneli
          mevcut={mevcutMetrik}
          secenekler={etkiSecenekleri}
          loading={loading}
        />

        <div className="grid gap-3 p-3 lg:grid-cols-3 lg:items-start">
          {/* Sol sütun: haritaya geçiş + havuz */}
          <div className="flex min-w-0 flex-col gap-3">
            <HaritaKarti
              durakSayisi={haritaDurakSayisi}
              aracSayisi={yukluAraclar.length}
              rotalar={rotalar}
            />
            <section className="flex h-[26rem] min-w-0 flex-col overflow-hidden rounded-lg border border-border">
              <DurakHavuzu
                duraklar={havuz}
                seciliAracAdi={seciliAracAdi}
                onDurakEkle={durakEkle}
                loading={loading}
              />
            </section>
          </div>

          {/* Sağ: araç bento kartları */}
          <section className="min-w-0 lg:col-span-2">
            <h2 className="mb-2 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
              Araçlar
            </h2>
            {gosterilecekAraclar.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-[12.5px] text-muted-foreground">
                {loading ? "Filo yükleniyor…" : "Aktif araç tanımlı değil."}
              </p>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {gosterilecekAraclar.map((a) => (
                  <AracBentoKarti
                    key={a.kod}
                    arac={a}
                    duraklar={aracDuraklari(a.kod)}
                    soforAdi={filo.atamalar[a.kod]?.ad ?? null}
                    dolulukEsigi={tercihler.dolulukEsigi}
                    cikiyor={cikanKodSeti.has(a.kod)}
                    soforsuz={elenenKodSeti.has(a.kod)}
                    secili={seciliArac === a.kod}
                    onDurakCikar={durakCikar}
                    onSec={() =>
                      setSeciliArac(seciliArac === a.kod ? null : a.kod)
                    }
                  />
                ))}
              </div>
            )}
            <GuzergahLinkleri rotalar={rotalar} />
          </section>
        </div>
        </>
        )}
      </div>

      {filoPaneliAcik ? (
        <FiloKadroPaneli
          onKapat={() => setFiloPaneliAcik(false)}
          onDegisti={tazele}
        />
      ) : null}
    </div>
    </SuruklemeSaglayici>
  );
}

function Sekme({
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
        "rounded-md px-2.5 py-1 text-[12px] whitespace-nowrap transition-colors",
        secili
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/** Haritaya geçiş kartı — asıl harita tam ekran, perde geçişiyle açılıyor. */
function HaritaKarti({
  durakSayisi,
  aracSayisi,
  rotalar,
}: {
  durakSayisi: number;
  aracSayisi: number;
  rotalar: HaritaRotasi[];
}) {
  return (
    <section className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-accent/20 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <MapIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
          Harita
        </h2>
        <p className="text-[12.5px] text-muted-foreground">
          {durakSayisi > 0
            ? `${formatNumber(aracSayisi)} araç · ${formatNumber(durakSayisi)} durak`
            : "Henüz güzergâh yok — önce durakları dağıtın."}
        </p>
        <p className="truncate text-[11.5px] text-muted-foreground opacity-70">
          Depo: {DEPOT.label}
        </p>
      </div>

      {/* Araç renkleri — haritadaki lejantın önizlemesi */}
      {rotalar.some((r) => r.duraklar.length > 0) ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {rotalar
            .filter((r) => r.duraklar.length > 0)
            .map((r) => (
              <span
                key={r.aracKod}
                className="flex items-center gap-1 text-[11px] text-muted-foreground"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: r.renk }}
                  aria-hidden
                />
                {r.aracAd}
              </span>
            ))}
        </div>
      ) : null}

      <Link
        href="/rotalar/harita"
        className="flex items-center justify-center gap-1.5 rounded bg-foreground px-2.5 py-2 text-[12px] font-medium text-background transition-opacity hover:opacity-90"
      >
        Haritayı aç
        <ChevronRightIcon className="size-3.5" strokeWidth={2} aria-hidden />
      </Link>
    </section>
  );
}

function AracBentoKarti({
  arac,
  duraklar,
  soforAdi,
  dolulukEsigi,
  cikiyor,
  soforsuz,
  secili,
  onDurakCikar,
  onSec,
}: {
  arac: RotaAraci;
  duraklar: RotaDuragi[];
  soforAdi: string | null;
  dolulukEsigi: number;
  /** Bugün çıkabiliyor mu — çıkamıyorsa kart soluk ve bırakma hedefi değil. */
  cikiyor: boolean;
  /** Seçili ama şoför yetmediği için elendi. */
  soforsuz: boolean;
  secili: boolean;
  /** Palet gözüne tıklayınca durak havuza geri alınır. */
  onDurakCikar: (musteriKodu: string) => void;
  onSec: () => void;
}) {
  const { durum, etkin: surukleyebilir } = useSurukleme();
  const suruklemeAktif = durum != null;
  const hedefte = durum?.hedefKod === arac.kod;
  const doluluk = dolulukHesapla(arac, duraklar);
  const agirlikBaglayici = doluluk.baglayiciKisit === "agirlik";
  const yuzde = agirlikBaglayici
    ? (doluluk.kgYuzde ?? doluluk.cuvalYuzde)
    : doluluk.cuvalYuzde;
  const dusuk = duraklar.length > 0 && !doluluk.asim && yuzde < dolulukEsigi;
  const hedefOlabilir = cikiyor && suruklemeAktif;
  const birakilacak = cikiyor && hedefte;

  return (
    <div
      // `elementFromPoint` bırakma anında bu özniteliği arıyor.
      data-birak-hedef={cikiyor ? arac.kod : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border p-3 transition-colors",
        !cikiyor && "opacity-55",
        secili ? "border-foreground/40 bg-accent/40" : "border-border",
        hedefOlabilir && "border-dashed border-foreground/40",
        birakilacak &&
          "border-solid border-foreground bg-accent/60 ring-2 ring-foreground/30"
      )}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <Link
          href={`/rotalar/${arac.kod}`}
          className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground underline-offset-2 hover:underline"
          title={`${arac.ad} yük detayını aç`}
        >
          {arac.ad}
        </Link>
        {!cikiyor ? (
          <span
            className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
            title={
              soforsuz
                ? "Seçili ama şoför yetmiyor — bugün çıkamaz"
                : "Tercihlerde seçili değil — araç listesinden ekleyebilirsiniz"
            }
          >
            {soforsuz ? "şoför yok" : "çıkmıyor"}
          </span>
        ) : doluluk.asim ? (
          <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
            aşım
          </span>
        ) : dusuk ? (
          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            yarı boş
          </span>
        ) : null}
        <span className="shrink-0 font-mono text-[12.5px] font-semibold text-foreground tabular-nums">
          %{Math.round(yuzde)}
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {soforAdi ?? (cikiyor ? "Şoför atanmadı" : "Şoför düşmüyor")}
        </span>
        <span className="shrink-0 tabular-nums">
          {formatNumber(duraklar.length)} durak
        </span>
        <span className="shrink-0 tabular-nums">
          {formatKg(Math.round(doluluk.kg))}
        </span>
      </div>

      <PaletIzgarasi
        arac={arac}
        duraklar={duraklar}
        aracKod={cikiyor ? arac.kod : null}
        onDurakCikar={cikiyor ? onDurakCikar : undefined}
      />

      <button
        type="button"
        onClick={onSec}
        disabled={!cikiyor}
        aria-pressed={secili}
        className={cn(
          "rounded border py-1.5 text-[11.5px] transition-colors",
          !cikiyor
            ? "cursor-default border-border/50 text-muted-foreground"
            : secili
              ? "border-foreground/40 bg-foreground text-background"
              : "border-border text-muted-foreground hover:text-foreground"
        )}
      >
        {!cikiyor
          ? soforsuz
            ? "Şoför yetmiyor"
            : "Bugün çıkmıyor"
          : secili
            ? surukleyebilir
              ? "Seçili — havuzdan tıklayın veya sürükleyin"
              : "Seçili — havuzdan tıklayın"
            : surukleyebilir
              ? "Yüklemek için seç veya sürükle"
              : "Yüklemek için seç"}
      </button>
    </div>
  );
}

/** Şoföre gönderilebilecek, araç başına Google Maps güzergâh linki. */
function GuzergahLinkleri({ rotalar }: { rotalar: HaritaRotasi[] }) {
  const dolu = rotalar.filter((r) => r.duraklar.length > 0);
  if (dolu.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3">
      {dolu.map((r) => {
        const konumlu = r.duraklar.filter(
          (d): d is RotaDuragi & { lat: number; lon: number } =>
            d.lat != null && d.lon != null
        );
        if (konumlu.length === 0) return null;
        return (
          <a
            key={r.aracKod}
            href={googleMapsDirUrl(konumlu, { includeDepot: true, roundTrip: true })}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] text-foreground transition-colors hover:bg-accent"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: r.renk }}
              aria-hidden
            />
            {r.aracAd}
            <span className="text-muted-foreground tabular-nums">
              {formatNumber(konumlu.length)} durak
            </span>
            <ExternalLinkIcon className="size-3" strokeWidth={1.75} aria-hidden />
          </a>
        );
      })}
    </div>
  );
}

function VeriTazeligi() {
  const siparis = useRaporTazeligi(ROTA_REPORT_ID);
  if (siparis.saatOnce == null) return null;
  const saatOnce = siparis.saatOnce;

  const kritik = saatOnce >= 48;
  const uyari = saatOnce >= 24;
  const metin =
    saatOnce < 1
      ? "az önce"
      : saatOnce < 24
        ? `${saatOnce} saat önce`
        : `${Math.floor(saatOnce / 24)} gün önce`;

  return (
    <span
      className="hidden shrink-0 items-center gap-1.5 md:flex"
      title="Belge detay sipariş (5451) — son başarılı çekim."
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
