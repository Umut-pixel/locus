"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { SktKaynak } from "@/lib/import/types";
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
  kaynak: SktKaynak | null;
  depo_stok: number | string | null;
  parti_miktar: number | string | null;
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
  /**
   * Kaydın hangi dosyadan geldiği — rozet metni ve miktar güveni buna bağlı.
   * "karisik" yalnız sentetik "kayıt dışı" özetinde olur (ürün İKİ dosyada da
   * geçmiyor); gerçek satırı olan ürün her zaman tek kaynaktan okunur.
   */
  kaynak: SktKaynak | "karisik";
  /** Sayım föyündeki ERP (Panorama) stok rakamı. Fabrika kaynağında null. */
  depoStok: number | null;
  /** Fiziksel sayım toplamı (partilerin toplamı). Fabrika kaynağında null. */
  sayimToplam: number | null;
  /** sayimToplam - depoStok; ikisi de varsa. Pozitif = rafta ERP'den fazla var. */
  sayimFarki: number | null;
  /** En yakın SKT'li partide sayılan adet — "bu SKT'den şu kadar var". */
  enYakinPartiMiktar: number | null;
}

/** Tek bir SKT kaynağının kapsamı — kapsam rozeti bunu gösteriyor. */
export interface SktKaynakOzeti {
  urunSayisi: number;
  kayitSayisi: number;
  /** Fabrika: dosyadaki en son alım tarihi. Depo sayım: yükleme günü. */
  tarih: string | null;
  /** Bugüne göre kaç gün geçti. */
  gunFarki: number | null;
}

export interface SktMeta {
  /**
   * Yüklü kaynak(lar). Depo sayım föyünde alım tarihi YOK; tazelik ölçüsü
   * `yuklendiAt`. Bu ayrım olmadan kapsam rozeti sessizce kayboluyordu.
   * "karisik" = iki dosya da yüklü (normal durum, biri diğerini silmiyor).
   */
  kaynak: SktKaynak | "karisik" | null;
  /** Kaynak başına kapsam; yoksa null. */
  fabrika: SktKaynakOzeti | null;
  depoSayim: SktKaynakOzeti | null;
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
  /** Son yüklemenin üzerinden geçen gün — sayım föyünde tazelik ölçüsü bu. */
  yuklendiGunFarki: number | null;
  urunSayisi: number;
  kayitSayisi: number;
  /** Sayım föyü yüklüyse ERP ↔ fiziksel sayım mutabakatı; yoksa null. */
  sayim: SayimMutabakati | null;
}

/** Föy geneli ERP ↔ fiziksel sayım farkı — stok sayfasındaki mutabakat şeridi. */
export interface SayimMutabakati {
  urunSayisi: number;
  farkliUrun: number;
  depoStokToplam: number;
  sayimToplam: number;
  /** sayimToplam - depoStokToplam. */
  netFark: number;
}

/** Tarayıcı UTC'sinden bağımsız İstanbul takvim günü — useMusteriRaporlama ile aynı kural. */
function istanbulTarihi(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(new Date());
}

/** Supabase numeric kolonları string dönebiliyor — tek yerden sayıya çevir. */
function sayiVeyaNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
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
          "urun_kodu,urun_adi,parti_no,skt_tarihi,islem_tarihi,durum,tek_parti," +
            "kaynak,depo_stok,parti_miktar,yuklendi_at"
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

    /**
     * Ürün başına satırlar KAYNAĞA GÖRE ayrı biriktirilir.
     *
     * Kural: föyde geçen ürün için depo sayımı yetkilidir. Föy rafta ne
     * olduğunun güncel fiziksel sayımı; fabrika alış dosyası satılıp bitmiş
     * partileri de içeriyor. İkisini tek havuzda toplamak ölü bir partiyi
     * "en yakın SKT" diye diriltir. Fabrika satırları yalnız föyde HİÇ
     * geçmeyen ürünler için kullanılıyor.
     */
    interface Kova {
      urunAdi: string;
      tarihli: number;
      tarihsiz: number;
      devir: number;
      kayitYok: number;
      depoStok: number | null;
      sayimToplam: number | null;
      enYakin: {
        tarih: string;
        parti: string | null;
        tekParti: boolean;
        partiMiktar: number | null;
      } | null;
    }

    function bosKova(urunAdi: string): Kova {
      return {
        urunAdi,
        tarihli: 0,
        tarihsiz: 0,
        devir: 0,
        kayitYok: 0,
        depoStok: null,
        sayimToplam: null,
        enYakin: null,
      };
    }

    const havuzlar: Record<SktKaynak, Map<string, Kova>> = {
      fabrika: new Map(),
      depo_sayim: new Map(),
    };

    interface KaynakBirikimi {
      urun: Set<string>;
      kayit: number;
      donemBas: string | null;
      donemBit: string | null;
      yuklendiAt: string | null;
    }
    const birikim: Record<SktKaynak, KaynakBirikimi> = {
      fabrika: { urun: new Set(), kayit: 0, donemBas: null, donemBit: null, yuklendiAt: null },
      depo_sayim: { urun: new Set(), kayit: 0, donemBas: null, donemBit: null, yuklendiAt: null },
    };

    for (const r of satirlar) {
      // Kaynağı yazılmamış eski kayıt fabrika sayılır (kolonun varsayılanı).
      const kaynak: SktKaynak = r.kaynak === "depo_sayim" ? "depo_sayim" : "fabrika";
      const b = birikim[kaynak];
      b.urun.add(r.urun_kodu);
      b.kayit += 1;
      if (r.islem_tarihi) {
        if (!b.donemBas || r.islem_tarihi < b.donemBas) b.donemBas = r.islem_tarihi;
        if (!b.donemBit || r.islem_tarihi > b.donemBit) b.donemBit = r.islem_tarihi;
      }
      if (r.yuklendi_at && (!b.yuklendiAt || r.yuklendi_at > b.yuklendiAt)) {
        b.yuklendiAt = r.yuklendi_at;
      }

      const havuz = havuzlar[kaynak];
      const acc = havuz.get(r.urun_kodu) ?? bosKova(r.urun_adi);

      // ERP stoğu ürünün tüm satırlarında aynı; parti adetleri toplanıyor.
      const depoStok = sayiVeyaNull(r.depo_stok);
      if (depoStok != null) acc.depoStok = depoStok;
      const partiMiktar = sayiVeyaNull(r.parti_miktar);
      if (partiMiktar != null) acc.sayimToplam = (acc.sayimToplam ?? 0) + partiMiktar;

      if (r.durum === "tarihli" && r.skt_tarihi) {
        acc.tarihli += 1;
        if (!acc.enYakin || r.skt_tarihi < acc.enYakin.tarih) {
          acc.enYakin = {
            tarih: r.skt_tarihi,
            parti: r.parti_no,
            tekParti: r.tek_parti,
            partiMiktar,
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
    let depoStokToplam = 0;
    let sayimToplamGenel = 0;
    let sayimliUrun = 0;
    let farkliUrun = 0;

    const tumKodlar = new Set([
      ...havuzlar.depo_sayim.keys(),
      ...havuzlar.fabrika.keys(),
    ]);

    for (const urunKodu of tumKodlar) {
      // Yetkili kaynak: föyde varsa depo sayımı, yoksa fabrika.
      const depo = havuzlar.depo_sayim.get(urunKodu);
      const kaynak: SktKaynak = depo ? "depo_sayim" : "fabrika";
      const v = depo ?? havuzlar.fabrika.get(urunKodu)!;

      let rozet: SktRozetDurumu;
      if (v.enYakin) rozet = "tarihli";
      else if (v.devir > 0) rozet = "devir";
      else rozet = "takip_yok";

      const kapsam: SktKapsam = !v.enYakin
        ? "yok"
        : v.tarihsiz > 0
          ? "kismi"
          : "tam";

      // Sayım föyünde ERP rakamı da var — ürün bazlı fark burada çıkıyor.
      const sayimFarki =
        v.depoStok != null && v.sayimToplam != null
          ? v.sayimToplam - v.depoStok
          : null;
      if (v.depoStok != null) {
        depoStokToplam += v.depoStok;
        sayimToplamGenel += v.sayimToplam ?? 0;
        sayimliUrun += 1;
        if (sayimFarki != null && sayimFarki !== 0) farkliUrun += 1;
      }

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
        kaynak,
        depoStok: v.depoStok,
        sayimToplam: v.depoStok != null ? (v.sayimToplam ?? 0) : v.sayimToplam,
        sayimFarki,
        enYakinPartiMiktar: v.enYakin?.partiMiktar ?? null,
      });
    }

    function kaynakOzeti(k: SktKaynak): SktKaynakOzeti | null {
      const b = birikim[k];
      if (b.kayit === 0) return null;
      // Fabrika dosyasının tazelik ölçüsü "en son alım", föyünki "ne zaman
      // yüklendi" — föyde alım tarihi hiç yok.
      const tarih =
        k === "fabrika" ? b.donemBit : (b.yuklendiAt?.slice(0, 10) ?? null);
      return {
        urunSayisi: b.urun.size,
        kayitSayisi: b.kayit,
        tarih,
        gunFarki: tarih ? -gunFarkiIso(tarih, bugun) : null,
      };
    }

    const fabrika = kaynakOzeti("fabrika");
    const depoSayim = kaynakOzeti("depo_sayim");
    const kaynak: SktMeta["kaynak"] =
      fabrika && depoSayim
        ? "karisik"
        : depoSayim
          ? "depo_sayim"
          : fabrika
            ? "fabrika"
            : null;

    const yuklendiAt = [birikim.fabrika.yuklendiAt, birikim.depo_sayim.yuklendiAt]
      .filter((v): v is string => v != null)
      .sort()
      .pop() ?? null;

    return {
      ozetMap,
      meta: {
        kaynak,
        fabrika,
        depoSayim,
        donemBas: birikim.fabrika.donemBas,
        donemBit: birikim.fabrika.donemBit,
        donemBitGunFarki: fabrika?.gunFarki ?? null,
        yuklendiAt,
        yuklendiGunFarki: yuklendiAt
          ? -gunFarkiIso(yuklendiAt.slice(0, 10), bugun)
          : null,
        urunSayisi: ozetMap.size,
        kayitSayisi: satirlar.length,
        sayim:
          sayimliUrun > 0
            ? {
                urunSayisi: sayimliUrun,
                farkliUrun,
                depoStokToplam,
                sayimToplam: sayimToplamGenel,
                netFark: sayimToplamGenel - depoStokToplam,
              }
            : null,
      } satisfies SktMeta,
    };
  }, [satirlar]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { ozetMap, meta, loading, error, refresh };
}

/**
 * Stok listesindeki ürün için rozet özeti. SKT tablosunda hiç satırı yoksa
 * "kayit_disi" — sessizce boş bırakmıyoruz: yüklü dosya (fabrika alış raporu
 * ya da depo sayım föyü) katalogdaki her ürünü kapsamıyor ve "rozet yok =
 * sorun yok" diye okunmamalı.
 */
export function sktOzetiBul(
  ozetMap: Map<string, UrunSktOzeti>,
  urunKodu: string,
  urunAdi: string,
  /** Yüklü dosyanın kaynağı — "kayıt dışı" açıklaması hangi dosyayı işaret etsin. */
  kaynak: SktKaynak | "karisik" = "fabrika"
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
      kaynak,
      depoStok: null,
      sayimToplam: null,
      sayimFarki: null,
      enYakinPartiMiktar: null,
    }
  );
}
