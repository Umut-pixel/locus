import type { Arac, Durak, Sofor } from "./atama";
import { filoSec, surulebilirKirp } from "./atama";
import { bolgele } from "./bolge";
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
    uzakAyir: "evet",
  });
  if (bozuk.gunPenceresi !== null) fail("geçersiz pencere null'a düşmeli");
  // Varsayılan artık "bolge" — sabit değil, VARSAYILAN_TERCIHLER'e bağlanıyor
  // ki varsayılan bir daha değiştiğinde test yalan söylemesin.
  if (bozuk.strateji !== VARSAYILAN_TERCIHLER.strateji) {
    fail("geçersiz strateji varsayılana düşmeli");
  }
  if (bozuk.dolulukEsigi !== VARSAYILAN_TERCIHLER.dolulukEsigi) {
    fail("aralık dışı eşik varsayılana düşmeli");
  }
  // uzakAyir de AYNI DESENİ izlemeli: boolean olmayan değer varsayılana
  // düşer — sabit `false`e değil. Bu, varsayılan `true`ya çevrildiğinde
  // (2026-09-11) eski/bozuk kayıtların hâlâ güvensiz davranışta takılı
  // kalmasını önleyen düzeltmenin kendisi.
  if (bozuk.uzakAyir !== VARSAYILAN_TERCIHLER.uzakAyir) {
    fail("boolean olmayan uzakAyir varsayılana düşmeli");
  }
  // Elle filo seçimi kaldırıldı; eski kayıtta kalan alan yok sayılmalı.
  if ("aracKodlari" in bozuk) fail("aracKodlari tercihlerden düşmeli");

  const bos = tercihleriTemizle(null);
  if (
    bos.strateji !== VARSAYILAN_TERCIHLER.strateji ||
    bos.gunPenceresi !== null
  ) {
    fail("null girdi varsayılan tercihleri vermeli");
  }
  if (bos.uzakAyir !== VARSAYILAN_TERCIHLER.uzakAyir) {
    fail("null girdi uzakAyir'de de varsayılanı vermeli");
  }
  // Geçerli seçim korunmalı — varsayılan değişti diye kullanıcının seçtiği
  // strateji sessizce değişmesin.
  if (tercihleriTemizle({ strateji: "sweep" }).strateji !== "sweep") {
    fail("geçerli strateji korunmalı");
  }
  if (tercihleriTemizle({ strateji: "ffd" }).strateji !== "ffd") {
    fail("ffd korunmalı");
  }
  // Kullanıcının BİLEREK "Karışık" (false) seçmiş olması da korunmalı —
  // varsayılan true'ya döndü diye açık seçim sessizce ezilmemeli.
  if (tercihleriTemizle({ uzakAyir: false }).uzakAyir !== false) {
    fail("açıkça false seçilmiş uzakAyir korunmalı");
  }
  if (tercihleriTemizle({ uzakAyir: true }).uzakAyir !== true) {
    fail("açıkça true seçilmiş uzakAyir korunmalı");
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

// ---------------------------------------------------------------------------
// Regresyon: elle araç seçimi küçültülmemeli
// ---------------------------------------------------------------------------
{
  // Ekranda görülen hata: kullanıcı 4 aracı elle seçiyor, 78 çuvallık yük tek
  // Transit'e sığdığı için `filoSec` diğer üçünü atıyordu — "Araçlar" bölümünde
  // tek araç görünüyordu. Elle seçim niyet beyanıdır, optimize edilmez.
  const KANGOO2: Arac = {
    kod: "kangoo", ad: "Renault Kangoo", cuvalKapasite: 60, maxKg: 800,
    maxKgTeyitli: true, ehliyetSinifi: "B", takograf: false,
  };
  const TRANSIT2: Arac = {
    kod: "transit", ad: "Ford Transit", cuvalKapasite: 180, maxKg: 2000,
    maxKgTeyitli: true, ehliyetSinifi: "B", takograf: false,
  };
  const ISUZU3D: Arac = {
    kod: "isuzu3d", ad: "Isuzu 3D", cuvalKapasite: 480, maxKg: 8800,
    maxKgTeyitli: true, ehliyetSinifi: "C", takograf: true,
  };
  const dortlu = [KANGOO2, TRANSIT2, NPR10, ISUZU3D];
  const ucSofor: Sofor[] = [
    { kod: "m", ad: "Mehmet Baylav", ehliyetSinifi: "C" },
    { kod: "z", ad: "Muzaffer Günüşen", ehliyetSinifi: "C" },
    { kod: "r", ad: "Ramazan Türkkan", ehliyetSinifi: "B" },
  ];
  const hafifYuk = [dogudaDurak("A", 10, 1167)];

  // filoSec hâlâ küçültür — otomatik mod için doğru davranış
  const otomatik = filoSec(hafifYuk, dortlu, ucSofor);
  if (otomatik.secilen.length !== 1) {
    fail(`otomatik modda en küçük filo seçilmeli, gelen ${otomatik.secilen.length}`);
  }

  // Elle seçimde kırpma yapılır ama küçültme YAPILMAZ
  const { cikan, elenen } = surulebilirKirp(dortlu, ucSofor);
  if (cikan.length !== 3) {
    fail(`3 şoförle 3 araç çıkmalı, gelen ${cikan.length}`);
  }
  if (elenen.length !== 1) fail("4. araç elenmeli ve bildirilmeli");
  // Sıra korunur: ilk üç araç geçer, dördüncü elenir
  if (cikan.map((a) => a.kod).join() !== "kangoo,transit,npr10") {
    fail(`sıra korunmalı, gelen ${cikan.map((a) => a.kod).join()}`);
  }
  if (elenen[0]!.kod !== "isuzu3d") fail("elenen 4. araç olmalı");

  // Isuzu sınırı: 2 C şoförü varken 2'den fazla Isuzu çıkamaz
  const ikiIsuzuArtiKucuk = [ISUZU3D, NPR10, { ...ISUZU3D, kod: "isuzu4", ad: "Isuzu 4" }];
  const k2 = surulebilirKirp(ikiIsuzuArtiKucuk, ucSofor);
  if (k2.cikan.filter((a) => a.ehliyetSinifi === "C").length > 2) {
    fail("2 C şoförüyle 2'den fazla Isuzu çıkamaz");
  }

  // Şoför yetiyorsa hiçbiri elenmez
  const k3 = surulebilirKirp([KANGOO2, TRANSIT2], ucSofor);
  if (k3.elenen.length !== 0) fail("3 şoförle 2 araç elenmemeli");
  if (k3.cikan.length !== 2) fail("2 araç da çıkmalı");
}
console.log("surulebilirKirp: elle seçim korunuyor ok");

// ---------------------------------------------------------------------------
// Sabitleme önizlemeye de girmeli — `EtkiPaneli` regresyonu
// ---------------------------------------------------------------------------
//
// Sahadaki hata: `otomatikDagit` `planOlustur`'a `sabitlemeler` geçiyordu,
// etki panelini besleyen `uret()` geçmiyordu. Kullanıcı bir bölgeyi araca
// sabitleyince kart SABİTLEMESİZ planın sayılarını gösterirken buton
// SABİTLEMELİ plan üretiyordu; önizleme ile eylem sessizce ayrışıyordu.
//
// Bu test argümanın çıktıyı gerçekten değiştirdiğini kilitliyor: değiştirmiyor
// olsaydı yukarıdaki hata fark edilmezdi.
{
  const duraklar = [
    durakAt("A1", 30, 0, 400),
    durakAt("A2", 32, 5, 400),
    durakAt("B1", 30, 180, 400),
    durakAt("B2", 32, 185, 400),
  ];
  const araclar = [NPR10, { ...NPR10, kod: "npr2", ad: "Isuzu NPR 2" }];

  const sabitlemesiz = planOlustur({
    duraklar, araclar, tumFilo: araclar, depo: DEPO,
    strateji: "bolge", uzakAyir: false,
  });

  // Sabitlemesiz planda ilk bölge hangi araca düştüyse, onu ÖTEKİ araca sabitle.
  const ilkYuk = sabitlemesiz.yukler.find((y) => y.duraklar.length > 0);
  if (!ilkYuk) fail("sabitlemesiz plan boş çıktı — test kurulumu bozuk");
  const ilkDurak = ilkYuk.duraklar[0]!;

  const bolgeler = bolgele(duraklar, DEPO);
  const hedefBolge = bolgeler.find((b) =>
    b.duraklar.some((d) => d.musteriKodu === ilkDurak.musteriKodu)
  );
  if (!hedefBolge) fail("durağın bölgesi bulunamadı");

  const otekiArac = araclar.find((a) => a.kod !== ilkYuk.arac.kod)!;
  const sabitlemeli = planOlustur({
    duraklar, araclar, tumFilo: araclar, depo: DEPO,
    strateji: "bolge", uzakAyir: false,
    sabitlemeler: { [hedefBolge.kod]: otekiArac.kod },
  });

  const nereye = (sonuc: typeof sabitlemesiz) =>
    sonuc.yukler.find((y) =>
      y.duraklar.some((d) => d.musteriKodu === ilkDurak.musteriKodu)
    )?.arac.kod;

  if (nereye(sabitlemeli) !== otekiArac.kod) {
    fail(
      `sabitlenen bölge ${otekiArac.kod} aracına gitmeliydi, ` +
        `giden: ${nereye(sabitlemeli)}`
    );
  }
  if (nereye(sabitlemesiz) === nereye(sabitlemeli)) {
    fail("sabitleme sonucu değiştirmedi — test ayrışmayı yakalayamaz");
  }

  // Ölçüm de ayrışıyor olmalı: önizleme bu argümanı atlarsa yanlış sayı gösterir.
  const m1 = planMetrigi(sabitlemesiz);
  const m2 = planMetrigi(sabitlemeli);
  if (m1.yerlesenDurak !== m2.yerlesenDurak) {
    fail("sabitleme yerleşen durak sayısını değiştirmemeli");
  }
}
console.log("planOlustur: sabitleme önizlemeye de giriyor ok");

// ---------------------------------------------------------------------------
// Varsayılan tercih uzak/yakın karışmasına İZİN VERMEMELİ
// ---------------------------------------------------------------------------
//
// 2026-09-11 vakası: kullanıcı "tek aracı İzmir genelinde dolaştırıp sonra
// çok uzak bir ilçeye de gönderiyoruz, mantıksız" diye bildirdi. Kök neden:
// `uzakAyir` varsayılanı `false`ti — "Bölge" dışındaki stratejilerde (Coğrafi/
// Doluluk) hiçbir coğrafi güvence yoktu. Bu test varsayılan tercihin GÜVENLİ
// tarafta olduğunu kilitliyor; birisi `VARSAYILAN_TERCIHLER.uzakAyir`'i
// sessizce `false`'a çevirirse burada kırılmalı.
{
  if (VARSAYILAN_TERCIHLER.uzakAyir !== true) {
    fail("VARSAYILAN_TERCIHLER.uzakAyir true olmalı — aksi 'Coğrafi'/'Doluluk' stratejisinde uzak+yakın karışmasını geri getirir");
  }

  const duraklar = [
    durakAt("IZMIR1", 15, 0, 300),
    durakAt("IZMIR2", 20, 5, 300),
    durakAt("COKUZAK", 480, 10, 300),
  ];
  const filo = [NPR10];

  const varsayilanla = planOlustur({
    duraklar, araclar: filo, tumFilo: filo, depo: DEPO,
    strateji: "sweep", uzakAyir: VARSAYILAN_TERCIHLER.uzakAyir,
  });
  for (const y of varsayilanla.yukler) {
    if (y.duraklar.length === 0) continue;
    const uzakVar = y.duraklar.some(uzakMi);
    const yakinVar = y.duraklar.some((d) => !uzakMi(d));
    if (uzakVar && yakinVar) {
      fail(
        `varsayılan tercihle ${y.arac.ad} hem 480 km'lik hem 15-20 km'lik durak taşıyor`
      );
    }
  }
}
console.log("planOlustur: varsayılan tercih uzak+yakın karıştırmıyor ok");
