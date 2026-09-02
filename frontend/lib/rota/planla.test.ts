import type { Arac, Durak, Sofor } from "./atama";
import { filoSec } from "./atama";
import { planMetrigi, planOlustur, UZAK_ESIGI_KM, uzakMi } from "./planla";
import {
  tercihAbone,
  tercihAnlik,
  tercihGuncelle,
  tercihleriTemizle,
  tercihSunucuAnlik,
  VARSAYILAN_TERCIHLER,
} from "./tercihler";

function fail(msg: string): never {
  throw new Error(msg);
}

const DEPO = { lat: 38.28801183350053, lon: 27.141092424481496 };

const KANGOO: Arac = {
  kod: "kangoo", ad: "Renault Kangoo", cuvalKapasite: 60, maxKg: 800,
  maxKgTeyitli: true, ehliyetSinifi: "B", takograf: false,
};
const NPR10: Arac = {
  kod: "npr10", ad: "Isuzu NPR 10", cuvalKapasite: 360, maxKg: 6600,
  maxKgTeyitli: true, ehliyetSinifi: "C", takograf: true,
};
const SOFORLER: Sofor[] = [
  { kod: "m", ad: "Mehmet Baylav", ehliyetSinifi: "C" },
  { kod: "r", ad: "Ramazan Türkkan", ehliyetSinifi: "B" },
];

/**
 * Depodan `aciDeg` yönünde, yaklaşık `km` uzaklıkta bir durak.
 * 38° enlemde 1° enlem ≈ 111 km, 1° boylam ≈ 87 km.
 *
 * Açı önemli: sweep durakları depodan görülen kutupsal açıya göre diziyor,
 * yani hepsi aynı yöne konursa test istemeden "sıralı" hâle gelir.
 */
function durakAt(kod: string, km: number, aciDeg: number, kg: number): Durak {
  const rad = (aciDeg * Math.PI) / 180;
  return {
    musteriKodu: kod, unvan: kod,
    lat: DEPO.lat + (km * Math.sin(rad)) / 111,
    lon: DEPO.lon + (km * Math.cos(rad)) / 87,
    kg, cuvalEsdeger: kg / 14.56, olcusuzSatir: 0,
  };
}

/** Doğuya doğru, açısı sabit — mesafenin tek başına önemli olduğu testler için. */
function dogudaDurak(kod: string, km: number, kg: number): Durak {
  return durakAt(kod, km, 0, kg);
}

// ---------------------------------------------------------------------------
// uzakMi — eşik gerçekten mesafeye bakıyor mu
// ---------------------------------------------------------------------------
{
  const yakin = dogudaDurak("YAKIN", 20, 100);
  const uzak = dogudaDurak("UZAK", 200, 100);
  if (uzakMi(yakin)) fail("20 km uzak sayılmamalı");
  if (!uzakMi(uzak)) fail(`200 km uzak sayılmalı (eşik ${UZAK_ESIGI_KM})`);

  const konumsuz: Durak = { ...yakin, lat: null, lon: null };
  if (uzakMi(konumsuz)) fail("koordinatsız durak uzak sayılmamalı");
}
console.log("uzakMi ok");

// ---------------------------------------------------------------------------
// planOlustur — uzak ayırma
// ---------------------------------------------------------------------------
{
  // Açılar dönüşümlü: sweep'in doğal sırasında uzak ve yakın duraklar
  // birbirini izliyor, yani ayırma açık değilken aynı araca düşüyorlar.
  const duraklar = [
    durakAt("UZAK1", 200, 0, 300),
    durakAt("SEHIR1", 15, 10, 300),
    durakAt("UZAK2", 210, 20, 300),
    durakAt("SEHIR2", 20, 30, 300),
  ];
  const filo = [KANGOO, NPR10];

  const karisik = planOlustur({
    duraklar, araclar: filo, tumFilo: filo, depo: DEPO,
    strateji: "sweep", uzakAyir: false,
  });
  const ayri = planOlustur({
    duraklar, araclar: filo, tumFilo: filo, depo: DEPO,
    strateji: "sweep", uzakAyir: true,
  });

  // Ayrı turda hiçbir araç hem uzak hem şehir içi durak taşımamalı
  for (const y of ayri.yukler) {
    if (y.duraklar.length === 0) continue;
    const uzakVar = y.duraklar.some(uzakMi);
    const yakinVar = y.duraklar.some((d) => !uzakMi(d));
    if (uzakVar && yakinVar) {
      fail(`${y.arac.ad} hem uzak hem şehir içi durak taşıyor — ayrım çalışmadı`);
    }
  }

  // Karışık modda ikisinin aynı araca düşebildiğini de doğrula (aksi halde
  // test yukarıdaki kontrolü boşuna geçiyor olurdu)
  const karisikAracta = karisik.yukler.some(
    (y) => y.duraklar.some(uzakMi) && y.duraklar.some((d) => !uzakMi(d))
  );
  if (!karisikAracta) {
    fail("karışık modda uzak+yakın aynı araca düşmeliydi; test anlamsız kaldı");
  }

  // Hiçbir durak kaybolmamalı
  const toplam = (s: typeof karisik) =>
    s.yukler.reduce((t, y) => t + y.duraklar.length, 0) + s.yerlesmeyen.length;
  if (toplam(ayri) !== duraklar.length) fail("ayrı turda durak kayboldu");
  if (toplam(karisik) !== duraklar.length) fail("karışık turda durak kayboldu");
}
console.log("planOlustur: uzak ayırma ok");

// ---------------------------------------------------------------------------
// Strateji farkı ölçülebiliyor mu
// ---------------------------------------------------------------------------
{
  const duraklar = [
    dogudaDurak("A", 10, 700),
    dogudaDurak("B", 15, 100),
    dogudaDurak("C", 20, 90),
  ];
  const filo = [KANGOO, NPR10];
  const ortak = { duraklar, araclar: filo, tumFilo: filo, depo: DEPO, uzakAyir: false };

  const sweep = planMetrigi(planOlustur({ ...ortak, strateji: "sweep" }));
  const ffd = planMetrigi(planOlustur({ ...ortak, strateji: "ffd" }));

  if (sweep.yerlesenDurak + sweep.havuzdaKalan !== 3) fail("sweep durak sayısı tutmuyor");
  if (ffd.yerlesenDurak + ffd.havuzdaKalan !== 3) fail("ffd durak sayısı tutmuyor");
  if (!(sweep.toplamKm > 0) || !(ffd.toplamKm > 0)) fail("güzergâh km hesaplanmadı");
  if (!(sweep.ortDoluluk > 0) || !(ffd.ortDoluluk > 0)) fail("doluluk hesaplanmadı");
}
console.log("planMetrigi: strateji karşılaştırması ok");

// ---------------------------------------------------------------------------
// planMetrigi — bağlayıcı kısıt esas alınıyor mu
// ---------------------------------------------------------------------------
{
  // Kangoo'ya 700 kg: ağırlıkça %88, hacimce %80 → bağlayıcı ağırlık
  const m = planMetrigi({
    yukler: [
      {
        arac: KANGOO,
        duraklar: [dogudaDurak("A", 10, 700)],
        doluluk: {
          kg: 700, cuvalEsdeger: 48, kgYuzde: 87.5, cuvalYuzde: 80,
          baglayiciKisit: "agirlik", asim: false, olcusuzVar: false,
        },
      },
    ],
    yerlesmeyen: [],
  });
  if (Math.abs(m.ortDoluluk - 87.5) > 0.5) {
    fail(`bağlayıcı kısıt (%87,5) esas alınmalı — gelen %${m.ortDoluluk.toFixed(1)}`);
  }
  if (m.aracSayisi !== 1) fail("yüklü araç sayısı 1 olmalı");
}
console.log("planMetrigi: bağlayıcı kısıt ok");

// ---------------------------------------------------------------------------
// Elle araç seçimi şoför kısıtını delemez
// ---------------------------------------------------------------------------
{
  // Kullanıcı 2 Isuzu seçse bile tek C şoförü varsa yalnız biri çıkabilir
  const ikiIsuzu = [NPR10, { ...NPR10, kod: "isuzu3d", ad: "Isuzu 3D" }];
  const tekC = SOFORLER.filter((s) => s.ehliyetSinifi === "C");
  const secim = filoSec([dogudaDurak("A", 10, 5000)], ikiIsuzu, tekC);
  if (secim.secilen.length > 1) {
    fail(`tek C şoförüyle 1 Isuzu çıkabilir — ${secim.secilen.length} seçildi`);
  }
}
console.log("filoSec: elle seçim şoför kısıtını delemiyor ok");

// ---------------------------------------------------------------------------
// Tercih temizleme — bozuk kayıt varsayılana düşmeli
// ---------------------------------------------------------------------------
{
  const bozuk = tercihleriTemizle({
    gunPenceresi: "otuz", strateji: "kafadan", dolulukEsigi: 500,
    uzakAyir: "evet", aracKodlari: [1, "kangoo", null],
  });
  if (bozuk.gunPenceresi !== null) fail("geçersiz pencere null'a düşmeli");
  if (bozuk.strateji !== "sweep") fail("geçersiz strateji varsayılana düşmeli");
  if (bozuk.dolulukEsigi !== VARSAYILAN_TERCIHLER.dolulukEsigi) {
    fail("aralık dışı eşik varsayılana düşmeli");
  }
  if (bozuk.uzakAyir !== false) fail("boolean olmayan değer false olmalı");
  if (bozuk.aracKodlari?.join() !== "kangoo") fail("string olmayan araç kodu elenmeli");

  const bos = tercihleriTemizle(null);
  if (bos.strateji !== "sweep" || bos.gunPenceresi !== null) {
    fail("null girdi varsayılan tercihleri vermeli");
  }
}
console.log("tercihleriTemizle ok");

// ---------------------------------------------------------------------------
// Hydration regresyonu: sunucuda (window yok) tercihler varsayılana eşit olmalı
// ---------------------------------------------------------------------------
{
  // Bu test dosyası Node'da çalışıyor, yani `window` yok — tam olarak SSR'ın
  // gördüğü ortam. `useState(tercihleriOku)` ile başlatıldığında sunucu
  // varsayılanı, istemci localStorage'ı çiziyordu ve React hydration
  // uyuşmazlığı veriyordu. Depo artık iki ortamda da aynı referansı vermeli.
  if (typeof window !== "undefined") fail("bu test window'suz ortam bekliyor");

  const sunucu = tercihSunucuAnlik();
  const istemci = tercihAnlik();

  if (sunucu !== VARSAYILAN_TERCIHLER) {
    fail("sunucu anlık görüntüsü sabit varsayılan referansı olmalı");
  }
  if (istemci !== sunucu) {
    fail("window yokken istemci anlık görüntüsü sunucununkiyle aynı olmalı");
  }
  // useSyncExternalStore getSnapshot'ı her render'da çağırır; farklı referans
  // dönerse React sonsuz döngüye girer.
  if (tercihAnlik() !== tercihAnlik()) {
    fail("tercihAnlik her çağrıda aynı referansı döndürmeli");
  }

  // Abonelik: güncelleme dinleyiciyi uyandırmalı ve referans değişmeli
  let uyandi = 0;
  const birak = tercihAbone(() => uyandi++);
  const oncekiRef = tercihAnlik();
  tercihGuncelle({ strateji: "ffd" });
  if (uyandi !== 1) fail(`dinleyici uyanmadı (${uyandi})`);
  if (tercihAnlik() === oncekiRef) fail("güncelleme sonrası referans değişmeli");
  if (tercihAnlik().strateji !== "ffd") fail("güncelleme uygulanmadı");
  // Dokunulmayan alanlar korunmalı
  if (tercihAnlik().dolulukEsigi !== VARSAYILAN_TERCIHLER.dolulukEsigi) {
    fail("kısmi güncelleme diğer alanları bozmamalı");
  }
  birak();
  tercihGuncelle({ strateji: "sweep" });
  if (uyandi !== 1) fail("abonelik bırakıldıktan sonra uyandırılmamalı");
}
console.log("tercih deposu: SSR uyumu + abonelik ok");
