"use client";

import {
  SKT_KRITIK_GUN,
  SKT_UYARI_GUN,
  type UrunSktOzeti,
} from "@/hooks/useUrunSkt";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SktRozetiProps {
  ozet: UrunSktOzeti;
  loading?: boolean;
}

/**
 * Ürünün en yakın SKT'si — dört ayrı durum, çünkü nedenleri ve aksiyonları
 * farklı (bkz. useUrunSkt.ts → SktRozetDurumu):
 *
 *  • tarihli    : gerçek tarih. Kapsam "kismi" ise `~` öneki + uyarı tooltip'i —
 *                 tarihi bilinmeyen partiler var, gerçek en yakın SKT daha
 *                 erken olabilir. Sahte kesinlik üretmemek bilinçli.
 *  • devir      : eski bayiden devralınan stok; bayi artık yok, SKT kalıcı
 *                 olarak bilinmiyor → fiziksel kontrol gerekiyor.
 *  • takip_yok  : alış kaydı var ama hiç SKT girilmemiş (palet/ambalaj gibi
 *                 bozulmayan kalemler doğal olarak buraya düşer).
 *  • kayit_disi : ürün alış dosyasında hiç geçmiyor — dosyanın kapsadığı
 *                 dönemden sonra gelmiş olabilir. Boş bırakmıyoruz ki
 *                 "rozet yok = sorun yok" diye okunmasın.
 */
export function SktRozeti({ ozet, loading }: SktRozetiProps) {
  if (loading) {
    return <span className="font-mono text-[12.5px] text-muted-foreground">…</span>;
  }

  // "tarihli" ama tarih alanı boşsa (tutarsız kayıt) tarihsiz gibi davran —
  // uydurma bir tarih göstermektense "takip yok" demek doğru olan.
  const tarihVar =
    ozet.rozet === "tarihli" && ozet.gunKalan != null && ozet.enYakinSkt != null;

  if (!tarihVar) {
    const anahtar = ozet.rozet === "tarihli" ? "takip_yok" : ozet.rozet;
    const { metin, baslik, renk } = TARIHSIZ_GORUNUM[anahtar];
    // Aynı rozet kaynağa göre farklı şeyi anlatıyor; açıklama ona göre seçilir.
    const aciklama =
      ozet.kaynak === "karisik" && anahtar === "kayit_disi"
        ? "Bu ürün ne fabrika alış dosyasında ne de depo sayım föyünde geçiyor. SKT bilinmiyor."
        : ozet.kaynak === "depo_sayim"
          ? SAYIM_BASLIK[anahtar]
          : baslik;
    return (
      <span className={cn("text-[12px] whitespace-nowrap", renk)} title={aciklama}>
        {metin}
      </span>
    );
  }

  const gun = ozet.gunKalan!;
  const gecti = gun < 0;
  const kritik = gun >= 0 && gun <= SKT_KRITIK_GUN;
  const uyari = gun > SKT_KRITIK_GUN && gun <= SKT_UYARI_GUN;
  const kismi = ozet.kapsam === "kismi";

  const gunMetni = gecti
    ? `${formatNumber(Math.abs(gun))} gün geçti`
    : `${formatNumber(gun)} gün`;

  const baslik = [
    `En yakın SKT: ${formatDate(ozet.enYakinSkt)}`,
    ozet.partiNo ? `Parti: ${ozet.partiNo}` : null,
    kismi
      ? `${formatNumber(ozet.tarihliKayit)} kayıtta tarih var, ${formatNumber(ozet.tarihsizKayit)} kayıtta yok — gerçek en yakın tarih daha erken olabilir.`
      : ozet.kaynak === "depo_sayim"
        ? "Bu ürünün sayılan tüm partilerinde SKT bilgisi var."
        : "Bu ürünün tüm alım kayıtlarında SKT bilgisi var.",
    // Sayım föyünde adet PARTİ bazında yazılı; fabrika dosyasında kalem
    // bazında ve çok partili kalemlerde bölünemiyor — iki farklı gerçek.
    ozet.kaynak === "depo_sayim"
      ? ozet.enYakinPartiMiktar != null
        ? `Bu partide sayılan: ${formatNumber(ozet.enYakinPartiMiktar)} adet.`
        : null
      : !ozet.tekParti
        ? "Bu kalemde birden fazla parti var; miktar partiye bölünemiyor."
        : null,
    ozet.sayimFarki != null && ozet.sayimFarki !== 0
      ? `Sayım farkı: Panorama ${formatNumber(ozet.depoStok ?? 0)} adet, sayımda ${formatNumber(ozet.sayimToplam ?? 0)} adet.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 whitespace-nowrap",
        kismi && "cursor-help"
      )}
      title={baslik}
    >
      <span
        className={cn(
          "font-mono text-[12.5px] tabular-nums",
          gecti || kritik
            ? "font-medium text-destructive"
            : uyari
              ? "text-amber-400"
              : "text-foreground"
        )}
      >
        {/* "~" = kapsam kısmi; tarih iyimser olabilir. */}
        {kismi ? "~" : ""}
        {formatDate(ozet.enYakinSkt)}
      </span>
      <span
        className={cn(
          "text-[11px]",
          gecti || kritik
            ? "text-destructive"
            : uyari
              ? "text-amber-400/80"
              : "text-muted-foreground"
        )}
      >
        {gunMetni}
      </span>
    </span>
  );
}

/**
 * Aynı rozetler sayım föyünden gelirken farklı şeyi anlatıyor: orada "alım
 * kaydı" değil "sayılan parti" var. Metin aynı kalıyor, açıklama değişiyor —
 * yanlış dosyaya işaret eden bir tooltip sahada yanlış aramaya yol açıyor.
 */
const SAYIM_BASLIK: Record<Exclude<UrunSktOzeti["rozet"], "tarihli">, string> = {
  devir:
    "Eski bayiden devralınan stok. Eski bayi artık mevcut değil, SKT bilgisi kalıcı olarak yok — fiziksel kontrol gerekiyor.",
  takip_yok:
    "Sayım föyünde satırı var ama hiçbir partiye SKT yazılmamış. Kedi kumu gibi bozulmayan kalemler doğal olarak buraya düşer.",
  kayit_disi:
    "Bu ürün depo sayım föyünde hiç geçmiyor — sayımda atlanmış ya da föy o gün katalogdaki her ürünü kapsamamış olabilir. SKT bilinmiyor.",
};

const TARIHSIZ_GORUNUM: Record<
  Exclude<UrunSktOzeti["rozet"], "tarihli">,
  { metin: string; baslik: string; renk: string }
> = {
  devir: {
    metin: "Devir stoğu",
    baslik:
      "Eski bayiden devralınan stok. Eski bayi artık mevcut değil, SKT bilgisi kalıcı olarak yok — fiziksel kontrol gerekiyor.",
    renk: "text-amber-400/90",
  },
  takip_yok: {
    metin: "SKT takibi yok",
    baslik:
      "Alış kaydı var ama hiçbir kaleminde SKT girilmemiş. Palet/ambalaj gibi bozulmayan kalemler doğal olarak buraya düşer.",
    renk: "text-muted-foreground",
  },
  kayit_disi: {
    metin: "Alım kaydı yok",
    baslik:
      "Bu ürün fabrika alış dosyasında hiç geçmiyor — dosyanın kapsadığı dönemden sonra gelmiş olabilir. SKT bilinmiyor.",
    renk: "text-muted-foreground/70",
  },
};
