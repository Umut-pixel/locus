"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRoundIcon, PlusIcon } from "lucide-react";

import { AyarlarBolum } from "@/components/ayarlar/AyarlarBolum";
import { YeniKullaniciDialog } from "@/components/ayarlar/YeniKullaniciDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface KullaniciSatiri {
  id: string;
  adSoyad: string;
  kullaniciAdi: string;
  aktif: boolean;
  olusturuldu: string;
  rolKod: string | null;
  rolAdi: string | null;
}

interface RolSecenegi {
  kod: string;
  ad: string;
}

/** Ayarlar → Kullanıcılar — admin rolüne özel (sayfa zaten `ayarlar` izniyle kilitli). */
export function KullanicilarBolum() {
  const [items, setItems] = useState<KullaniciSatiri[]>([]);
  const [roller, setRoller] = useState<RolSecenegi[]>([]);
  const [loading, setLoading] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [dialogAcik, setDialogAcik] = useState(false);
  const [islemId, setIslemId] = useState<string | null>(null);
  const [geciciSifreGosterim, setGeciciSifreGosterim] = useState<{
    kullaniciAdi: string;
    sifre: string;
  } | null>(null);

  const yukle = useCallback(async () => {
    try {
      const res = await fetch("/api/kullanicilar", { cache: "no-store" });
      const json = (await res.json()) as {
        items?: KullaniciSatiri[];
        roller?: RolSecenegi[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Kullanıcılar okunamadı.");
      setItems(json.items ?? []);
      setRoller(json.roller ?? []);
      setHata(null);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Kullanıcılar okunamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const rolDegistir = useCallback(
    async (id: string, rolKod: string) => {
      setIslemId(id);
      setHata(null);
      try {
        const res = await fetch(`/api/kullanicilar/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rolKod }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Rol güncellenemedi.");
        await yukle();
      } catch (err) {
        setHata(err instanceof Error ? err.message : "Rol güncellenemedi.");
      } finally {
        setIslemId(null);
      }
    },
    [yukle]
  );

  const aktifDegistir = useCallback(
    async (id: string, aktif: boolean) => {
      setIslemId(id);
      setHata(null);
      try {
        const res = await fetch(`/api/kullanicilar/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aktif }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Durum güncellenemedi.");
        await yukle();
      } catch (err) {
        setHata(err instanceof Error ? err.message : "Durum güncellenemedi.");
      } finally {
        setIslemId(null);
      }
    },
    [yukle]
  );

  const sifreSifirla = useCallback(async (id: string, kullaniciAdi: string) => {
    setIslemId(id);
    setHata(null);
    try {
      const res = await fetch(`/api/kullanicilar/${id}/sifre-sifirla`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        geciciSifre?: string;
        error?: string;
      };
      if (!res.ok || !json.geciciSifre) {
        throw new Error(json.error ?? "Şifre sıfırlanamadı.");
      }
      setGeciciSifreGosterim({ kullaniciAdi, sifre: json.geciciSifre });
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Şifre sıfırlanamadı.");
    } finally {
      setIslemId(null);
    }
  }, []);

  return (
    <AyarlarBolum
      id="kullanicilar"
      baslik="Kullanıcılar"
      aksiyon={
        <Button size="sm" variant="outline" onClick={() => setDialogAcik(true)}>
          <PlusIcon className="size-3.5" />
          Yeni kullanıcı
        </Button>
      }
    >
      {hata ? (
        <p className="border-b border-destructive/25 bg-destructive/10 px-3.5 py-2 text-[12px] text-destructive">
          {hata}
        </p>
      ) : null}

      {geciciSifreGosterim ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[12.5px]">
          <span className="text-foreground">
            <strong>{geciciSifreGosterim.kullaniciAdi}</strong> için yeni geçici
            şifre:{" "}
            <code className="rounded bg-background/60 px-1.5 py-0.5 font-mono">
              {geciciSifreGosterim.sifre}
            </code>
          </span>
          <span className="text-muted-foreground">
            Bu şifre bir daha gösterilmeyecek — kullanıcıya iletin.
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-2 text-[11px]"
            onClick={() => setGeciciSifreGosterim(null)}
          >
            Kapat
          </Button>
        </div>
      ) : null}

      {loading ? (
        <p className="px-3.5 py-6 text-[13px] text-muted-foreground">
          Yükleniyor…
        </p>
      ) : items.length === 0 ? (
        <p className="px-3.5 py-6 text-[13px] text-muted-foreground">
          Henüz kullanıcı yok.
        </p>
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr className="border-b border-border">
              <th className="px-3.5 py-2 font-medium">Ad Soyad</th>
              <th className="px-3.5 py-2 font-medium">Kullanıcı adı</th>
              <th className="px-3.5 py-2 font-medium">Rol</th>
              <th className="px-3.5 py-2 font-medium">Durum</th>
              <th className="px-3.5 py-2 text-right font-medium">Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr
                key={u.id}
                className={cn(
                  "border-b border-border/70 transition-opacity last:border-b-0",
                  islemId === u.id && "opacity-50"
                )}
              >
                <td className="px-3.5 py-2 font-medium">{u.adSoyad}</td>
                <td className="px-3.5 py-2 font-mono text-muted-foreground">
                  {u.kullaniciAdi}
                </td>
                <td className="px-3.5 py-2">
                  <div className="flex flex-wrap gap-1">
                    {roller.map((r) => (
                      <button
                        key={r.kod}
                        type="button"
                        disabled={islemId === u.id}
                        onClick={() =>
                          u.rolKod !== r.kod && void rolDegistir(u.id, r.kod)
                        }
                        aria-pressed={u.rolKod === r.kod}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                          u.rolKod === r.kod
                            ? "border-foreground bg-foreground text-background"
                            : "border-border/70 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {r.ad}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-3.5 py-2">
                  <button
                    type="button"
                    disabled={islemId === u.id}
                    onClick={() => void aktifDegistir(u.id, !u.aktif)}
                    title={u.aktif ? "Pasifleştir" : "Aktifleştir"}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                      u.aktif
                        ? "border-border/70 text-foreground"
                        : "border-border/40 text-muted-foreground line-through"
                    )}
                  >
                    {u.aktif ? "aktif" : "pasif"}
                  </button>
                </td>
                <td className="px-3.5 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={islemId === u.id}
                    onClick={() => void sifreSifirla(u.id, u.kullaniciAdi)}
                    className="h-7 gap-1 px-2 text-[11px]"
                  >
                    <KeyRoundIcon className="size-3" />
                    Şifre sıfırla
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dialogAcik ? (
        <YeniKullaniciDialog
          roller={roller}
          onKapat={() => setDialogAcik(false)}
          onOlusturuldu={(kullaniciAdi, sifre) => {
            setDialogAcik(false);
            setGeciciSifreGosterim({ kullaniciAdi, sifre });
            void yukle();
          }}
        />
      ) : null}
    </AyarlarBolum>
  );
}
