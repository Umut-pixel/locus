"use client";

import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  LoaderIcon,
  MapIcon,
  MapPinIcon,
  PackagePlusIcon,
} from "lucide-react";

import { MusteriAdIlce } from "@/components/sevkiyat/MusteriAdIlce";
import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import type { RotaAraci } from "@/hooks/useRotaPlani";
import { formatKg, formatNumber } from "@/lib/format";
import { bolgeRengi } from "@/lib/rota/bolge-renk";
import type { Bolge } from "@/lib/rota/bolge";
import { cn } from "@/lib/utils";

interface BolgeOzetiProps {
  bolgeler: Bolge[];
  /** musteriKodu → aracAd. Plana girmemiş durak haritada olmaz. */
  durakAraci: Map<string, string>;
  /** Yükleme hedefi seçenekleri. */
  filo: RotaAraci[];
  loading: boolean;
  /**
   * Bölgedeki havuzda kalan durakları `aracKod`'a (remove+add) yükler; sonra
   * doluluğu bildirir, rotasını kurar ve haritayı açar — çağıran (sayfa)
   * bu üçünü tek eylemde birleştiriyor.
   */
  onBolgeYukle: (musteriKodlari: string[], aracKod: string) => void | Promise<void>;
}

interface Satir {
  bolge: Bolge;
  /** Bu bölgeyi taşıyan araçlar. Birden fazlaysa bölge bölünmüş. */
  araclar: string[];
  atanmamis: number;
}

/** "izmir-rut-3" → 3. Eşleşmezse null (İzmir rutu değil). */
function rutNumarasi(kod: string): number | null {
  const m = /^izmir-rut-(\d+)$/.exec(kod);
  return m ? Number(m[1]) : null;
}

/**
 * Bölge → yük → araç tablosu, satırları açılabilir.
 *
 * Araç kartları "bu araçta ne var" sorusunu cevaplıyor; buradaki soru tersi:
 * "bu bölgeye kim gidiyor, bölündü mü". Bölünmüş bölge sahada aynı ilçeye iki
 * kez gitmek demek — ekranda görünmezse fark edilmiyor.
 *
 * Satır açılınca bölgedeki müşteriler tek tek görünüyor: kim, ne kadar yük,
 * hangi araçta. Kapalıyken yalnız toplam vardı; "bu 245 kg kimin" sorusu ancak
 * araç kartları taranarak cevaplanabiliyordu.
 *
 * İZMİR AĞACI: 6 sabit rut (`lib/rota/bolge.ts`teki IZMIR_RUTLARI) ayrı bölge
 * kodlarıyla geliyor — düz listede aynı anda 6 satır tutuyorlardı, "karışık
 * görünüyor" şikâyeti buradan geldi. Artık tek bir "İzmir" üst satırın altında
 * toplanıp katlanıyorlar; diğer şehirler (Balıkesir, Muğla…) değişmeden düz
 * satır olarak kalıyor. İzmir depo şehri olduğu için liste EN BAŞTA —
 * uzaklığa göre sıralamaya bırakılırsa bazı günler dibe düşüyordu.
 *
 * İŞLEV — "Araca yükle": panel eskiden salt-okunurdu ("bak, hangi bölge
 * nerede") ya da yalnız GELECEĞİ etkiliyordu ("Araca sabitle" — otomatik
 * dağıtıma dokunur, o an hiçbir şeyi taşımazdı). Artık her satırın açılan
 * detayında filodaki her araç için bir düğme var; tıklamak o bölgenin
 * havuzda kalan tüm duraklarını HEMEN o araca taşır, doluluğu bildirir,
 * rotasını kurar ve haritayı açar.
 */
export function BolgeOzeti({
  bolgeler,
  durakAraci,
  filo,
  loading,
  onBolgeYukle,
}: BolgeOzetiProps) {
  /** Aynı anda tek bölge açık — birden fazlası listeyi boğuyor. */
  const [acikKod, setAcikKod] = useState<string | null>(null);
  /** İzmir ağacı — varsayılan kapalı, çocuklar sadece açılınca görünür. */
  const [izmirAcik, setIzmirAcik] = useState(false);

  const satirlar = useMemo<Satir[]>(() => {
    return bolgeler
      .map((bolge) => {
        const araclar = new Set<string>();
        let atanmamis = 0;
        for (const d of bolge.duraklar) {
          const arac = durakAraci.get(d.musteriKodu);
          if (arac) araclar.add(arac);
          else atanmamis += 1;
        }
        return { bolge, araclar: [...araclar], atanmamis };
      })
      // Uzak bölgeler üstte: planlamada ilk karar verilmesi gerekenler onlar.
      .sort((a, b) => b.bolge.depoyaKm - a.bolge.depoyaKm);
  }, [bolgeler, durakAraci]);

  const { izmirSatirlari, digerSatirlari } = useMemo(() => {
    const izmir: Satir[] = [];
    const diger: Satir[] = [];
    for (const s of satirlar) {
      if (rutNumarasi(s.bolge.kod) != null) izmir.push(s);
      else diger.push(s);
    }
    // RUT numarasına göre — kullanıcının kendi sıraladığı 1→6 sırası.
    izmir.sort((a, b) => rutNumarasi(a.bolge.kod)! - rutNumarasi(b.bolge.kod)!);
    return { izmirSatirlari: izmir, digerSatirlari: diger };
  }, [satirlar]);

  const izmirVar = izmirSatirlari.length > 0;

  const izmirToplam = useMemo(() => {
    let durak = 0;
    let kg = 0;
    for (const s of izmirSatirlari) {
      durak += s.bolge.duraklar.length;
      kg += s.bolge.kg;
    }
    return { durak, kg };
  }, [izmirSatirlari]);

  /** Toplam bölünmüş bölge — İzmir çocukları dahil, gerçek operasyon uyarısı. */
  const bolunmus = satirlar.filter((s) => s.araclar.length > 1).length;
  /** Başlıktaki sayaç: kaç AYRI GRUP var — 6 rut kullanıcı için tek "İzmir". */
  const grupSayisi = digerSatirlari.length + (izmirVar ? 1 : 0);

  /**
   * İzmir HER ZAMAN EN BAŞTA — depo şehri, günün asıl işi. Diğer şehirler
   * ardından uzaklığa göre (satirlar zaten öyle sıralı, digerSatirlari onu
   * bozmadan filtreliyor).
   */
  type RenderOge = { tur: "satir"; satir: Satir } | { tur: "izmir" };
  const renderListesi = useMemo<RenderOge[]>(() => {
    const liste: RenderOge[] = [];
    if (izmirVar) liste.push({ tur: "izmir" });
    for (const s of digerSatirlari) liste.push({ tur: "satir", satir: s });
    return liste;
  }, [izmirVar, digerSatirlari]);

  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    satirlar.length
  );

  const ortakSatirProps = { durakAraci, filo, onBolgeYukle };

  return (
    <section
      ref={wrapperRef}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border"
    >
      {/*
        Panel her zaman AÇIK liste — katlanabilir bir dış anahtar YOK.
        Yalnız TEK TEK bölge satırları (ve İzmir ağacı) tıklanınca açılıp
        kapanıyor.
      */}
      <h2 className="flex h-11 w-full shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <MapIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="truncate">Bölgeler</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {bolunmus > 0 ? (
            <span className="flex items-center gap-1 text-[11.5px] font-medium text-caution">
              <AlertTriangleIcon className="size-3" strokeWidth={2} aria-hidden />
              {formatNumber(bolunmus)} bölünmüş
            </span>
          ) : null}
          <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">
            {formatNumber(grupSayisi)}
          </span>
        </span>
      </h2>

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto transition-opacity",
          loading && "opacity-40"
        )}
      >
        {satirlar.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-[12.5px] text-muted-foreground">
            {loading ? "Bölgeler hesaplanıyor…" : "Bekleyen yük yok."}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {renderListesi.map((oge) =>
              oge.tur === "satir" ? (
                <BolgeSatiri
                  key={oge.satir.bolge.kod}
                  satir={oge.satir}
                  acik={acikKod === oge.satir.bolge.kod}
                  onToggle={() =>
                    setAcikKod((k) => (k === oge.satir.bolge.kod ? null : oge.satir.bolge.kod))
                  }
                  {...ortakSatirProps}
                />
              ) : (
                <IzmirDali
                  key="izmir"
                  satirlar={izmirSatirlari}
                  toplam={izmirToplam}
                  acik={izmirAcik}
                  onToggle={() => setIzmirAcik((o) => !o)}
                  acikKod={acikKod}
                  onSatirToggle={(kod) => setAcikKod((k) => (k === kod ? null : kod))}
                  {...ortakSatirProps}
                />
              )
            )}
          </ul>
        )}
      </div>
      <ScrollBottomFade />
    </section>
  );
}

interface OrtakSatirProps {
  durakAraci: Map<string, string>;
  filo: RotaAraci[];
  onBolgeYukle: (musteriKodlari: string[], aracKod: string) => void | Promise<void>;
}

/**
 * İzmir üst satırı — katlanınca 6 rutu bir arada tutar.
 *
 * Tek bir bölge rengi yok (6 farklı rut, 6 farklı renk taşıyor), o yüzden nokta
 * yerine şehir ikonu kullanılıyor. Açılınca çocuklar SOLDA İNCE BİR GÖVDE
 * ÇİZGİSİYLE bağlı — `components/ui/hook-sidebar.tsx`teki köşeli-ray fikrinin
 * sade/statik hâli: burada 6 satırın konumu sabit, karmaşık bir animasyonlu
 * ölçüm gerekmiyor.
 */
function IzmirDali({
  satirlar,
  toplam,
  acik,
  onToggle,
  acikKod,
  onSatirToggle,
  ...ortak
}: OrtakSatirProps & {
  satirlar: Satir[];
  toplam: { durak: number; kg: number };
  acik: boolean;
  onToggle: () => void;
  acikKod: string | null;
  onSatirToggle: (kod: string) => void;
}) {
  const bolunmus = satirlar.filter((s) => s.araclar.length > 1).length;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={acik}
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 px-3.5 py-2 text-left transition-colors",
          acik ? "bg-muted/40" : "hover:bg-muted/30"
        )}
        title="İzmir — 6 sabit rut (Melih'in tarif ettiği yol coğrafyasına göre)"
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            acik && "rotate-90"
          )}
          strokeWidth={2}
          aria-hidden
        />
        <MapPinIcon className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          İzmir
        </span>
        {bolunmus > 0 ? (
          <span className="shrink-0 text-[11px] font-medium text-caution">
            {formatNumber(bolunmus)} bölünmüş
          </span>
        ) : null}
        <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
          {formatNumber(satirlar.length)} rut · {formatNumber(toplam.durak)} durak ·{" "}
          {formatKg(Math.round(toplam.kg))}
        </span>
      </button>

      {acik ? (
        <div className="relative pl-4">
          {/* Gövde çizgisi — İzmir'e bağlı 6 rutun soldan tek hat izlemesi. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 left-4 w-px bg-border"
          />
          <ul className="divide-y divide-border/30">
            {satirlar.map((s) => (
              <BolgeSatiri
                key={s.bolge.kod}
                satir={s}
                acik={acikKod === s.bolge.kod}
                onToggle={() => onSatirToggle(s.bolge.kod)}
                girintili
                {...ortak}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

/** Tek bir bölge satırı — hem düz listede hem İzmir dalının içinde kullanılır. */
function BolgeSatiri({
  satir: { bolge, araclar, atanmamis },
  acik,
  onToggle,
  girintili = false,
  durakAraci,
  filo,
  onBolgeYukle,
}: OrtakSatirProps & {
  satir: Satir;
  acik: boolean;
  onToggle: () => void;
  /** İzmir dalının çocuğu — ekstra sol boşluk, dala bağlanan dirsek çizgisi. */
  girintili?: boolean;
}) {
  /** Havuzda kalan (henüz araca atanmamış) durakların kodları — yükleme hedefi. */
  const havuzdakiKodlar = useMemo(
    () => bolge.duraklar.filter((d) => !durakAraci.has(d.musteriKodu)).map((d) => d.musteriKodu),
    [bolge.duraklar, durakAraci]
  );
  /** Tıklanan araç — istek sürerken o düğme kilitlenip döner, diğerleri kalır. */
  const [yukleniyorAracKod, setYukleniyorAracKod] = useState<string | null>(null);

  const yukle = async (aracKod: string) => {
    if (yukleniyorAracKod != null) return;
    setYukleniyorAracKod(aracKod);
    try {
      await onBolgeYukle(havuzdakiKodlar, aracKod);
      // Başarılıysa sayfa haritaya yönlendiriliyor — bu bileşen kalksa da
      // kalmasa da fark etmez, ayrıca sıfırlamaya gerek yok.
    } finally {
      setYukleniyorAracKod(null);
    }
  };

  return (
    <Fragment>
      <li className={girintili ? "relative" : undefined}>
        {girintili ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 h-3 w-3 -translate-y-1/2 rounded-bl-md border-b border-l border-border"
          />
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={acik}
          className={cn(
            "flex w-full min-w-0 flex-col gap-1 py-2 pr-3.5 text-left transition-colors",
            girintili ? "pl-9" : "pl-3.5",
            acik ? "bg-muted/40" : "hover:bg-muted/30"
          )}
          title={
            bolge.ilceler.length > 0
              ? `İlçeler: ${bolge.ilceler.join(", ")}`
              : "İlçe bilgisi olmayan duraklar koordinata göre kümelendi"
          }
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <ChevronRightIcon
              className={cn(
                "size-3 shrink-0 text-muted-foreground transition-transform",
                acik && "rotate-90"
              )}
              strokeWidth={2}
              aria-hidden
            />
            {/* Havuz listesiyle AYNI renk — bkz. bolgeRengi. */}
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: bolgeRengi(bolge.kod) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
              {bolge.ad}
            </span>
            <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
              {formatNumber(bolge.duraklar.length)} durak ·{" "}
              {formatKg(Math.round(bolge.kg))} ·{" "}
              {Math.round(bolge.depoyaKm)} km
            </span>
          </span>

          <span className="flex min-w-0 flex-wrap items-center gap-1 pl-[18px]">
            {araclar.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">araca atanmadı</span>
            ) : (
              araclar.map((a) => (
                <span
                  key={a}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[11px]",
                    araclar.length > 1
                      ? "border-caution/40 text-caution"
                      : "border-border/70 text-muted-foreground"
                  )}
                >
                  {a}
                </span>
              ))
            )}
            {atanmamis > 0 && araclar.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                +{formatNumber(atanmamis)} havuzda
              </span>
            ) : null}
          </span>
        </button>
      </li>

      {acik ? (
        <li className="bg-muted/20">
          {/*
            ARACA YÜKLE — panelin işlevi. Eskiden bu satır "Araca sabitle"ydi:
            yalnız GELECEKTEKİ otomatik dağıtımı etkiliyordu, o an hiçbir şeyi
            taşımıyordu. Artık bir araca tıklamak o bölgenin havuzda kalan
            duraklarını HEMEN o araca taşır (`onBolgeYukle`, sayfada doluluk
            bildirimi + rota kurma + haritaya yönlendirmeyle birleşik).
          */}
          {havuzdakiKodlar.length > 0 && filo.length > 0 ? (
            <div
              className={cn(
                "flex min-w-0 flex-wrap items-center gap-1 border-b border-border/40 py-1.5 pr-3.5",
                girintili ? "pl-[3.25rem]" : "pl-8"
              )}
            >
              <span className="shrink-0 text-[11px] text-muted-foreground">
                Havuzdaki {formatNumber(havuzdakiKodlar.length)} durağı araca yükle
              </span>
              {filo.map((a) => {
                const buYukleniyor = yukleniyorAracKod === a.kod;
                return (
                  <button
                    key={a.kod}
                    type="button"
                    disabled={yukleniyorAracKod != null}
                    onClick={() => void yukle(a.kod)}
                    title={`${havuzdakiKodlar.length} durağı ${a.ad} aracına yükle, rotasını oluştur ve haritada göster`}
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition-colors",
                      "border-border/70 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                      yukleniyorAracKod != null && !buYukleniyor && "opacity-40"
                    )}
                  >
                    {buYukleniyor ? (
                      <LoaderIcon className="size-3 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
                    ) : (
                      <PackagePlusIcon className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                    )}
                    {a.ad}
                  </button>
                );
              })}
            </div>
          ) : null}

          <ul className="divide-y divide-border/40">
            {/* Ağır durak üstte: bölgeyi kim taşıyor, önce o okunur. */}
            {[...bolge.duraklar]
              .sort((a, b) => b.kg - a.kg)
              .map((d) => {
                const arac = durakAraci.get(d.musteriKodu) ?? null;
                return (
                  <li
                    key={d.musteriKodu}
                    className={cn(
                      "flex min-w-0 items-center gap-2 py-1.5 pr-3.5",
                      girintili ? "pl-[3.25rem]" : "pl-8"
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <MusteriAdIlce
                        ad={d.unvan}
                        ilce={d.ilce ?? null}
                        className="text-[12.5px] text-foreground"
                      />
                      <span
                        className={cn(
                          "truncate text-[11px]",
                          arac ? "text-muted-foreground" : "text-caution"
                        )}
                      >
                        {arac ?? "havuzda — araca atanmadı"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-mono text-[11.5px] text-muted-foreground tabular-nums">
                      {formatKg(Math.round(d.kg))}
                      <span className="block opacity-70">
                        {formatNumber(Math.round(d.cuvalEsdeger))} çuval
                      </span>
                    </span>
                  </li>
                );
              })}
          </ul>
        </li>
      ) : null}
    </Fragment>
  );
}
