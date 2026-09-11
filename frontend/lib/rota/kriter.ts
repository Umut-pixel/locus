/**
 * Plan karnesi — "bu plan sahaya çıkar mı" sorusunun tek cevabı.
 *
 * Saf fonksiyon, ağ çağrısı yok. YENİ VERİ ÜRETMİYOR: modülün zaten
 * hesapladığı ama arayüze hiç ulaşmayan ya da altı ayrı panele dağılmış
 * sinyalleri tek yerde topluyor.
 *
 * Kriter seti klasik taşıma modu seçim ölçütlerinden uyarlandı (transit time,
 * cost, flexibility, risk of damage, reliability, safety, operational
 * difficulties). Peritas'ın tek modu var — karayolu, kendi filosu, tek depo —
 * yani "mod seçimi" kararı yok; ölçütlerin nesnesi mod değil PLAN.
 *
 * Kaynak dürüstlüğü: her kriter `kaynak` taşıyor. `araclar.max_kg_teyitli`
 * konvansiyonunun aynısı — ölçülen ile tahmin edilen karışmasın, olmayan veri
 * varmış gibi gösterilmesin.
 */

import {
  kalanKapasite,
  type Arac,
  type AracYuku,
  type FiloSecimi,
  type YerlesmeyenDurak,
} from "./atama";
import type { RotaBilgisi } from "./google-routes";
import { gunUzunlugu, saatMetni, sonrakiKalkis, sureMetni, varisZamani, YAYILIM_UYARI_KM } from "./operasyon";
import type { PlanMetrigi } from "./planla";

export type KriterDurumu = "iyi" | "dikkat" | "sorun";

/**
 * Değerin arkasında ne var.
 * - `olculen`  — gerçek veriden hesaplandı
 * - `tahmini`  — vekil bir ölçüyle temsil ediliyor, gerçeği bu değil
 * - `veri-yok` — hesaplanamıyor; eksik olan söyleniyor
 */
export type KriterKaynagi = "olculen" | "tahmini" | "veri-yok";

export type KriterAnahtari =
  | "sure"
  | "maliyet"
  | "esneklik"
  | "yukRiski"
  | "guvenilirlik"
  | "surusGuvenligi"
  | "sahaZorlugu";

export interface Kriter {
  anahtar: KriterAnahtari;
  ad: string;
  /** Tek satırda okunacak değer. */
  deger: string;
  durum: KriterDurumu;
  kaynak: KriterKaynagi;
  /** Neden bu durumda — kullanıcıya gösterilir, `title`'a saklanmaz. */
  aciklama: string;
  /** Haritada vurgulanacaklar. Boşsa satır tıklanabilir değil. */
  suclular: { araclar: string[]; duraklar: string[] };
}

export interface KriterGirdisi {
  metrik: PlanMetrigi;
  /** Filonun tamamı için yük — boş araçlar da gelir, fonksiyon eler. */
  yukler: AracYuku[];
  filo: FiloSecimi<Arac>;
  yerlesmeyen: YerlesmeyenDurak[];
  /** aracKod → son optimizasyonun süre/mesafesi. */
  rotaBilgileri: Record<string, RotaBilgisi>;
  /** Sipariş verisinin yaşı (saat). null = bilinmiyor. */
  veriYasiSaat: number | null;
}

// ---------------------------------------------------------------------------
// Eşikler — operasyonel, yasal değil. Tek yerde dursunlar ki tartışılabilsin.
// ---------------------------------------------------------------------------

/** Bu saatten uzun gün "dikkat"; 08:30 kalkışla akşamı buluyor. */
const UZUN_GUN_SAAT = 9;
/** Bu saatten uzun gün "sorun" — 08:30 + 11 sa = 19:30'dan sonra depoya dönüş. */
const COK_UZUN_GUN_SAAT = 11;
/** Yedek kapasite bu oranın altındaysa filo esnekliği kalmamış demektir. */
const DAR_YEDEK_ORANI = 0.1;
/** Sipariş verisi bu yaştan sonra "dikkat", iki katında "sorun". */
const BAYAT_VERI_SAAT = 24;

const NEDEN_METNI: Record<YerlesmeyenDurak["neden"], string> = {
  "koordinat-yok": "koordinatı yok",
  "kapasite-yetersiz": "tek araca sığmıyor",
  "arac-yok": "boşta araç kalmadı",
  "sofor-yok": "araç var, şoför yok",
};

/** Yerleşmeme nedenlerinden hangileri planı gerçekten bozar. */
const AGIR_NEDENLER: ReadonlySet<YerlesmeyenDurak["neden"]> = new Set([
  "koordinat-yok",
  "kapasite-yetersiz",
]);

/** Durumların en kötüsü — birden çok sinyali tek satırda toplarken. */
function enKotu(...durumlar: KriterDurumu[]): KriterDurumu {
  if (durumlar.includes("sorun")) return "sorun";
  if (durumlar.includes("dikkat")) return "dikkat";
  return "iyi";
}

function yuklu(yukler: AracYuku[]): AracYuku[] {
  return yukler.filter((y) => y.duraklar.length > 0);
}

// ---------------------------------------------------------------------------
// Kriterler
// ---------------------------------------------------------------------------

/** Transit time / Speed — en uzun turun gün uzunluğu ve depoya dönüş saati. */
function sureKriteri(g: KriterGirdisi): Kriter {
  const dolu = yuklu(g.yukler);
  const olculenler = dolu.filter((y) => g.rotaBilgileri[y.arac.kod] != null);

  if (dolu.length === 0) {
    return {
      anahtar: "sure",
      ad: "Süre",
      deger: "—",
      durum: "iyi",
      kaynak: "veri-yok",
      aciklama: "Henüz araca yük atanmadı.",
      suclular: { araclar: [], duraklar: [] },
    };
  }

  if (olculenler.length === 0) {
    return {
      anahtar: "sure",
      ad: "Süre",
      deger: "ölçülmedi",
      durum: "iyi",
      kaynak: "veri-yok",
      // Ortalama hız uydurup süre üretmiyoruz: gerçek süre trafiğe bağlı ve
      // Google'dan geliyor. Uydurma bir sayı, sayı olmamasından kötü.
      aciklama:
        "Sürüş süresi yalnız rota optimize edilince ölçülüyor. Araç kartından “Rotayı optimize et”.",
      suclular: { araclar: dolu.map((y) => y.arac.kod), duraklar: [] },
    };
  }

  let enUzun: { kod: string; ad: string; saniye: number } | null = null;
  const molaliAraclar: string[] = [];

  for (const y of olculenler) {
    const bilgi = g.rotaBilgileri[y.arac.kod]!;
    const gun = gunUzunlugu({
      surusSaniye: bilgi.saniye,
      durakSayisi: y.duraklar.length,
      takograf: y.arac.takograf,
    });
    if (gun.molaSaniye > 0) molaliAraclar.push(y.arac.kod);
    if (enUzun == null || gun.toplamSaniye > enUzun.saniye) {
      enUzun = { kod: y.arac.kod, ad: y.arac.ad, saniye: gun.toplamSaniye };
    }
  }

  const saat = enUzun!.saniye / 3600;
  const varis = varisZamani(sonrakiKalkis(), enUzun!.saniye);
  const durum: KriterDurumu =
    saat > COK_UZUN_GUN_SAAT ? "sorun" : saat > UZUN_GUN_SAAT ? "dikkat" : "iyi";

  const eksik = dolu.length - olculenler.length;
  const parcalar = [
    `En uzun tur ${enUzun!.ad}: ${saatMetni(sonrakiKalkis())} → ${saatMetni(varis)} (boşaltma ve mola dahil).`,
  ];
  if (molaliAraclar.length > 0) {
    parcalar.push(
      `${molaliAraclar.length} turda takograf molası gerekiyor (4,5 saat kesintisiz sürüş sınırı).`
    );
  }
  if (eksik > 0) {
    parcalar.push(`${eksik} araç henüz optimize edilmedi, süresi hesaba girmiyor.`);
  }

  return {
    anahtar: "sure",
    ad: "Süre",
    deger: sureMetni(enUzun!.saniye),
    durum,
    kaynak: eksik > 0 ? "tahmini" : "olculen",
    aciklama: parcalar.join(" "),
    suclular: { araclar: [enUzun!.kod], duraklar: [] },
  };
}

/**
 * Cost — filoda yakıt/tüketim alanı YOK (bkz. sql/araclar_sema.sql), TL/km
 * dışarıdan gelmedikçe maliyet hesaplanamaz. Toplam mesafe vekil olarak
 * gösteriliyor ve açıkça "tahmini" işaretleniyor.
 */
function maliyetKriteri(g: KriterGirdisi): Kriter {
  const km = Math.round(g.metrik.toplamKm);
  return {
    anahtar: "maliyet",
    ad: "Maliyet",
    deger: km > 0 ? `${km.toLocaleString("tr-TR")} km` : "—",
    durum: "iyi",
    kaynak: "tahmini",
    aciklama:
      "Yakıt/km verisi filoda tanımlı değil; maliyet toplam mesafeyle temsil ediliyor. Mesafe kuş uçuşu, depoya dönüş dahil.",
    suclular: { araclar: [], duraklar: [] },
  };
}

/** Flexibility — yedek kapasite ve boştaki araç/şoför. */
function esneklikKriteri(g: KriterGirdisi): Kriter {
  const dolu = yuklu(g.yukler);
  const bosAraclar = g.yukler
    .filter((y) => y.duraklar.length === 0)
    .map((y) => y.arac.kod);

  let yedekCuval = 0;
  let toplamKapasite = 0;
  for (const y of dolu) {
    yedekCuval += kalanKapasite(y.arac, y.duraklar).cuval;
    toplamKapasite += y.arac.cuvalKapasite;
  }

  const oran = toplamKapasite > 0 ? yedekCuval / toplamKapasite : 0;
  const havuzVar = g.yerlesmeyen.length > 0;

  const durum: KriterDurumu =
    havuzVar && bosAraclar.length === 0 && oran < DAR_YEDEK_ORANI
      ? "sorun"
      : oran < DAR_YEDEK_ORANI
        ? "dikkat"
        : "iyi";

  return {
    anahtar: "esneklik",
    ad: "Esneklik",
    deger:
      dolu.length === 0
        ? "—"
        : `${Math.round(yedekCuval).toLocaleString("tr-TR")} çuval yedek`,
    durum,
    kaynak: dolu.length === 0 ? "veri-yok" : "olculen",
    aciklama:
      dolu.length === 0
        ? "Henüz araca yük atanmadı."
        : `Yüklü araçlarda %${Math.round(oran * 100)} boş hacim var; ${bosAraclar.length} araç hiç çıkmıyor.` +
          (havuzVar && bosAraclar.length === 0
            ? " Havuzda yük kaldı ve alacak araç yok."
            : ""),
    suclular: { araclar: bosAraclar, duraklar: [] },
  };
}

/** Risk of Damage — ruhsat/hacim aşımı, karışık yük, ölçüsü bilinmeyen satır. */
function yukRiskiKriteri(g: KriterGirdisi): Kriter {
  const dolu = yuklu(g.yukler);
  const asanlar = dolu.filter((y) => y.doluluk.asim).map((y) => y.arac.kod);
  const olcusuzler = dolu
    .filter((y) => y.doluluk.olcusuzVar)
    .map((y) => y.arac.kod);

  const durum = enKotu(
    asanlar.length > 0 ? "sorun" : "iyi",
    olcusuzler.length > 0 ? "dikkat" : "iyi"
  );

  const parcalar: string[] = [];
  if (asanlar.length > 0) {
    parcalar.push(
      `${asanlar.length} araçta istiap haddi ya da hacim aşılıyor — bu plan kâğıtta geçerli, sahada değil.`
    );
  }
  if (olcusuzler.length > 0) {
    parcalar.push(
      `${olcusuzler.length} araçta ölçüsü bilinmeyen kalem var; gerçek yük gösterilenden ağır olabilir.`
    );
  }
  if (parcalar.length === 0) parcalar.push("Kapasite aşımı yok.");

  return {
    anahtar: "yukRiski",
    ad: "Yük riski",
    deger: asanlar.length > 0 ? `${asanlar.length} araçta aşım` : "aşım yok",
    durum,
    kaynak: dolu.length === 0 ? "veri-yok" : "olculen",
    aciklama: parcalar.join(" "),
    suclular: { araclar: [...new Set([...asanlar, ...olcusuzler])], duraklar: [] },
  };
}

/** Reliability — yerleşmeyen yük (NEDENİYLE) ve verinin tazeliği. */
function guvenilirlikKriteri(g: KriterGirdisi): Kriter {
  const sayac = new Map<YerlesmeyenDurak["neden"], string[]>();
  for (const y of g.yerlesmeyen) {
    const liste = sayac.get(y.neden) ?? [];
    liste.push(y.durak.musteriKodu);
    sayac.set(y.neden, liste);
  }

  const agirVar = [...sayac.keys()].some((n) => AGIR_NEDENLER.has(n));
  const yasSaat = g.veriYasiSaat;
  const veriDurumu: KriterDurumu =
    yasSaat == null
      ? "iyi"
      : yasSaat >= BAYAT_VERI_SAAT * 2
        ? "sorun"
        : yasSaat >= BAYAT_VERI_SAAT
          ? "dikkat"
          : "iyi";

  const durum = enKotu(
    agirVar ? "sorun" : g.yerlesmeyen.length > 0 ? "dikkat" : "iyi",
    veriDurumu
  );

  const parcalar: string[] = [];
  if (sayac.size > 0) {
    // Neden ARTIK GÖRÜNÜYOR: üç strateji de durak başına hesaplıyordu ama
    // provider hepsini "arac-yok" diye eziyordu.
    parcalar.push(
      [...sayac.entries()]
        .map(([neden, kodlar]) => `${kodlar.length} durak ${NEDEN_METNI[neden]}`)
        .join(", ") + "."
    );
  } else {
    parcalar.push("Bekleyen yükün tamamı yerleşti.");
  }
  if (yasSaat != null && yasSaat >= BAYAT_VERI_SAAT) {
    parcalar.push(
      `Sipariş verisi ${Math.floor(yasSaat / 24)} gün önce çekildi — plan bayat veriyle kuruluyor olabilir.`
    );
  }

  return {
    anahtar: "guvenilirlik",
    ad: "Güvenilirlik",
    deger:
      g.yerlesmeyen.length > 0
        ? `${g.yerlesmeyen.length} durak yerleşmedi`
        : "tümü yerleşti",
    durum,
    kaynak: "olculen",
    aciklama: parcalar.join(" "),
    suclular: {
      araclar: [],
      duraklar: g.yerlesmeyen.map((y) => y.durak.musteriKodu),
    },
  };
}

/** Safety — şoförsüz yüklü araç ve takograf molası gerektiren tur. */
function surusGuvenligiKriteri(g: KriterGirdisi): Kriter {
  const dolu = yuklu(g.yukler);
  const soforsuz = dolu
    .filter((y) => g.filo.atamalar[y.arac.kod] == null)
    .map((y) => y.arac.kod);

  const molali = dolu
    .filter((y) => {
      const bilgi = g.rotaBilgileri[y.arac.kod];
      if (!bilgi) return false;
      return (
        gunUzunlugu({
          surusSaniye: bilgi.saniye,
          durakSayisi: y.duraklar.length,
          takograf: y.arac.takograf,
        }).molaSaniye > 0
      );
    })
    .map((y) => y.arac.kod);

  const durum = enKotu(
    soforsuz.length > 0 ? "sorun" : "iyi",
    molali.length > 0 ? "dikkat" : "iyi"
  );

  const parcalar: string[] = [];
  if (soforsuz.length > 0) {
    parcalar.push(
      `${soforsuz.length} yüklü araca şoför düşmedi — kadro ${
        g.filo.soforSayisi.B + g.filo.soforSayisi.C
      } kişi. Bu plan sahada uygulanamaz.`
    );
  }
  if (molali.length > 0) {
    parcalar.push(
      `${molali.length} turda kesintisiz sürüş 4,5 saati aşıyor; yarım saat zorunlu mola tura eklendi.`
    );
  }
  if (parcalar.length === 0) {
    parcalar.push("Her yüklü araca şoför düştü, ehliyet sınıfları uyuyor.");
  }

  return {
    anahtar: "surusGuvenligi",
    ad: "Sürüş güvenliği",
    deger:
      soforsuz.length > 0
        ? `${soforsuz.length} araç şoförsüz`
        : dolu.length === 0
          ? "—"
          : "uygun",
    durum,
    kaynak: dolu.length === 0 ? "veri-yok" : "olculen",
    aciklama: parcalar.join(" "),
    suclular: { araclar: [...new Set([...soforsuz, ...molali])], duraklar: [] },
  };
}

/** Operational difficulties — yayılım, bölünmüş bölge, araç başına bölge. */
function sahaZorluguKriteri(g: KriterGirdisi): Kriter {
  const { maxYayilimKm, bolunmusBolge, aracBasinaBolge } = g.metrik;
  const yayilimKotu = maxYayilimKm > YAYILIM_UYARI_KM;

  const durum = enKotu(
    yayilimKotu ? "sorun" : "iyi",
    bolunmusBolge > 0 ? "dikkat" : "iyi"
  );

  const parcalar: string[] = [];
  if (yayilimKotu) {
    parcalar.push(
      `Bir araçta en yakın ve en uzak durak arasında ${Math.round(maxYayilimKm)} km var — o araç iki ayrı işi birlikte taşıyor.`
    );
  }
  if (bolunmusBolge > 0) {
    parcalar.push(
      `${bolunmusBolge} bölge birden fazla araca dağılmış; sahada aynı ilçeye iki kez gidilecek.`
    );
  }
  if (parcalar.length === 0) {
    parcalar.push(
      `Bölgeler bütün, araç başına ${aracBasinaBolge.toFixed(1)} bölge düşüyor.`
    );
  }

  return {
    anahtar: "sahaZorlugu",
    ad: "Saha zorluğu",
    deger: `${Math.round(maxYayilimKm)} km yayılım`,
    durum,
    kaynak: g.metrik.aracSayisi === 0 ? "veri-yok" : "olculen",
    aciklama: parcalar.join(" "),
    suclular: { araclar: [], duraklar: [] },
  };
}

/**
 * Planın karnesi. Sıra sabit: karar verirken hep aynı yerde aynı satır olsun.
 * Boş planda boş dizi döner — yedi satır sıfır okumaz.
 */
export function kriterleriHesapla(girdi: KriterGirdisi): Kriter[] {
  if (girdi.metrik.aracSayisi === 0 && girdi.yerlesmeyen.length === 0) return [];

  return [
    guvenilirlikKriteri(girdi),
    surusGuvenligiKriteri(girdi),
    yukRiskiKriteri(girdi),
    sahaZorluguKriteri(girdi),
    sureKriteri(girdi),
    esneklikKriteri(girdi),
    maliyetKriteri(girdi),
  ];
}

/** Karnenin tek satırlık özeti — kaç sorun, kaç dikkat. */
export function karneOzeti(kriterler: Kriter[]): {
  sorun: number;
  dikkat: number;
  durum: KriterDurumu;
} {
  const sorun = kriterler.filter((k) => k.durum === "sorun").length;
  const dikkat = kriterler.filter((k) => k.durum === "dikkat").length;
  return {
    sorun,
    dikkat,
    durum: sorun > 0 ? "sorun" : dikkat > 0 ? "dikkat" : "iyi",
  };
}
