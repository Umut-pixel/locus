"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderIcon, TruckIcon, UserIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface AracKaydi {
  kod: string;
  ad: string;
  cuval_kapasite: number | null;
  palet_kapasite: number | null;
  max_kg: number | string | null;
  max_kg_teyitli: boolean | null;
  ehliyet_sinifi: string | null;
  takograf: boolean | null;
  aktif: boolean | null;
}

interface SoforKaydi {
  kod: string;
  ad: string;
  ehliyet_sinifi: string | null;
  aktif: boolean | null;
}

interface FiloKadroPaneliProps {
  onKapat: () => void;
  /** Kayıt sonrası planı tazelemek için. */
  onDegisti: () => void;
}

/**
 * Filo ve şoför kadrosu düzenleme.
 *
 * Bu iki tablo planlamanın tek doğruluk kaynağı — Panorama'da araç verisi yok.
 * Şoför işten ayrıldığında ya da bir araç servise girdiğinde koda dokunmadan
 * burada güncellensin diye var.
 */
export function FiloKadroPaneli({ onKapat, onDegisti }: FiloKadroPaneliProps) {
  const [araclar, setAraclar] = useState<AracKaydi[]>([]);
  const [soforler, setSoforler] = useState<SoforKaydi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydedilen, setKaydedilen] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    void (async () => {
      try {
        const res = await fetch("/api/filo");
        const json = (await res.json()) as {
          araclar?: AracKaydi[];
          soforler?: SoforKaydi[];
          error?: string;
        };
        if (iptal) return;
        if (!res.ok) throw new Error(json.error ?? "Filo okunamadı.");
        setAraclar(json.araclar ?? []);
        setSoforler(json.soforler ?? []);
        setHata(null);
      } catch (err) {
        if (!iptal) {
          setHata(err instanceof Error ? err.message : "Filo okunamadı.");
        }
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => {
      iptal = true;
    };
  }, []);

  const kaydet = useCallback(
    async (
      tur: "arac" | "sofor",
      kod: string,
      alanlar: Record<string, unknown>
    ) => {
      setKaydedilen(kod);
      setHata(null);
      try {
        const res = await fetch("/api/filo", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tur, kod, alanlar }),
        });
        const json = (await res.json()) as {
          kayit?: AracKaydi & SoforKaydi;
          error?: string;
        };
        if (!res.ok || !json.kayit) {
          throw new Error(json.error ?? "Kayıt güncellenemedi.");
        }
        if (tur === "arac") {
          setAraclar((o) =>
            o.map((a) => (a.kod === kod ? { ...a, ...json.kayit } : a))
          );
        } else {
          setSoforler((o) =>
            o.map((s) => (s.kod === kod ? { ...s, ...json.kayit } : s))
          );
        }
        onDegisti();
      } catch (err) {
        setHata(err instanceof Error ? err.message : "Kayıt güncellenemedi.");
      } finally {
        setKaydedilen(null);
      }
    },
    [onDegisti]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Filo ve kadro"
    >
      <div className="w-full max-w-2xl rounded border border-border bg-background shadow-lg">
        <header className="flex h-12 items-center justify-between gap-3 border-b border-border px-4">
          <h2 className="text-[13px] font-medium tracking-[0.06em] text-foreground uppercase">
            Filo ve kadro
          </h2>
          <button
            type="button"
            onClick={onKapat}
            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Kapat"
          >
            <XIcon className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
        </header>

        {hata ? (
          <p className="border-b border-destructive/25 bg-destructive/10 px-4 py-2 text-[12px] text-destructive">
            {hata}
          </p>
        ) : null}

        {yukleniyor ? (
          <p className="flex items-center gap-2 px-4 py-8 text-[13px] text-muted-foreground">
            <LoaderIcon className="size-4 animate-spin" strokeWidth={1.75} aria-hidden />
            Yükleniyor…
          </p>
        ) : (
          <div className="flex flex-col">
            <Bolum icon={UserIcon} baslik="Şoförler">
              {soforler.map((s) => (
                <SoforSatiri
                  key={`${s.kod}:${s.ad}:${s.ehliyet_sinifi}:${s.aktif}`}
                  sofor={s}
                  kaydediliyor={kaydedilen === s.kod}
                  onKaydet={(alanlar) => void kaydet("sofor", s.kod, alanlar)}
                />
              ))}
            </Bolum>

            <Bolum icon={TruckIcon} baslik="Araçlar">
              {araclar.map((a) => (
                <AracSatiri
                  key={`${a.kod}:${a.cuval_kapasite}:${a.max_kg}:${a.ehliyet_sinifi}:${a.aktif}`}
                  arac={a}
                  kaydediliyor={kaydedilen === a.kod}
                  onKaydet={(alanlar) => void kaydet("arac", a.kod, alanlar)}
                />
              ))}
            </Bolum>

            <p className="border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground">
              Şoför sayısı günlük araç sayısını belirliyor. Ehliyet kapsayıcı:
              C tüm araçları sürer, B yalnız Kangoo ve Transit.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Bolum({
  icon: Icon,
  baslik,
  children,
}: {
  icon: typeof UserIcon;
  baslik: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border last:border-b-0">
      <h3 className="flex items-center gap-1.5 border-b border-border/60 px-4 py-2 text-[11.5px] tracking-[0.06em] text-muted-foreground uppercase">
        <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
        {baslik}
      </h3>
      <div className="divide-y divide-border/40">{children}</div>
    </section>
  );
}

function SoforSatiri({
  sofor,
  kaydediliyor,
  onKaydet,
}: {
  sofor: SoforKaydi;
  kaydediliyor: boolean;
  onKaydet: (alanlar: Record<string, unknown>) => void;
}) {
  // Kaydedilen değer değişince satır `key` ile yeniden monte edilir; bu yüzden
  // prop→state senkronizasyonu için effect'e gerek yok.
  const [ad, setAd] = useState(sofor.ad);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 px-4 py-2 transition-opacity",
        kaydediliyor && "opacity-50"
      )}
    >
      <input
        type="text"
        value={ad}
        onChange={(e) => setAd(e.target.value)}
        onBlur={() => {
          if (ad.trim() && ad !== sofor.ad) onKaydet({ ad: ad.trim() });
          else setAd(sofor.ad);
        }}
        className="min-w-0 flex-1 border-b border-border bg-transparent py-0.5 text-[12.5px] text-foreground focus:border-foreground focus:outline-none"
        aria-label="Şoför adı"
      />
      <SinifSecici
        deger={sofor.ehliyet_sinifi === "B" ? "B" : "C"}
        onDegis={(v) => onKaydet({ ehliyet_sinifi: v })}
      />
      <AktifSecici
        aktif={sofor.aktif !== false}
        onDegis={(v) => onKaydet({ aktif: v })}
      />
    </div>
  );
}

function AracSatiri({
  arac,
  kaydediliyor,
  onKaydet,
}: {
  arac: AracKaydi;
  kaydediliyor: boolean;
  onKaydet: (alanlar: Record<string, unknown>) => void;
}) {
  // Satır, kaydedilen değerleri içeren bir `key` ile monte ediliyor — sunucu
  // cevabı geldiğinde bileşen sıfırlanır, effect'le senkronizasyon gerekmez.
  const [cuval, setCuval] = useState(String(arac.cuval_kapasite ?? ""));
  const [maxKg, setMaxKg] = useState(String(arac.max_kg ?? ""));

  const sayiKaydet = (
    ham: string,
    mevcut: number | string | null,
    alan: string,
    geriAl: (v: string) => void
  ) => {
    const n = Number(ham);
    if (Number.isFinite(n) && n > 0 && String(n) !== String(mevcut ?? "")) {
      onKaydet({ [alan]: n });
    } else {
      geriAl(String(mevcut ?? ""));
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 px-4 py-2 transition-opacity",
        kaydediliyor && "opacity-50"
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
        {arac.ad}
      </span>

      <label className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground">
        <input
          type="text"
          inputMode="numeric"
          value={cuval}
          onChange={(e) => setCuval(e.target.value)}
          onBlur={() =>
            sayiKaydet(cuval, arac.cuval_kapasite, "cuval_kapasite", setCuval)
          }
          className="w-14 border-b border-border bg-transparent py-0.5 text-right font-mono text-[12px] text-foreground tabular-nums focus:border-foreground focus:outline-none"
          aria-label={`${arac.ad} çuval kapasitesi`}
        />
        çuval
      </label>

      <label className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground">
        <input
          type="text"
          inputMode="numeric"
          value={maxKg}
          onChange={(e) => setMaxKg(e.target.value)}
          onBlur={() => sayiKaydet(maxKg, arac.max_kg, "max_kg", setMaxKg)}
          className="w-16 border-b border-border bg-transparent py-0.5 text-right font-mono text-[12px] text-foreground tabular-nums focus:border-foreground focus:outline-none"
          aria-label={`${arac.ad} istiap haddi`}
        />
        kg
      </label>

      <SinifSecici
        deger={arac.ehliyet_sinifi === "B" ? "B" : "C"}
        onDegis={(v) => onKaydet({ ehliyet_sinifi: v })}
      />
      <AktifSecici
        aktif={arac.aktif !== false}
        onDegis={(v) => onKaydet({ aktif: v })}
      />
    </div>
  );
}

function SinifSecici({
  deger,
  onDegis,
}: {
  deger: "B" | "C";
  onDegis: (v: "B" | "C") => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded border border-border/70 p-0.5"
      title="B → Kangoo/Transit · C → tüm araçlar"
    >
      {(["B", "C"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onDegis(s)}
          aria-pressed={deger === s}
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-[11.5px] transition-colors",
            deger === s
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function AktifSecici({
  aktif,
  onDegis,
}: {
  aktif: boolean;
  onDegis: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onDegis(!aktif)}
      aria-pressed={aktif}
      title={aktif ? "Planlamaya dahil" : "Planlamaya dahil değil"}
      className={cn(
        "shrink-0 rounded border px-1.5 py-0.5 text-[11.5px] transition-colors",
        aktif
          ? "border-border/70 text-foreground"
          : "border-border/40 text-muted-foreground line-through"
      )}
    >
      {aktif ? "aktif" : "pasif"}
    </button>
  );
}
