/**
 * Palet yerleşimi — araç kasasındaki palet gözlerine durak dağıtımı.
 * Saf fonksiyon, ağ çağrısı yok.
 *
 * Neden var: doluluk yüzdesi "araç ne kadar dolu" sorusunu cevaplıyor ama
 * yükleyicinin sorusu farklı — HANGİ PALETTE KİMİN MALI VAR. Melih
 * (2026-09-02): "palet olarak almışsa müşteri direk transpalet ile indiriliyor.
 * Eğer 1 palette birden fazla müşterinin malı varsa gerektiğinde elle
 * indiriliyor bir kısmı." Karışık palet = yavaş durak; bunu önceden bilmek
 * tur süresini değiştiriyor.
 */

import { dolulukHesapla, type Arac, type Durak } from "./atama";

/** 1 palet = 60 çuval (Melih teyidi, 15 kg çuval için). */
export const PALET_CUVAL = 60;

/**
 * Ortalama çuval ağırlığı — yalnız YÜK BOŞKEN ağırlık sınırını çuvala
 * çevirmek için. Yük varsa gerçek oran kullanılır.
 * 824 t / 56.594 çuval (canlı veri, 2026-09-01).
 */
export const ORTALAMA_CUVAL_KG = 14.56;

/** Bir slotta duran tek müşterinin PAYI — durağın tamamı değil. */
export interface SlotPayi {
  musteriKodu: string;
  unvan: string;
  /** Bu slota düşen çuval. Durak birden çok palete sarkabilir. */
  cuval: number;
  /** Çuval payıyla orantılı ağırlık. */
  kg: number;
  /** Durağın rota içindeki sırası (1 tabanlı) — ızgarada numara göstermek için. */
  sira: number;
}

export interface PaletSlotu {
  /** "A1", "B3" — referans tasarımdaki etiketleme. */
  etiket: string;
  satir: string;
  sutun: number;
  duraklar: SlotPayi[];
  /** 0–60. */
  doluCuval: number;
  /** Birden fazla müşteri → elle indirilecek. */
  karisik: boolean;
  /**
   * Ağırlık sınırı bu slota gelmeden doluyor: kasada yer var ama ruhsatta yok.
   * Transit'in 3 palet gözü var, 2.000 kg ~2,3 palette bitiyor.
   */
  agirlikKilitli: boolean;
}

export interface PaletYerlesimi {
  slotlar: PaletSlotu[];
  /** Satır sayısı — 4+ palette kasa iki sıra genişliğinde çiziliyor. */
  satirSayisi: number;
  /** Palet gözlerine sığmayan çuval (yük kapasiteyi aşmışsa). */
  tasanCuval: number;
  /** Karışık palet sayısı — "3 palet elle indirilecek" özeti için. */
  karisikSayisi: number;
}

const EPS = 1e-6;

/** Araçtaki palet gözü sayısı. Tanımsızsa çuval kapasitesinden türetilir. */
export function paletGozu(arac: Arac & { paletKapasite?: number | null }): number {
  const tanimli = arac.paletKapasite;
  if (tanimli != null && tanimli > 0) return Math.floor(tanimli);
  return Math.max(1, Math.round(arac.cuvalKapasite / PALET_CUVAL));
}

/** Kasa 4 palet ve üstünde iki sıra genişliğinde çiziliyor. */
function satirDuzeni(gozSayisi: number): { satirSayisi: number; sutunSayisi: number } {
  if (gozSayisi >= 4) {
    return { satirSayisi: 2, sutunSayisi: Math.ceil(gozSayisi / 2) };
  }
  return { satirSayisi: 1, sutunSayisi: gozSayisi };
}

const SATIR_ADI = ["A", "B", "C", "D"];

/**
 * Durakları rota sırasıyla palet gözlerine yerleştirir.
 *
 * Taşan durak bir sonraki palete sarkar; bir palete birden fazla müşteri
 * düşerse `karisik` işaretlenir. Yerleşim sırası ROTA SIRASI — yükleme
 * sırasının tersi değil; bu sürüm "kim nerede" sorusunu cevaplıyor, yükleme
 * sırası optimizasyonu yapmıyor.
 */
export function paletlereYerlestir(
  duraklar: Durak[],
  arac: Arac & { paletKapasite?: number | null }
): PaletYerlesimi {
  const gozSayisi = paletGozu(arac);
  const { satirSayisi, sutunSayisi } = satirDuzeni(gozSayisi);

  const slotlar: PaletSlotu[] = [];
  for (let i = 0; i < gozSayisi; i++) {
    const satirIdx = satirSayisi === 1 ? 0 : Math.floor(i / sutunSayisi);
    slotlar.push({
      etiket: `${SATIR_ADI[satirIdx] ?? "A"}${(i % sutunSayisi) + 1}`,
      satir: SATIR_ADI[satirIdx] ?? "A",
      sutun: (i % sutunSayisi) + 1,
      duraklar: [],
      doluCuval: 0,
      karisik: false,
      agirlikKilitli: false,
    });
  }

  let i = 0;
  let tasanCuval = 0;

  duraklar.forEach((durak, idx) => {
    const sira = idx + 1;
    const toplamCuval = durak.cuvalEsdeger;

    // Ölçüsü sıfır olan durak (boş palet, POP malzemesi) yer kaplamıyor ama
    // yükte görünmeli — bulunduğu slota sıfır paylı yazılır.
    if (!(toplamCuval > 0)) {
      const hedef = slotlar[Math.min(i, gozSayisi - 1)];
      if (hedef) {
        hedef.duraklar.push({
          musteriKodu: durak.musteriKodu,
          unvan: durak.unvan,
          cuval: 0,
          kg: durak.kg,
          sira,
        });
      }
      return;
    }

    let kalan = toplamCuval;
    while (kalan > EPS) {
      while (i < gozSayisi && slotlar[i]!.doluCuval >= PALET_CUVAL - EPS) i++;
      if (i >= gozSayisi) {
        tasanCuval += kalan;
        break;
      }
      const slot = slotlar[i]!;
      const bosluk = PALET_CUVAL - slot.doluCuval;
      const pay = Math.min(bosluk, kalan);

      slot.duraklar.push({
        musteriKodu: durak.musteriKodu,
        unvan: durak.unvan,
        cuval: pay,
        kg: durak.kg * (pay / toplamCuval),
        sira,
      });
      slot.doluCuval += pay;
      kalan -= pay;
    }
  });

  // Ağırlık kilidi: yük varsa gerçek kg/çuval oranı, boşsa ortalama çuval.
  const doluluk = dolulukHesapla(arac, duraklar);
  const kgPerCuval =
    doluluk.cuvalEsdeger > 0 ? doluluk.kg / doluluk.cuvalEsdeger : ORTALAMA_CUVAL_KG;
  const agirlikKapasiteCuval =
    arac.maxKg != null && kgPerCuval > 0
      ? arac.maxKg / kgPerCuval
      : Number.POSITIVE_INFINITY;

  let karisikSayisi = 0;
  slotlar.forEach((slot, idx) => {
    const farkliMusteri = new Set(slot.duraklar.map((d) => d.musteriKodu)).size;
    slot.karisik = farkliMusteri > 1;
    if (slot.karisik) karisikSayisi++;
    // Slotun BAŞLANGICI ağırlık kapasitesinin ötesindeyse o göze hiç
    // ulaşılamaz — kasada yer var ama ruhsat elvermiyor.
    slot.agirlikKilitli = idx * PALET_CUVAL >= agirlikKapasiteCuval - EPS;
  });

  return { slotlar, satirSayisi, tasanCuval, karisikSayisi };
}
