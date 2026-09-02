/**
 * Plan üretimi ve etki ölçümü — saf fonksiyonlar, ağ çağrısı yok.
 *
 * `atama.ts` tek bir dağıtım yapar; burası tercihleri (strateji, uzak bölge
 * ayırma) uygular ve sonucun ölçülebilir bir özetini çıkarır. Böylece
 * "bu tercihle ne değişiyor" sorusu tek bir API çağrısı bile yapmadan
 * cevaplanabiliyor.
 */

import {
  dolulukHesapla,
  ffdAta,
  sweepKumele,
  type Arac,
  type AtamaSonucu,
  type Durak,
} from "./atama";
import { depoyaKm } from "../depot";
import type { Strateji } from "./tercihler";

/**
 * Bu mesafenin üstündeki durak "uzak" sayılır.
 * Melih: uzak yerlere sipariş birikince hepsi tek araca yüklenip gidiyor —
 * yani şehir içi turla aynı araca konmamalı.
 */
export const UZAK_ESIGI_KM = 120;

export function uzakMi(durak: Durak): boolean {
  if (durak.lat == null || durak.lon == null) return false;
  return depoyaKm({ lat: durak.lat, lon: durak.lon }) >= UZAK_ESIGI_KM;
}

function dagit(
  strateji: Strateji,
  duraklar: Durak[],
  araclar: Arac[],
  depo: { lat: number; lon: number },
  tumFilo: Arac[]
): AtamaSonucu {
  return strateji === "ffd"
    ? ffdAta(duraklar, araclar, tumFilo)
    : sweepKumele(duraklar, araclar, depo, tumFilo);
}

/**
 * Tercihleri uygulayarak planı üretir.
 *
 * `uzakAyir` açıkken uzak duraklar ÖNCE dağıtılır (FFD ile — uzun yolda
 * coğrafi süpürmenin anlamı yok, önemli olan aracı doldurmak), sonra o
 * araçlar filodan çıkarılır ve şehir içi duraklar kalanlara dağıtılır.
 * Melih'in tarif ettiği "birikince hepsini bir araca yükleyip gönderiyoruz"
 * işleyişi budur.
 */
export function planOlustur(params: {
  duraklar: Durak[];
  /** O gün çıkabilecek araçlar. */
  araclar: Arac[];
  /** Filonun tamamı — "şoför yok" nedenini ayırt etmek için. */
  tumFilo: Arac[];
  depo: { lat: number; lon: number };
  strateji: Strateji;
  uzakAyir: boolean;
}): AtamaSonucu {
  const { duraklar, araclar, tumFilo, depo, strateji, uzakAyir } = params;

  if (!uzakAyir) {
    return dagit(strateji, duraklar, araclar, depo, tumFilo);
  }

  const uzaklar = duraklar.filter(uzakMi);
  const yakinlar = duraklar.filter((d) => !uzakMi(d));

  if (uzaklar.length === 0) {
    return dagit(strateji, yakinlar, araclar, depo, tumFilo);
  }

  const uzakSonuc = ffdAta(uzaklar, araclar, tumFilo);
  const uzakAraclar = new Set(
    uzakSonuc.yukler.filter((y) => y.duraklar.length > 0).map((y) => y.arac.kod)
  );
  const kalanAraclar = araclar.filter((a) => !uzakAraclar.has(a.kod));

  const yakinSonuc = dagit(strateji, yakinlar, kalanAraclar, depo, tumFilo);

  // Uzak turu alan araçların yükleri korunur, kalanlar yakın turdan gelir.
  const yukler = araclar.map((arac) => {
    const uzak = uzakSonuc.yukler.find((y) => y.arac.kod === arac.kod);
    if (uzak && uzak.duraklar.length > 0) return uzak;
    const yakin = yakinSonuc.yukler.find((y) => y.arac.kod === arac.kod);
    return yakin ?? { arac, duraklar: [], doluluk: dolulukHesapla(arac, []) };
  });

  return {
    yukler,
    yerlesmeyen: [...uzakSonuc.yerlesmeyen, ...yakinSonuc.yerlesmeyen],
  };
}

// ---------------------------------------------------------------------------
// Etki ölçümü
// ---------------------------------------------------------------------------

export interface PlanMetrigi {
  /** Yük verilen araç sayısı (boş duranlar sayılmaz). */
  aracSayisi: number;
  yerlesenDurak: number;
  havuzdaKalan: number;
  /**
   * Yüklü araçların ortalama doluluğu — her araçta BAĞLAYICI kısıt esas alınır
   * (ağırlıkça %95 / hacimce %73 olan araç %95 sayılır, çünkü onu dolduran o).
   */
  ortDoluluk: number;
  /** Depo → duraklar → depo, kuş uçuşu. Google çağrısı yapmadan kaba ölçü. */
  toplamKm: number;
  asimVar: boolean;
}

/** Depo → duraklar → depo, kuş uçuşu. `depoyaKm` depoyu zaten biliyor. */
function turKm(duraklar: Durak[]): number {
  const noktalar = duraklar.filter(
    (d): d is Durak & { lat: number; lon: number } =>
      d.lat != null && d.lon != null
  );
  if (noktalar.length === 0) return 0;

  let km = depoyaKm(noktalar[0]!);
  for (let i = 1; i < noktalar.length; i++) {
    const a = noktalar[i - 1]!;
    const b = noktalar[i]!;
    const R = 6371;
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    km += R * 2 * Math.asin(Math.sqrt(h));
  }
  // Araç depoya dönüyor (Melih) — dönüş bacağı da mesafeye giriyor.
  km += depoyaKm(noktalar[noktalar.length - 1]!);
  return km;
}

export function planMetrigi(sonuc: AtamaSonucu): PlanMetrigi {
  let aracSayisi = 0;
  let yerlesenDurak = 0;
  let dolulukToplami = 0;
  let toplamKm = 0;
  let asimVar = false;

  for (const y of sonuc.yukler) {
    if (y.duraklar.length === 0) continue;
    aracSayisi++;
    yerlesenDurak += y.duraklar.length;
    toplamKm += turKm(y.duraklar);

    const d = dolulukHesapla(y.arac, y.duraklar);
    if (d.asim) asimVar = true;
    dolulukToplami +=
      d.baglayiciKisit === "agirlik" ? (d.kgYuzde ?? d.cuvalYuzde) : d.cuvalYuzde;
  }

  return {
    aracSayisi,
    yerlesenDurak,
    havuzdaKalan: sonuc.yerlesmeyen.length,
    ortDoluluk: aracSayisi > 0 ? dolulukToplami / aracSayisi : 0,
    toplamKm,
    asimVar,
  };
}
