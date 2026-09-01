"use client";

import { useCallback, useMemo, useState } from "react";
import { Typography } from "@heroui/react";
import {
  CheckIcon,
  ExternalLinkIcon,
  LoaderIcon,
  SaveIcon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react";

import { AracKarti, type RotaBilgisi } from "@/components/rota/AracKarti";
import { DurakHavuzu } from "@/components/rota/DurakHavuzu";
import { RotaOzetSeridi } from "@/components/rota/RotaOzetSeridi";
import {
  RotaHaritasi,
  aracRengi,
  type HaritaRotasi,
} from "@/components/rota/RotaHaritasi";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { useRaporTazeligi } from "@/hooks/useMusteriRaporlama";
import {
  ROTA_REPORT_ID,
  useRotaPlani,
  type RotaDuragi,
} from "@/hooks/useRotaPlani";
import { DEPOT, googleMapsDirUrl } from "@/lib/depot";
import { formatNumber } from "@/lib/format";
import { dolulukHesapla, sweepKumele } from "@/lib/rota/atama";
import { cn } from "@/lib/utils";

/** aracKod → sıralı musteriKodu listesi. Sıra = durak numarası. */
type Plan = Record<string, string[]>;

export default function RotalarPage() {
  const { loading, error, duraklar, araclar, ozet } = useRotaPlani();

  const [plan, setPlan] = useState<Plan>({});
  const [seciliArac, setSeciliArac] = useState<string | null>(null);
  const [optimizeEdilen, setOptimizeEdilen] = useState<string | null>(null);
  const [rotaBilgileri, setRotaBilgileri] = useState<
    Record<string, RotaBilgisi>
  >({});
  const [optimizeHatalari, setOptimizeHatalari] = useState<
    Record<string, string>
  >({});
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [kayitDurumu, setKayitDurumu] = useState<
    { tur: "ok" | "hata"; mesaj: string } | null
  >(null);

  const durakHaritasi = useMemo(() => {
    const m = new Map<string, RotaDuragi>();
    for (const d of duraklar) m.set(d.musteriKodu, d);
    return m;
  }, [duraklar]);

  const atananlar = useMemo(
    () => new Set(Object.values(plan).flat()),
    [plan]
  );

  const havuz = useMemo(
    () => duraklar.filter((d) => !atananlar.has(d.musteriKodu)),
    [duraklar, atananlar]
  );

  const aracDuraklari = useCallback(
    (aracKod: string): RotaDuragi[] =>
      (plan[aracKod] ?? [])
        .map((kod) => durakHaritasi.get(kod))
        .filter((d): d is RotaDuragi => d != null),
    [plan, durakHaritasi]
  );

  const rotalar = useMemo<HaritaRotasi[]>(
    () =>
      araclar.map((a, i) => ({
        aracKod: a.kod,
        aracAd: a.ad,
        renk: aracRengi(i),
        duraklar: aracDuraklari(a.kod),
      })),
    [araclar, aracDuraklari]
  );

  /** Atama değişti — o araç için eski güzergâh süresi geçersiz. */
  const rotaBilgisiniDusur = useCallback((aracKod: string) => {
    setRotaBilgileri((o) => {
      if (o[aracKod] == null) return o;
      const sonraki = { ...o };
      delete sonraki[aracKod];
      return sonraki;
    });
    setOptimizeHatalari((o) => {
      if (o[aracKod] == null) return o;
      const sonraki = { ...o };
      delete sonraki[aracKod];
      return sonraki;
    });
  }, []);

  /**
   * Sweep kümeleme — depodan kutupsal açıya göre dizip kapasite dolana kadar
   * aynı araca yükler. Panorama rut'unun `ziyaret_sira` alanı coğrafi
   * olmadığı için (gün tutarlılığı %18, sıra TSP alt sınırının 4,5–37 katı)
   * duraklar koordinattan yeniden kümeleniyor.
   */
  const otomatikDagit = useCallback(() => {
    const sonuc = sweepKumele(duraklar, araclar, DEPOT);
    const sonraki: Plan = {};
    for (const yuk of sonuc.yukler) {
      sonraki[yuk.arac.kod] = yuk.duraklar.map((d) => d.musteriKodu);
    }
    setPlan(sonraki);
    setRotaBilgileri({});
    setOptimizeHatalari({});
  }, [duraklar, araclar]);

  const hepsiniTemizle = useCallback(() => {
    setPlan({});
    setSeciliArac(null);
    setRotaBilgileri({});
    setOptimizeHatalari({});
  }, []);

  const durakEkle = useCallback(
    (musteriKodu: string) => {
      if (seciliArac == null) return;
      setPlan((o) => ({
        ...o,
        [seciliArac]: [...(o[seciliArac] ?? []), musteriKodu],
      }));
      rotaBilgisiniDusur(seciliArac);
    },
    [seciliArac, rotaBilgisiniDusur]
  );

  const durakCikar = useCallback(
    (musteriKodu: string) => {
      setPlan((o) => {
        const sonraki: Plan = {};
        for (const [kod, liste] of Object.entries(o)) {
          sonraki[kod] = liste.filter((k) => k !== musteriKodu);
          if (sonraki[kod].length !== liste.length) rotaBilgisiniDusur(kod);
        }
        return sonraki;
      });
    },
    [rotaBilgisiniDusur]
  );

  const aracTemizle = useCallback(
    (aracKod: string) => {
      setPlan((o) => ({ ...o, [aracKod]: [] }));
      rotaBilgisiniDusur(aracKod);
    },
    [rotaBilgisiniDusur]
  );

  /** Google Routes — trafikli durak sırası. Hata olursa mevcut sıra korunur. */
  const optimizeEt = useCallback(
    async (aracKod: string) => {
      const liste = aracDuraklari(aracKod).filter(
        (d) => d.lat != null && d.lon != null
      );
      if (liste.length < 2) return;

      setOptimizeEdilen(aracKod);
      setOptimizeHatalari((o) => {
        const sonraki = { ...o };
        delete sonraki[aracKod];
        return sonraki;
      });

      try {
        const res = await fetch("/api/rota/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            duraklar: liste.map((d) => ({ lat: d.lat, lon: d.lon })),
          }),
        });
        const json = (await res.json()) as {
          sira?: number[];
          toplamSaniye?: number;
          toplamMetre?: number;
          trafik?: string;
          error?: string;
        };

        if (!res.ok || !Array.isArray(json.sira)) {
          throw new Error(json.error ?? "Optimizasyon başarısız.");
        }

        const yeniSira = json.sira
          .map((i) => liste[i]?.musteriKodu)
          .filter((k): k is string => k != null);

        setPlan((o) => ({ ...o, [aracKod]: yeniSira }));
        setRotaBilgileri((o) => ({
          ...o,
          [aracKod]: {
            saniye: json.toplamSaniye ?? 0,
            metre: json.toplamMetre ?? 0,
            trafik: json.trafik ?? "",
          },
        }));
      } catch (err) {
        setOptimizeHatalari((o) => ({
          ...o,
          [aracKod]:
            err instanceof Error ? err.message : "Optimizasyon başarısız.",
        }));
      } finally {
        setOptimizeEdilen(null);
      }
    },
    [aracDuraklari]
  );

  /**
   * Planı kaydet — ERP'de olmayan "hangi yük hangi araçla gitti" geçmişini
   * biriktiren tek yer. Aynı gün + araç için önceki kayıt sunucuda silinip
   * yeniden yazılır, çift kayıt olmaz.
   */
  const planiKaydet = useCallback(async () => {
    const gonderilecek = araclar
      .map((a) => {
        const liste = aracDuraklari(a.kod);
        if (liste.length === 0) return null;
        const d = dolulukHesapla(a, liste);
        const bilgi = rotaBilgileri[a.kod];
        return {
          aracKod: a.kod,
          duraklar: liste.map((x) => ({
            musteriKodu: x.musteriKodu,
            kg: x.kg,
            cuvalEsdeger: x.cuvalEsdeger,
          })),
          kgDoluluk: d.kgYuzde,
          cuvalDoluluk: d.cuvalYuzde,
          googleSureSn: bilgi?.saniye ?? null,
          googleMesafeM: bilgi?.metre ?? null,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);

    if (gonderilecek.length === 0) return;

    setKaydediliyor(true);
    setKayitDurumu(null);
    try {
      const res = await fetch("/api/rota/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planlar: gonderilecek }),
      });
      const json = (await res.json()) as {
        planSayisi?: number;
        durakSayisi?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Plan kaydedilemedi.");
      setKayitDurumu({
        tur: "ok",
        mesaj: `${formatNumber(json.planSayisi ?? 0)} araç planı kaydedildi.`,
      });
    } catch (err) {
      setKayitDurumu({
        tur: "hata",
        mesaj: err instanceof Error ? err.message : "Plan kaydedilemedi.",
      });
    } finally {
      setKaydediliyor(false);
    }
  }, [araclar, aracDuraklari, rotaBilgileri]);

  const atananSayisi = atananlar.size;
  const seciliAracAdi = araclar.find((a) => a.kod === seciliArac)?.ad ?? null;

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <div className="flex min-w-0 items-center gap-3">
          <Typography.Heading level={5} className="shrink-0 tracking-tight">
            Rotalar
          </Typography.Heading>
          {duraklar.length > 0 ? (
            <span
              className="inline-flex h-6 shrink-0 cursor-help items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 font-mono text-[12.5px] font-medium text-emerald-400 tabular-nums"
              title="Araçlara atanan durak / bekleyen siparişi olan toplam müşteri."
            >
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
              {formatNumber(atananSayisi)}/{formatNumber(duraklar.length)}
            </span>
          ) : null}
          <Typography.Paragraph
            size="sm"
            color="muted"
            truncate
            className="hidden md:block"
          >
            Bekleyen sipariş yükü, araç doluluğu ve güzergâh
          </Typography.Paragraph>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <VeriTazeligi />
          <button
            type="button"
            onClick={otomatikDagit}
            disabled={loading || duraklar.length === 0 || araclar.length === 0}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12.5px] font-medium transition-colors",
              "hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            )}
            title="Depodan açıya göre süpürüp kapasite dolana kadar araçlara dağıtır"
          >
            <SparklesIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
            Otomatik dağıt
          </button>
          {atananSayisi > 0 ? (
            <button
              type="button"
              onClick={() => void planiKaydet()}
              disabled={kaydediliyor}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12.5px] font-medium transition-colors hover:bg-accent disabled:opacity-40"
              title="Bugünün araç planlarını kaydet — araç/yük geçmişi burada birikir"
            >
              {kaydediliyor ? (
                <LoaderIcon className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
              ) : (
                <SaveIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
              )}
              Planı kaydet
            </button>
          ) : null}
          {atananSayisi > 0 ? (
            <button
              type="button"
              onClick={hepsiniTemizle}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12.5px] font-medium transition-colors hover:bg-accent"
              title="Tüm atamaları geri al"
            >
              <Undo2Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
              Sıfırla
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Typography
          type="body-sm"
          className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-3.5 py-2 text-destructive"
        >
          {error}
        </Typography>
      ) : null}

      {kayitDurumu ? (
        <p
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-b px-3.5 py-1.5 text-[12px]",
            kayitDurumu.tur === "ok"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {kayitDurumu.tur === "ok" ? (
            <CheckIcon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          ) : null}
          {kayitDurumu.mesaj}
        </p>
      ) : null}

      {ozet.teyitsizAracSayisi > 0 ? (
        <p className="shrink-0 border-b border-amber-500/25 bg-amber-500/10 px-3.5 py-1.5 text-[12px] text-amber-400">
          {formatNumber(ozet.teyitsizAracSayisi)} aracın istiap haddi tahmini —
          ruhsat değerleri teyit edilene kadar ağırlık doluluğu yaklaşıktır.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <RotaOzetSeridi ozet={ozet} loading={loading} />

        <div className="grid border-b border-border lg:grid-cols-3 [&>section]:h-[26rem]">
          <DurakHavuzu
            duraklar={havuz}
            seciliAracAdi={seciliAracAdi}
            onDurakEkle={durakEkle}
            loading={loading}
          />

          <section className="flex min-w-0 flex-col overflow-y-auto border-b border-border lg:border-r lg:border-b-0">
            {araclar.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <p className="text-[13px] text-muted-foreground">
                  {loading ? "Filo yükleniyor…" : "Aktif araç tanımlı değil."}
                </p>
              </div>
            ) : (
              araclar.map((a) => (
                <AracKarti
                  key={a.kod}
                  arac={a}
                  duraklar={aracDuraklari(a.kod)}
                  secili={seciliArac === a.kod}
                  onSec={() =>
                    setSeciliArac((o) => (o === a.kod ? null : a.kod))
                  }
                  onDurakCikar={durakCikar}
                  onTemizle={() => aracTemizle(a.kod)}
                  onOptimize={() => void optimizeEt(a.kod)}
                  optimizeEdiliyor={optimizeEdilen === a.kod}
                  rotaBilgi={rotaBilgileri[a.kod] ?? null}
                  optimizeHatasi={optimizeHatalari[a.kod] ?? null}
                />
              ))
            )}
          </section>

          <section className="relative flex min-w-0 flex-col">
            <RotaHaritasi rotalar={rotalar} havuz={havuz} />
          </section>
        </div>

        <GuzergahLinkleri rotalar={rotalar} />
      </div>
    </div>
  );
}

/** Araç başına depodan başlayan Google Maps yol tarifi — mevcut depot.ts yardımcısı. */
function GuzergahLinkleri({ rotalar }: { rotalar: HaritaRotasi[] }) {
  const dolu = rotalar.filter((r) => r.duraklar.length > 0);
  if (dolu.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
      {dolu.map((r) => {
        const konumlu = r.duraklar.filter(
          (d): d is RotaDuragi & { lat: number; lon: number } =>
            d.lat != null && d.lon != null
        );
        if (konumlu.length === 0) return null;
        return (
          <a
            key={r.aracKod}
            href={googleMapsDirUrl(konumlu, { includeDepot: true })}
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
