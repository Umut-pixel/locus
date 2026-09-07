/**
 * Plan üretimi ve etki ölçümü — saf fonksiyonlar, ağ çağrısı yok.
 *
 * `atama.ts` tek bir dağıtım yapar; burası tercihleri (strateji, uzak bölge
 * ayırma) uygular ve sonucun ölçülebilir bir özetini çıkarır. Böylece
 * "bu tercihle ne değişiyor" sorusu tek bir API çağrısı bile yapmadan
 * cevaplanabiliyor.
 */

import {
  depoAcisi,
  dolulukHesapla,
  ffdAta,
  sweepKumele,
  type Arac,
  type AtamaSonucu,
  type Durak,
} from "./atama";
import { bolgeAta } from "./bolge";
import { DEPOT, depoyaKm, kmArasi, UZAK_ESIGI_KM } from "../depot";
import type { Strateji } from "./tercihler";

/** Eski içe aktarmalar bozulmasın — tanım `lib/depot.ts`'te (döngü engeli). */
export { UZAK_ESIGI_KM };

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
  if (strateji === "bolge") return bolgeAta(duraklar, araclar, depo, tumFilo);
  if (strateji === "ffd") return ffdAta(duraklar, araclar, tumFilo);
  return sweepKumele(duraklar, araclar, depo, tumFilo);
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

  // Bölge stratejisinde uzak ayırma YAPININ İÇİNDE: uzak bantlar ayrı tur
  // oluyor ve turlar en uzaktan başlayarak yerleşiyor. Ayrıca uygulamak
  // bölgeleri ikinci kez bölerdi.
  if (!uzakAyir || strateji === "bolge") {
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
  /** Birden fazla araca dağılmış bölge sayısı — 0 hedef. */
  bolunmusBolge: number;
  /** Yüklü araç başına ortalama bölge sayısı. */
  aracBasinaBolge: number;
  /**
   * Bir araçtaki en yakın ve en uzak durağın depo mesafesi farkı (km),
   * araçlar arasındaki en kötüsü. "Aydın (4 km) + İstanbul (325 km)" vakasının
   * tek sayılık göstergesi.
   */
  maxYayilimKm: number;
}

/**
 * Depo → duraklar → depo, kuş uçuşu.
 *
 * Duraklar burada AÇIYA GÖRE sıralanır. Önceden listenin ham sırası güzergâh
 * sayılıyordu; sweep'te o zaten açı sırası olduğu için makuldü ama FFD ağırlığa
 * göre sıralı bir liste döndürüyor ve ölçüm anlamsız çıkıyordu — strateji
 * karşılaştırması FFD'yi haksız yere kötü gösteriyordu. Google sıralaması
 * yapılmadan önceki kaba ölçü, sıralamadan bağımsız olmalı.
 */
function turKm(duraklar: Durak[]): number {
  const noktalar = duraklar
    .filter(
      (d): d is Durak & { lat: number; lon: number } =>
        d.lat != null && d.lon != null
    )
    .sort((a, b) => depoAcisi(a, DEPOT) - depoAcisi(b, DEPOT));
  if (noktalar.length === 0) return 0;

  let km = depoyaKm(noktalar[0]!);
  for (let i = 1; i < noktalar.length; i++) {
    km += kmArasi(noktalar[i - 1]!, noktalar[i]!);
  }
  // Araç depoya dönüyor (Melih) — dönüş bacağı da mesafeye giriyor.
  km += depoyaKm(noktalar[noktalar.length - 1]!);
  return km;
}

/** Araçtaki en yakın/en uzak durak farkı (km). */
function yayilimKm(duraklar: Durak[]): number {
  const kmler = duraklar
    .filter((d) => d.lat != null && d.lon != null)
    .map((d) => depoyaKm({ lat: d.lat as number, lon: d.lon as number }));
  if (kmler.length < 2) return 0;
  return Math.max(...kmler) - Math.min(...kmler);
}

/** Durağın ait olduğu bölge anahtarı — metrikte "bölge bölündü mü" için. */
function bolgeAnahtari(d: Durak): string {
  const sehir = (d.sehir ?? "").trim();
  const ilce = (d.ilce ?? "").trim();
  if (ilce) return `${sehir}/${ilce}`;
  if (d.lat == null || d.lon == null) return "?";
  return `${sehir}/~${Math.round(d.lat * 10)},${Math.round(d.lon * 10)}`;
}

export function planMetrigi(sonuc: AtamaSonucu): PlanMetrigi {
  let aracSayisi = 0;
  let yerlesenDurak = 0;
  let dolulukToplami = 0;
  let toplamKm = 0;
  let asimVar = false;
  let maxYayilimKm = 0;
  let bolgeToplami = 0;

  // bölge anahtarı → onu taşıyan araç kodları. Birden fazlaysa bölge bölünmüş.
  const bolgeAraclari = new Map<string, Set<string>>();

  for (const y of sonuc.yukler) {
    if (y.duraklar.length === 0) continue;
    aracSayisi++;
    yerlesenDurak += y.duraklar.length;
    toplamKm += turKm(y.duraklar);
    maxYayilimKm = Math.max(maxYayilimKm, yayilimKm(y.duraklar));

    const bolgeler = new Set<string>();
    for (const d of y.duraklar) {
      const k = bolgeAnahtari(d);
      bolgeler.add(k);
      const kume = bolgeAraclari.get(k);
      if (kume) kume.add(y.arac.kod);
      else bolgeAraclari.set(k, new Set([y.arac.kod]));
    }
    bolgeToplami += bolgeler.size;

    const d = dolulukHesapla(y.arac, y.duraklar);
    if (d.asim) asimVar = true;
    dolulukToplami +=
      d.baglayiciKisit === "agirlik" ? (d.kgYuzde ?? d.cuvalYuzde) : d.cuvalYuzde;
  }

  let bolunmusBolge = 0;
  for (const araclar of bolgeAraclari.values()) {
    if (araclar.size > 1) bolunmusBolge++;
  }

  return {
    aracSayisi,
    yerlesenDurak,
    havuzdaKalan: sonuc.yerlesmeyen.length,
    ortDoluluk: aracSayisi > 0 ? dolulukToplami / aracSayisi : 0,
    toplamKm,
    asimVar,
    bolunmusBolge,
    aracBasinaBolge: aracSayisi > 0 ? bolgeToplami / aracSayisi : 0,
    maxYayilimKm,
  };
}
