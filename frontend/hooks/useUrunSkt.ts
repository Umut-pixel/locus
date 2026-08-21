"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { URUN_SKT_TABLE, supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-fetch-all";

/** SKT eşikleri — rozet rengi ve "yaklaşanlar" paneli aynı sınırı kullanır. */
export const SKT_KRITIK_GUN = 30;
export const SKT_UYARI_GUN = 90;

interface UrunSktRaw {
  urun_kodu: string;
  urun_adi: string;
  parti_no: string | null;
  skt_tarihi: string | null;
  islem_tarihi: string | null;
  durum: "tarihli" | "cozulemedi" | "devir" | "kayit_yok";
  tek_parti: boolean;
  yuklendi_at: string;
}

/**
 * Rozet durumu — kaynağı farklı olduğu için aksiyonu da farklı:
 *  tarihli    → gerçek SKT var
 *  devir      → eski bayiden devralındı, bayi artık yok; SKT KALICI olarak bilinmiyor (2026-08-21, Melih)
 *  takip_yok  → dosyada satırı var ama hiç SKT kaydı yok (palet, ambalaj gibi bozulmayan kalemler buraya düşer)
 *  kayit_disi → ürün alış dosyasında hiç geçmiyor (ör. dosya dönemi sonrası gelen yaş mama hattı)
 */
export type SktRozetDurumu = "tarihli" | "devir" | "takip_yok" | "kayit_disi";

/** Kapsam — "kismi" iken gösterilen tarih İYİMSER olabilir, gerçek en yakın SKT daha erken çıkabilir. */
export type SktKapsam = "tam" | "kismi" | "yok";

export interface UrunSktOzeti {
  urunKodu: string;
  urunAdi: string;
  rozet: SktRozetDurumu;
  kapsam: SktKapsam;
  enYakinSkt: string | null;
  gunKalan: number | null;
  /** En yakın SKT'nin parti numarası (varsa). */
  partiNo: string | null;
  /** En yakın SKT'nin ait olduğu kalemde tek parti mi — miktar atfedilebilir mi. */
  tekParti: boolean;
  tarihliKayit: number;
  tarihsizKayit: number;
}

export interface SktMeta {
  /** Dosyanın kapsadığı alım tarihi aralığı — "veri ne kadarını görüyor". */
  donemBas: string | null;
  donemBit: string | null;
  /**
   * Son alımın üzerinden geçen gün. Bileşende `Date.now()` çağırmamak için
   * burada hesaplanıyor (react-hooks/purity: render sırasında impure çağrı yok).
   */
  donemBitGunFarki: number | null;
  /** Son yükleme anı. */
  yuklendiAt: string | null;
  urunSayisi: number;
  kayitSayisi: number;
}

/** Tarayıcı UTC'sinden bağımsız İstanbul takvim günü — useMusteriRaporlama ile aynı kural. */
function istanbulTarihi(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(new Date());
}

export function gunFarkiIso(isoTarih: string, bugunIso: string): number {
  const a = Date.parse(`${isoTarih}T00:00:00Z`);
  const b = Date.parse(`${bugunIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86400000);
}

interface UrunSktState {
  satirlar: UrunSktRaw[];
  loading: boolean;
  /** Tablo yoksa (migration çalıştırılmadıysa) null — sayfa çalışmaya devam eder. */
  error: string | null;
}

/**
 * Fabrika alış raporundan gelen SKT kayıtları, ürün bazında toparlanmış.
 *
 * Panorama zincirine bağlı değil: veri yalnızca Veri Yükle akışıyla
 * tazeleniyor (15 günde bir). Bu yüzden `meta.donemBas/donemBit` ekranda
 * gösterilmeli — kullanıcı verinin hangi aralığı kapsadığını görmeli.
 */
export function useUrunSkt() {
  const [state, setState] = useState<UrunSktState>({
    satirlar: [],
    loading: true,
    error: null,
  });
  /** Yükleme bittiğinde sayfayı yenilemeden tazelemek için. */
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchAllRows<UrunSktRaw>((from, to) =>
      supabase
        .from(URUN_SKT_TABLE)
        .select(
          "urun_kodu,urun_adi,parti_no,skt_tarihi,islem_tarihi,durum,tek_parti,yuklendi_at"
        )
        .range(from, to) as unknown as Promise<{
        data: UrunSktRaw[] | null;
        error: { message: string } | null;
      }>
    )
      .then((satirlar) => {
        if (!cancelled) setState({ satirlar, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Tablo henüz kurulmadıysa stok sayfasının geri kalanı çalışmaya devam etsin.
        setState({
          satirlar: [],
          loading: false,
          error: err instanceof Error ? err.message : "SKT verisi yüklenemedi.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const { satirlar, loading, error } = state;

  const { ozetMap, meta } = useMemo(() => {
    const bugun = istanbulTarihi();
    const havuz = new Map<
      string,
      {
        urunAdi: string;
        tarihli: number;
        tarihsiz: number;
        devir: number;
        kayitYok: number;
        enYakin: { tarih: string; parti: string | null; tekParti: boolean } | null;
      }
    >();

    let donemBas: string | null = null;
    let donemBit: string | null = null;
    let yuklendiAt: string | null = null;

    for (const r of satirlar) {
      if (r.islem_tarihi) {
        if (!donemBas || r.islem_tarihi < donemBas) donemBas = r.islem_tarihi;
        if (!donemBit || r.islem_tarihi > donemBit) donemBit = r.islem_tarihi;
      }
      if (r.yuklendi_at && (!yuklendiAt || r.yuklendi_at > yuklendiAt)) {
        yuklendiAt = r.yuklendi_at;
      }

      const acc = havuz.get(r.urun_kodu) ?? {
        urunAdi: r.urun_adi,
        tarihli: 0,
        tarihsiz: 0,
        devir: 0,
        kayitYok: 0,
        enYakin: null,
      };

      if (r.durum === "tarihli" && r.skt_tarihi) {
        acc.tarihli += 1;
        if (!acc.enYakin || r.skt_tarihi < acc.enYakin.tarih) {
          acc.enYakin = {
            tarih: r.skt_tarihi,
            parti: r.parti_no,
            tekParti: r.tek_parti,
          };
        }
      } else {
        acc.tarihsiz += 1;
        if (r.durum === "devir") acc.devir += 1;
        if (r.durum === "kayit_yok") acc.kayitYok += 1;
      }

      havuz.set(r.urun_kodu, acc);
    }

    const ozetMap = new Map<string, UrunSktOzeti>();
    for (const [urunKodu, v] of havuz) {
      let rozet: SktRozetDurumu;
      if (v.enYakin) rozet = "tarihli";
      else if (v.devir > 0) rozet = "devir";
      else rozet = "takip_yok";

      const kapsam: SktKapsam = !v.enYakin
        ? "yok"
        : v.tarihsiz > 0
          ? "kismi"
          : "tam";

      ozetMap.set(urunKodu, {
        urunKodu,
        urunAdi: v.urunAdi,
        rozet,
        kapsam,
        enYakinSkt: v.enYakin?.tarih ?? null,
        gunKalan: v.enYakin ? gunFarkiIso(v.enYakin.tarih, bugun) : null,
        partiNo: v.enYakin?.parti ?? null,
        tekParti: v.enYakin?.tekParti ?? false,
        tarihliKayit: v.tarihli,
        tarihsizKayit: v.tarihsiz,
      });
    }

    return {
      ozetMap,
      meta: {
        donemBas,
        donemBit,
        donemBitGunFarki: donemBit ? -gunFarkiIso(donemBit, bugun) : null,
        yuklendiAt,
        urunSayisi: ozetMap.size,
        kayitSayisi: satirlar.length,
      } satisfies SktMeta,
    };
  }, [satirlar]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { ozetMap, meta, loading, error, refresh };
}

/**
 * Stok listesindeki ürün için rozet özeti. SKT tablosunda hiç satırı yoksa
 * "kayit_disi" — sessizce boş bırakmıyoruz: alış dosyası dönem dışında kalan
 * ürünleri (ör. yaş mama hattı) kapsamıyor ve "rozet yok = sorun yok" diye
 * okunmamalı.
 */
export function sktOzetiBul(
  ozetMap: Map<string, UrunSktOzeti>,
  urunKodu: string,
  urunAdi: string
): UrunSktOzeti {
  return (
    ozetMap.get(urunKodu) ?? {
      urunKodu,
      urunAdi,
      rozet: "kayit_disi",
      kapsam: "yok",
      enYakinSkt: null,
      gunKalan: null,
      partiNo: null,
      tekParti: false,
      tarihliKayit: 0,
      tarihsizKayit: 0,
    }
  );
}
