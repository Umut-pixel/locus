"use client";

import { useEffect, useRef, useState } from "react";

import { AyarlarBolum } from "@/components/ayarlar/AyarlarBolum";
import { SegmentedSwitch } from "@/components/ui/segmented-switch";
import { Switch } from "@/components/ui/switch";
import { toastManager } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { BildirimAyari } from "@/app/api/ayarlar/bildirimler/route";

const TIP_META: Record<string, { ad: string; aciklama: string; birim?: string }> = {
  sabah_raporu: {
    ad: "Sabah raporu",
    aciklama: "Her sabah genel durum özeti — ciro, riskli müşteri sayısı, SKT ve senkron durumu.",
  },
  panorama_sync_hata: {
    ad: "Senkron hatası",
    aciklama: "Bir Panorama veri çekimi başarısız olursa.",
  },
  ciro_degisim: {
    ad: "Ciro değişimi",
    aciklama: "Günlük toplam ciro, önceki güne göre eşik yüzdesinden fazla değişirse.",
    birim: "%",
  },
  musteri_riskli: {
    ad: "Müşteri riskli oldu",
    aciklama: "Bir müşteri 90+ gün sevkiyatsız kalıp riskli duruma geçerse (yalnız geçiş anında).",
  },
  borc_esigi: {
    ad: "Borç yaşlandırma eşiği",
    aciklama: "Bir müşterinin gecikmiş alacağı eşik gün sayısını aşarsa.",
    birim: "gün",
  },
  yeni_siparis: {
    ad: "Yeni sipariş",
    aciklama: "Panorama'da yeni bir sipariş belgesi görülürse.",
  },
  buyuk_siparis: {
    ad: "Büyük sipariş",
    aciklama: "Tek bir siparişin toplam tutarı eşiği aşarsa.",
    birim: "₺",
  },
  skt_yaklasan: {
    ad: "SKT yaklaşan ürün",
    aciklama: "Son kullanma tarihi eşik gün içinde dolacak ürün varsa.",
    birim: "gün",
  },
};

const TESLIM_SECENEKLERI = [
  { value: "ozet" as const, label: "Özet" },
  { value: "anlik" as const, label: "Anında" },
];

/**
 * Bildirim ayarları — tip başına aç/kapat + teslim modu (özet/anında) + eşik.
 * Kişiye özel değil: uygulamada kullanıcı bazlı oturum yok, tek paylaşımlı panel.
 * Değişiklikler `/api/ayarlar/bildirimler` (PATCH) ile anında kaydedilir.
 */
export function BildirimAyarlari() {
  const [satirlar, setSatirlar] = useState<BildirimAyari[] | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState<string | null>(null);
  /** Eşik girişine odaklanılan andaki değer — `onChange` state'i hemen
   * güncellediği için `onBlur`'da "değişti mi" kontrolü canlı state'e değil
   * buna karşı yapılmalı, yoksa her zaman "aynı" görünüp hiç kaydedilmez. */
  const esikOdakBaslangici = useRef<number | null>(null);

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const res = await fetch("/api/ayarlar/bildirimler");
        const json = (await res.json()) as { satirlar?: BildirimAyari[]; error?: string };
        if (!iptal && res.ok && json.satirlar) setSatirlar(json.satirlar);
      } catch {
        /* aşağıdaki boş-durum mesajı yeterli */
      }
    })();
    return () => {
      iptal = true;
    };
  }, []);

  const guncelle = async (anahtar: string, degisim: Partial<Pick<BildirimAyari, "aktif" | "teslim_modu" | "esik_deger">>) => {
    const onceki = satirlar;
    setSatirlar((rows) => rows?.map((r) => (r.anahtar === anahtar ? { ...r, ...degisim } : r)) ?? rows);
    setKaydediliyor(anahtar);
    try {
      const res = await fetch("/api/ayarlar/bildirimler", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anahtar, ...degisim }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Kaydedilemedi.");
    } catch (err) {
      setSatirlar(onceki);
      toastManager.add({
        type: "error",
        title: "Ayar kaydedilemedi",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setKaydediliyor(null);
    }
  };

  return (
    <AyarlarBolum id="bildirimler" baslik="Bildirimler">
      {satirlar === null ? (
        <p className="px-3.5 py-3 text-[13px] text-muted-foreground">Yükleniyor…</p>
      ) : (
        <ul className="divide-y divide-border">
          {satirlar.map((satir) => {
            const meta = TIP_META[satir.anahtar];
            if (!meta) return null;
            const dolu = kaydediliyor === satir.anahtar;
            return (
              <li
                key={satir.anahtar}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3 transition-opacity",
                  !satir.aktif && "opacity-60",
                  dolu && "opacity-70"
                )}
              >
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-[13px] font-medium text-foreground">{meta.ad}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{meta.aciklama}</p>
                </div>

                {meta.birim && satir.esik_deger != null ? (
                  <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                    <input
                      type="number"
                      value={satir.esik_deger}
                      disabled={!satir.aktif || dolu}
                      onFocus={() => {
                        esikOdakBaslangici.current = satir.esik_deger;
                      }}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) {
                          setSatirlar((rows) =>
                            rows?.map((r) => (r.anahtar === satir.anahtar ? { ...r, esik_deger: v } : r)) ?? rows
                          );
                        }
                      }}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== esikOdakBaslangici.current) {
                          void guncelle(satir.anahtar, { esik_deger: v });
                        }
                      }}
                      className="h-7 w-16 rounded-md border border-input bg-transparent px-2 text-[12px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                    />
                    <span>{meta.birim}</span>
                  </label>
                ) : null}

                <SegmentedSwitch
                  value={satir.teslim_modu}
                  onChange={(v) => void guncelle(satir.anahtar, { teslim_modu: v })}
                  ariaLabel={`${meta.ad} teslim modu`}
                  options={TESLIM_SECENEKLERI}
                />

                <Switch
                  checked={satir.aktif}
                  disabled={dolu}
                  onCheckedChange={(v) => void guncelle(satir.anahtar, { aktif: v })}
                  aria-label={`${meta.ad} ${satir.aktif ? "açık" : "kapalı"}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </AyarlarBolum>
  );
}
