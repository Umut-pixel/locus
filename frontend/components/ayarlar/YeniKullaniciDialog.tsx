"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface RolSecenegi {
  kod: string;
  ad: string;
}

interface YeniKullaniciDialogProps {
  roller: RolSecenegi[];
  onKapat: () => void;
  onOlusturuldu: (kullaniciAdi: string, geciciSifre: string) => void;
}

/**
 * Modal iskeleti `components/rota/FiloKadroPaneli.tsx`'in odak tuzağı
 * desenini izliyor — Tab döngüsü, Escape, odak iadesi.
 */
export function YeniKullaniciDialog({
  roller,
  onKapat,
  onOlusturuldu,
}: YeniKullaniciDialogProps) {
  const [adSoyad, setAdSoyad] = useState("");
  const [kullaniciAdi, setKullaniciAdi] = useState("");
  const [rolKod, setRolKod] = useState(roller[0]?.kod ?? "");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const katmanRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const oncekiOdak = document.activeElement as HTMLElement | null;
    katmanRef.current?.focus({ preventScroll: true });
    return () => oncekiOdak?.focus?.({ preventScroll: true });
  }, []);

  const odaklanabilirler = useCallback((): HTMLElement[] => {
    const kok = katmanRef.current;
    if (!kok) return [];
    return [
      ...kok.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ),
    ].filter((el) => el.offsetParent !== null || el === document.activeElement);
  }, []);

  const tuslar = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onKapat();
        return;
      }
      if (event.key !== "Tab") return;
      const liste = odaklanabilirler();
      if (liste.length === 0) return;
      const ilk = liste[0]!;
      const son = liste[liste.length - 1]!;
      const aktif = document.activeElement;
      if (event.shiftKey && (aktif === ilk || aktif === katmanRef.current)) {
        event.preventDefault();
        son.focus();
      } else if (!event.shiftKey && aktif === son) {
        event.preventDefault();
        ilk.focus();
      }
    },
    [odaklanabilirler, onKapat]
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (gonderiliyor) return;
    setHata(null);

    const adSoyadTrim = adSoyad.trim();
    const kullaniciAdiTrim = kullaniciAdi.trim();
    if (!adSoyadTrim || !kullaniciAdiTrim || !rolKod) {
      setHata("Ad soyad, kullanıcı adı ve rol gerekli.");
      return;
    }

    setGonderiliyor(true);
    try {
      const res = await fetch("/api/kullanicilar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adSoyad: adSoyadTrim,
          kullaniciAdi: kullaniciAdiTrim,
          rolKod,
        }),
      });
      const json = (await res.json()) as {
        geciciSifre?: string;
        kullaniciAdi?: string;
        error?: string;
      };
      if (!res.ok || !json.geciciSifre) {
        throw new Error(json.error ?? "Kullanıcı oluşturulamadı.");
      }
      onOlusturuldu(json.kullaniciAdi ?? kullaniciAdiTrim, json.geciciSifre);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Kullanıcı oluşturulamadı.");
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div
      ref={katmanRef}
      onKeyDown={tuslar}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 outline-none backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Yeni kullanıcı"
    >
      <div className="w-full max-w-sm rounded border border-border bg-background shadow-lg">
        <header className="flex h-12 items-center justify-between gap-3 border-b border-border px-4">
          <h2 className="text-[13px] font-medium tracking-[0.06em] text-foreground uppercase">
            Yeni kullanıcı
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

        <form onSubmit={submit} className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="yk-ad-soyad"
              className="text-[12.5px] font-medium text-foreground"
            >
              Ad Soyad
            </label>
            <Input
              id="yk-ad-soyad"
              value={adSoyad}
              onChange={(e) => setAdSoyad(e.target.value)}
              disabled={gonderiliyor}
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="yk-kullanici-adi"
              className="text-[12.5px] font-medium text-foreground"
            >
              Kullanıcı adı
            </label>
            <Input
              id="yk-kullanici-adi"
              value={kullaniciAdi}
              onChange={(e) => setKullaniciAdi(e.target.value)}
              disabled={gonderiliyor}
              placeholder="ornek.kullanici"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-foreground">Rol</span>
            <div className="flex flex-wrap gap-1.5">
              {roller.map((r) => (
                <button
                  key={r.kod}
                  type="button"
                  onClick={() => setRolKod(r.kod)}
                  aria-pressed={rolKod === r.kod}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                    rolKod === r.kod
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/70 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r.ad}
                </button>
              ))}
            </div>
          </div>

          {hata ? (
            <p className="text-[12px] text-destructive" role="alert">
              {hata}
            </p>
          ) : null}

          <Button type="submit" disabled={gonderiliyor} className="mt-1 w-full">
            {gonderiliyor ? "Oluşturuluyor…" : "Kullanıcı oluştur"}
          </Button>
        </form>
      </div>
    </div>
  );
}
