"use client";

import { useState, type FormEvent } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { AyarlarBolum } from "@/components/ayarlar/AyarlarBolum";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastManager } from "@/components/ui/toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * Herkese açık — her kullanıcı yalnız KENDİ şifresini değiştirir (izin
 * gerekmez). Admin'in başka birinin şifresini sıfırlaması ayrı bir akış:
 * Kullanıcılar sekmesi → "Şifre sıfırla" (kullanici_yonetimi izniyle).
 */
export function HesabimBolum() {
  const { user, loading: kullaniciYukleniyor } = useCurrentUser();
  const [mevcutSifre, setMevcutSifre] = useState("");
  const [yeniSifre, setYeniSifre] = useState("");
  const [yeniSifreTekrar, setYeniSifreTekrar] = useState("");
  const [goster, setGoster] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (gonderiliyor) return;
    setHata(null);

    if (yeniSifre !== yeniSifreTekrar) {
      setHata("Yeni şifreler eşleşmiyor.");
      return;
    }
    if (yeniSifre.length < 6) {
      setHata("Yeni şifre en az 6 karakter olmalı.");
      return;
    }

    setGonderiliyor(true);
    try {
      const res = await fetch("/api/auth/sifre-degistir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mevcutSifre, yeniSifre }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Şifre değiştirilemedi.");
      toastManager.add({ type: "success", title: "Şifreniz güncellendi" });
      setMevcutSifre("");
      setYeniSifre("");
      setYeniSifreTekrar("");
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Şifre değiştirilemedi.");
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <AyarlarBolum
      baslik="Hesabım"
      aciklama="Hesap bilgileriniz ve şifre değişikliği."
    >
      <div className="grid grid-cols-1 gap-px border-b border-border bg-border sm:grid-cols-3">
        <BilgiHucresi
          etiket="Ad Soyad"
          deger={kullaniciYukleniyor ? "—" : (user?.adSoyad ?? "—")}
        />
        <BilgiHucresi
          etiket="Kullanıcı adı"
          deger={kullaniciYukleniyor ? "—" : (user?.kullaniciAdi ?? "—")}
        />
        <BilgiHucresi
          etiket="Rol"
          deger={kullaniciYukleniyor ? "—" : (user?.rolAdi ?? "—")}
        />
      </div>

      <form onSubmit={submit} className="flex max-w-sm flex-col gap-3 px-3.5 py-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="hesabim-mevcut"
            className="text-[12.5px] font-medium text-foreground"
          >
            Mevcut şifre
          </label>
          <Input
            id="hesabim-mevcut"
            type={goster ? "text" : "password"}
            value={mevcutSifre}
            onChange={(e) => setMevcutSifre(e.target.value)}
            autoComplete="current-password"
            disabled={gonderiliyor}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="hesabim-yeni"
            className="text-[12.5px] font-medium text-foreground"
          >
            Yeni şifre
          </label>
          <Input
            id="hesabim-yeni"
            type={goster ? "text" : "password"}
            value={yeniSifre}
            onChange={(e) => setYeniSifre(e.target.value)}
            autoComplete="new-password"
            disabled={gonderiliyor}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="hesabim-yeni-tekrar"
            className="text-[12.5px] font-medium text-foreground"
          >
            Yeni şifre (tekrar)
          </label>
          <Input
            id="hesabim-yeni-tekrar"
            type={goster ? "text" : "password"}
            value={yeniSifreTekrar}
            onChange={(e) => setYeniSifreTekrar(e.target.value)}
            autoComplete="new-password"
            disabled={gonderiliyor}
            required
          />
        </div>

        <button
          type="button"
          onClick={() => setGoster((v) => !v)}
          className="flex w-fit items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          {goster ? (
            <EyeOffIcon className="size-3.5" />
          ) : (
            <EyeIcon className="size-3.5" />
          )}
          {goster ? "Şifreleri gizle" : "Şifreleri göster"}
        </button>

        {hata ? (
          <p className="text-[12px] text-destructive" role="alert">
            {hata}
          </p>
        ) : null}

        <Button type="submit" disabled={gonderiliyor} className="w-fit">
          {gonderiliyor ? "Güncelleniyor…" : "Şifreyi değiştir"}
        </Button>
      </form>
    </AyarlarBolum>
  );
}

function BilgiHucresi({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="flex flex-col justify-center gap-1 bg-card px-3.5 py-4">
      <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
        {etiket}
      </span>
      <span className="text-[15px] font-medium text-foreground">{deger}</span>
    </div>
  );
}
