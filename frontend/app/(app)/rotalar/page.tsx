"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LoaderIcon,
  MapIcon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  TruckIcon,
  Undo2Icon,
} from "lucide-react";

import { BolgeOzeti } from "@/components/rota/BolgeOzeti";
import { DurakHavuzu } from "@/components/rota/DurakHavuzu";
import { EtkiPaneli } from "@/components/rota/EtkiPaneli";
import { FiloKadroPaneli } from "@/components/rota/FiloKadroPaneli";
import { KayitliPlanlar } from "@/components/rota/KayitliPlanlar";
import {
  HAVUZ_HEDEFI,
  SuruklemeSaglayici,
  useSurukleme,
  type SurukleYuku,
} from "@/components/rota/surukleme";
import { PlanDurumSeridi } from "@/components/rota/PlanDurumSeridi";
import { TercihCekmecesi } from "@/components/rota/TercihCekmecesi";
import type { HaritaRotasi } from "@/components/rota/RotaHaritasi";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useRaporTazeligi } from "@/hooks/useMusteriRaporlama";
import {
  ROTA_REPORT_ID,
  type RotaAraci,
  type RotaDuragi,
} from "@/hooks/useRotaPlani";
import { depoyaKm, googleMapsDirUrl } from "@/lib/depot";
import { formatKg, formatNumber } from "@/lib/format";
import { dolulukHesapla } from "@/lib/rota/atama";
import type { Bolge } from "@/lib/rota/bolge";
import { bolgeRengi } from "@/lib/rota/bolge-renk";
import type { RotaBilgisi } from "@/lib/rota/google-routes";
import {
  gunUzunlugu,
  saatMetni,
  sonrakiKalkis,
  sureMetni,
  varisZamani,
  YAYILIM_UYARI_KM,
} from "@/lib/rota/operasyon";
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
    filo,
    ozet,
    tazele,
    tercihler,
    tercihDegis,
    havuz,
    atananSayisi,
    bolgeler,
    durakBolgesi,
    sabitlemeler,
    bolgeSabitle,
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
    rotaBilgileri,
    planiKaydet,
    kaydediliyor,
    kayitDurumu,
  } = useRotaPlaniBaglami();

  /** musteriKodu → araç adı; bölge özeti hangi bölgeye kim gidiyor diye sorar. */
  const durakAraci = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of cikanAraclar) {
      for (const d of aracDuraklari(a.kod)) m.set(d.musteriKodu, a.ad);
    }
    return m;
  }, [cikanAraclar, aracDuraklari]);

  const [filoPaneliAcik, setFiloPaneliAcik] = useState(false);
  /** Planlama = üzerinde çalışılan taslak, Kaydedilenler = dondurulmuş geçmiş. */
  const [sekme, setSekme] = useState<"planlama" | "kayitli">("planlama");
  /** Sürükleme yalnız fare/trackpad'de açık — buton metni de ona göre. */
  const fareVar = useMediaQuery("(pointer: fine)");

  const seciliAracAdi = araclar.find((a) => a.kod === seciliArac)?.ad ?? null;

  const yukluAraclar = araclar.filter((a) => aracDuraklari(a.kod).length > 0);

  /**
   * `cikanKodSeti` artık KİLİT DEĞİL, yalnız bilgi: otomatik dağıtımın o gün
   * kullandığı filo. Filodaki her araca elle yük konabilir — eskiden seçim
   * dışı kalan araç soluklaşıp tıklanamaz oluyordu ve sağlam bir araç
   * (Isuzu 3D) "devre dışı" gibi görünüyordu.
   */
  const cikanKodSeti = new Set(cikanAraclar.map((a) => a.kod));
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
      // Filodaki her araç geçerli hedef; otomatik dağıtımın seçimi bağlamıyor.
      durakCikar(kod);
      durakEkle(kod, hedefKod);
    },
    [durakCikar, durakEkle]
  );

  /**
   * Bölgeler paneline işlev: "Havuzdaki N durağı X'e yükle" — bütün bölgeyi
   * tek tıkla seçili araca taşır. `birak`la aynı remove+add deseni; yalnız
   * `durakEkle`'yi tek başına çağırmak, durak zaten başka bir araçtaysa
   * (`cikanAraclar` dışı, elle yüklenmiş) onu İKİ araçta birden bırakırdı.
   */
  const bolgeyiSeciliAracaYukle = useCallback(
    (musteriKodlari: string[]) => {
      if (seciliArac == null) return;
      for (const kod of musteriKodlari) {
        durakCikar(kod);
        durakEkle(kod, seciliArac);
      }
    },
    [seciliArac, durakCikar, durakEkle]
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
              /* Metin `sm` altında gizli, ikonlar `aria-hidden` — etiket olmazsa
                 dar ekranda düğmenin erişilebilir adı hiç yok. */
              aria-label="Planı kaydet"
              title="Planı kaydet"
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

      {/* Durum mesajları duyurulmalı: `otomatikDagit` ve kaydetme ekranın
          yarısını değiştiriyor ama modülde hiç canlı bölge yoktu. */}
      {error ? (
        <p
          role="alert"
          className="shrink-0 border-b border-destructive/25 bg-destructive/10 px-3.5 py-1.5 text-[12px] text-destructive"
        >
          {error}
        </p>
      ) : null}
      {kayitDurumu ? (
        <p
          role="status"
          aria-live="polite"
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

      {/*
        Durum şeridi kaydırma kabının DIŞINDA: ölçüm işin yanında kalmalı.
        Eskiden özet + tercihler + etki üst üste üç tam genişlik şeritti
        (~280px) ve hiçbiri sticky olmadığı için araç kartlarına inince hepsi
        ekrandan kayıyordu.
      */}
      {sekme === "planlama" ? (
        <PlanDurumSeridi
          ozet={ozet}
          filo={filo}
          loading={loading}
          sag={
            <TercihCekmecesi
              tercihler={tercihler}
              onDegis={tercihDegis}
              aracSayisi={araclar.length}
              otomatikAracSayisi={cikanAraclar.length}
              soforSayisi={ozet.soforSayisi.B + ozet.soforSayisi.C}
              onFiloDuzenle={() => setFiloPaneliAcik(true)}
              loading={loading}
            />
          }
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sekme === "kayitli" ? (
          <KayitliPlanlar />
        ) : (
        <>
        {/* `pb-10`: liste tam sayfa/panel kenarına yapışıp göz yormasın diye. */}
        <div className="flex flex-col gap-3 p-3 pb-10">
          {/*
            Etki paneli + harita geçişi — TEK, TAM GENİŞLİK satır.
            Etki paneli ÖLÇTÜĞÜ ŞEYİN (araçlar) üstünde duruyor; harita geçişi
            eskiden ayrı bir kart olarak sol sütundaydı, şimdi bu şeride
            "birleşiyor" — ikisi de araçlar bölümünün hemen üstündeki tek kısım.
          */}
          <div className="overflow-hidden rounded-lg border border-border">
            <EtkiPaneli
              mevcut={mevcutMetrik}
              secenekler={etkiSecenekleri}
              loading={loading}
              sag={
                <HaritaButonu
                  durakSayisi={haritaDurakSayisi}
                  aracSayisi={yukluAraclar.length}
                />
              }
            />
          </div>

          {/*
            Havuzda kalan + Araçlar — YAN YANA, hizalı, aynı yükseklikte iki
            panel. Eskiden havuz sol dar sütunda, araçlar sağda geniş bir
            ızgaraydı; ikisi de "şu an ne var" sorusunu cevapladığı için eşit
            ağırlıkta durmaları gerekiyordu.
          */}
          <div className="grid gap-3 lg:grid-cols-2 lg:items-stretch">
            <section className="flex h-[min(32rem,65vh)] min-w-0 flex-col overflow-hidden rounded-lg border border-border">
              <DurakHavuzu
                duraklar={havuz}
                seciliAracAdi={seciliAracAdi}
                onDurakEkle={durakEkle}
                loading={loading}
                durakBolgesi={durakBolgesi}
              />
            </section>

            <section className="flex h-[min(32rem,65vh)] min-w-0 flex-col overflow-hidden rounded-lg border border-border">
              <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
                <h2 className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                  <TruckIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="truncate">Araçlar</span>
                </h2>
                <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground tabular-nums">
                  {formatNumber(gosterilecekAraclar.length)}
                </span>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {gosterilecekAraclar.length === 0 ? (
                  <p className="px-3.5 py-6 text-center text-[12.5px] text-muted-foreground">
                    {loading ? "Filo yükleniyor…" : "Aktif araç tanımlı değil."}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 p-2.5">
                    {gosterilecekAraclar.map((a) => (
                      <AracBentoKarti
                        key={a.kod}
                        arac={a}
                        duraklar={aracDuraklari(a.kod)}
                        soforAdi={filo.atamalar[a.kod]?.ad ?? null}
                        rotaBilgi={rotaBilgileri[a.kod] ?? null}
                        dolulukEsigi={tercihler.dolulukEsigi}
                        otomatikDisi={!cikanKodSeti.has(a.kod)}
                        secili={seciliArac === a.kod}
                        durakBolgesi={durakBolgesi}
                        onSec={() =>
                          setSeciliArac(seciliArac === a.kod ? null : a.kod)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/*
            Bölgeler — havuz ve araçların ALTINDA, tam genişlik, açık liste.
            "Bu araçta ne var" (araç kartları) sorusunun tersi: "bu bölgeye
            kim gidiyor, bölündü mü". Katlanabilir bir dış anahtarı YOK —
            liste hep görünür, yalnız tek tek satırlar tıklanınca açılıp
            yük/araç bilgisini gösteriyor.
          */}
          <BolgeOzeti
            bolgeler={bolgeler}
            durakAraci={durakAraci}
            filo={araclar}
            sabitlemeler={sabitlemeler}
            onSabitle={bolgeSabitle}
            sabitlemeAcik={tercihler.strateji === "bolge"}
            loading={loading}
            seciliArac={seciliArac}
            onBolgeYukle={bolgeyiSeciliAracaYukle}
          />

          <GuzergahLinkleri rotalar={rotalar} />
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
/**
 * Etki şeridinin sağ ucuna binen kompakt harita geçişi.
 *
 * Eskiden kendi başına dolgulu bir kart olarak sol sütunün en üstündeydi.
 * Şimdi havuz ve araçlar yan yana tek satıra indiği için sol sütun kalmadı —
 * harita geçişi zaten üstündeki etki şeridiyle "araçlar sekmesi üzerindeki
 * kısım" olarak aynı satıra birleşiyor.
 */
function HaritaButonu({
  durakSayisi,
  aracSayisi,
}: {
  durakSayisi: number;
  aracSayisi: number;
}) {
  return (
    <Link
      href="/rotalar/harita"
      className="flex min-w-0 items-center gap-2 px-3.5 py-2 text-[12px] text-foreground transition-colors hover:bg-accent/40"
      title={
        durakSayisi > 0
          ? `${formatNumber(aracSayisi)} araç · haritada ${formatNumber(durakSayisi)} durak`
          : "Henüz güzergâh yok — önce durakları dağıtın"
      }
    >
      <MapIcon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <span className="shrink-0 font-medium">Haritayı aç</span>
      {durakSayisi > 0 ? (
        <span className="hidden shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums sm:inline">
          {formatNumber(aracSayisi)} araç · {formatNumber(durakSayisi)} durak
        </span>
      ) : null}
      <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
    </Link>
  );
}

function AracBentoKarti({
  arac,
  duraklar,
  soforAdi,
  rotaBilgi,
  dolulukEsigi,
  otomatikDisi,
  secili,
  onSec,
  durakBolgesi,
}: {
  arac: RotaAraci;
  duraklar: RotaDuragi[];
  soforAdi: string | null;
  /** Son optimizasyondan kalan süre/mesafe — yoksa gün uzunluğu gösterilmez. */
  rotaBilgi: RotaBilgisi | null;
  dolulukEsigi: number;
  /** musteriKodu → bölge; kart hangi bölgeleri taşıdığını gösterir. */
  durakBolgesi: Map<string, Bolge>;
  /**
   * Otomatik dağıtım bu aracı kullanmadı. YALNIZ BİLGİ — kart yine tıklanır,
   * yine bırakma hedefi. Eskiden bu durum aracı kilitliyordu ve sağlam bir
   * araç "devre dışı" gibi görünüyordu.
   */
  otomatikDisi: boolean;
  secili: boolean;
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

  /**
   * Bu araç hangi bölgeleri taşıyor — kod renk için, ad rozet metni için.
   * `aracBolgeleri` (sayfanın üstündeki tüm plan bölgelerini taşıyan
   * `bolgeler`den KASITLI ayrı isim — aynı kelime iki farklı şey anlatmasın.
   */
  const aracBolgeleri = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of duraklar) {
      const b = durakBolgesi.get(d.musteriKodu);
      if (b) m.set(b.kod, b.ad);
    }
    return [...m.entries()].map(([kod, ad]) => ({ kod, ad }));
  }, [duraklar, durakBolgesi]);

  /**
   * En yakın-en uzak durak farkı. Sahada olan vaka: Aydın (4 km) ile İstanbul
   * (325 km) aynı araçta. Sağlıklı bölge turları 81-108 km bandında kalıyor,
   * sweep'in ürettiği kötü günler 224-240 km'deydi.
   */
  const yayilimKm = useMemo(() => {
    const kmler = duraklar
      .filter((d) => d.lat != null && d.lon != null)
      .map((d) => depoyaKm({ lat: d.lat as number, lon: d.lon as number }));
    return kmler.length < 2 ? 0 : Math.max(...kmler) - Math.min(...kmler);
  }, [duraklar]);

  /**
   * Turun gerçek gün uzunluğu — Google yalnız SÜRÜŞ süresini veriyor; boşaltma
   * ve takograf molası eklenmezse "bu güne sığar mı" sorusu yanlış cevaplanır.
   * Bu gösterge yazılmıştı ama hiç render edilmeyen `AracKarti.tsx` içinde
   * kalmıştı; planlama ekranı bu soruyu hiç sormuyordu.
   */
  const gun = useMemo(
    () =>
      rotaBilgi
        ? gunUzunlugu({
            surusSaniye: rotaBilgi.saniye,
            durakSayisi: duraklar.length,
            takograf: arac.takograf,
          })
        : null,
    [rotaBilgi, duraklar.length, arac.takograf]
  );
  const varis = gun ? varisZamani(sonrakiKalkis(), gun.toplamSaniye) : null;

  const hedefOlabilir = suruklemeAktif;
  const birakilacak = hedefte;
  /** Yük var ama şoför düşmemiş — 3 şoför, 4 araç dolduysa biri şoförsüz kalır. */
  const soforsuzYuklu = duraklar.length > 0 && soforAdi == null;

  return (
    <div
      // `elementFromPoint` bırakma anında bu özniteliği arıyor.
      data-birak-hedef={arac.kod}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border p-3 transition-colors",
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
        {/*
          "şoför atanmadı" rozeti KALDIRILDI: hemen altındaki şoför satırı
          zaten aynı şeyi yazıyordu — aynı kartta, ~20px arayla, aynı koşulda
          iki kez. Uyarı artık o satırın kendisinde (aşağıda).
        */}
        {otomatikDisi && duraklar.length === 0 ? (
          <span
            className="shrink-0 rounded border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground"
            title="Otomatik dağıtım bu aracı kullanmadı — yük buna ihtiyaç duymadı. Araç kilitli değil: durak sürükleyerek ya da seçip havuzdan tıklayarak elle yükleyebilirsiniz."
          >
            otomatikte kullanılmadı
          </span>
        ) : doluluk.asim ? (
          <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
            aşım
          </span>
        ) : dusuk ? (
          <span className="shrink-0 rounded bg-caution/15 px-1.5 py-0.5 text-[11px] font-medium text-caution">
            yarı boş
          </span>
        ) : null}
        <span className="shrink-0 font-mono text-[12.5px] font-semibold text-foreground tabular-nums">
          %{Math.round(yuzde)}
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground">
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 truncate",
            soforsuzYuklu && "font-medium text-caution"
          )}
          title={
            soforsuzYuklu
              ? "Bu araca yük konuldu ama şoför düşmedi. Kadroda 3 şoför var; dördüncü araç çıkacaksa şoförü elle ayarlanmalı."
              : undefined
          }
        >
          {soforsuzYuklu ? (
            <AlertTriangleIcon className="size-3 shrink-0" strokeWidth={2} aria-hidden />
          ) : null}
          {soforAdi ?? "Şoför atanmadı"}
        </span>
        <span className="shrink-0 tabular-nums">
          {formatNumber(duraklar.length)} durak
        </span>
        <span className="shrink-0 tabular-nums">
          {formatKg(Math.round(doluluk.kg))}
        </span>
      </div>

      {aracBolgeleri.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {aracBolgeleri.map(({ kod, ad }) => (
            <span
              key={kod}
              className="flex max-w-full min-w-0 items-center gap-1 truncate rounded border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {/* Havuz ve bölge özetiyle AYNI renk — bkz. bolgeRengi. */}
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: bolgeRengi(kod) }}
                aria-hidden
              />
              <span className="min-w-0 truncate">{ad}</span>
            </span>
          ))}
          {yayilimKm > YAYILIM_UYARI_KM ? (
            <span
              className="shrink-0 cursor-help rounded bg-caution/15 px-1.5 py-0.5 text-[11px] font-medium text-caution"
              title={`En yakın ve en uzak durak arasında ${Math.round(yayilimKm)} km var — bu araç iki ayrı işi birlikte taşıyor.`}
            >
              {Math.round(yayilimKm)} km yayılım
            </span>
          ) : null}
        </div>
      ) : null}

      {/*
        Palet ızgarası BİLEREK burada değil, araç detay sayfasında
        (`/rotalar/[aracKod]`). Kartın yarısını kaplıyordu, boş araçta 18
        kesikli göz çiziyordu ve dolu bir göze tıklamak — karışık palette iki+
        müşteriyi birden — onaysız olarak araçtan düşürüyordu. Hangi karışık
        paleti kimin indireceği bir rota planlama kararı değil.
      */}

      {gun && varis ? (
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[11.5px] text-muted-foreground tabular-nums">
          <span className="text-foreground">
            {saatMetni(sonrakiKalkis())} → {saatMetni(varis)}
          </span>
          <span>({sureMetni(gun.toplamSaniye)} depoya dönüşle)</span>
          {gun.molaSaniye > 0 ? (
            <span
              className="cursor-help text-caution"
              title={`Kesintisiz sürüş 4,5 saati aşıyor — ${sureMetni(gun.molaSaniye)} takograf molası eklendi.`}
            >
              + mola
            </span>
          ) : null}
        </p>
      ) : null}

      {/* Her araç yüklenebilir — otomatik dağıtımın seçimi burayı bağlamıyor. */}
      <button
        type="button"
        onClick={onSec}
        aria-pressed={secili}
        className={cn(
          "rounded border py-1.5 text-[11.5px] transition-colors",
          secili
            ? "border-foreground/40 bg-foreground text-background"
            : "border-border text-muted-foreground hover:text-foreground"
        )}
      >
        {secili
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

/**
 * Şoföre gönderilebilecek, araç başına Google Maps güzergâh linki.
 *
 * Bu blok ekranın ÜRETTİĞİ ŞEY — akşam yapılan işin çıktısı. Eskiden iki sıra
 * uzun kartın altında, başlıksız bir chip satırıydı: sayfanın en küçük, en son
 * ve en sessiz öğesi. Artık kendi başlığı var.
 */
function GuzergahLinkleri({ rotalar }: { rotalar: HaritaRotasi[] }) {
  const dolu = rotalar.filter((r) => r.duraklar.length > 0);
  if (dolu.length === 0) return null;

  return (
    // `mt-3` yok artık — üst sarmalayıcı `flex flex-col gap-3` zaten aralığı veriyor.
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-accent/20 p-3">
      <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
        <SendIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
        Şoförlere gönder
      </h2>
      <div className="flex flex-wrap items-center gap-2">
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
    </section>
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
          kritik ? "bg-destructive" : uyari ? "bg-caution" : "bg-success"
        )}
        aria-hidden
      />
      <span className="text-[12px] text-muted-foreground">Veri</span>
      <span
        className={cn(
          "font-mono text-[12.5px] font-medium tabular-nums",
          kritik ? "text-destructive" : uyari ? "text-caution" : "text-foreground"
        )}
      >
        {metin}
      </span>
    </span>
  );
}
