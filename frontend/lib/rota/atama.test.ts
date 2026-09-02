import {
  dolulukHesapla,
  ffdAta,
  filoSec,
  kalanKapasite,
  sigarMi,
  sweepKumele,
  type Arac,
  type Durak,
  type Sofor,
} from "./atama";
import { gunUzunlugu, sonrakiKalkis } from "./operasyon";

function fail(msg: string): never {
  throw new Error(msg);
}

function yakin(a: number | null, b: number, mesaj: string): void {
  if (a == null || Math.abs(a - b) > 0.05) {
    fail(`${mesaj}: beklenen ~${b}, gelen ${a}`);
  }
}

// Gerçek filo — Melih'in ruhsat teyidi (2026-09-02).
const KANGOO: Arac = {
  kod: "kangoo",
  ad: "Renault Kangoo",
  cuvalKapasite: 60,
  maxKg: 800,
  maxKgTeyitli: true,
  ehliyetSinifi: "B",
  takograf: false,
};
const TRANSIT: Arac = {
  kod: "transit",
  ad: "Ford Transit",
  cuvalKapasite: 180,
  maxKg: 2000,
  maxKgTeyitli: true,
  ehliyetSinifi: "B",
  takograf: false,
};
const NPR10: Arac = {
  kod: "npr10",
  ad: "Isuzu NPR 10",
  cuvalKapasite: 360,
  maxKg: 6600,
  maxKgTeyitli: true,
  ehliyetSinifi: "C",
  takograf: true,
};
const ISUZU3D: Arac = {
  kod: "isuzu3d",
  ad: "Isuzu 3D",
  cuvalKapasite: 480,
  maxKg: 8800,
  maxKgTeyitli: true,
  ehliyetSinifi: "C",
  takograf: true,
};
const FILO = [KANGOO, TRANSIT, NPR10, ISUZU3D];

/** İstiap haddi girilmemiş araç — ağırlık kısıtı hesaplanamaz. */
const LIMITSIZ: Arac = { ...KANGOO, kod: "limitsiz", maxKg: null };

/** Sahadaki kadro (2026-09-02). C ehliyeti B'yi kapsar. */
const SOFORLER: Sofor[] = [
  { kod: "mehmet-baylav", ad: "Mehmet Baylav", ehliyetSinifi: "C" },
  { kod: "muzaffer-gunusen", ad: "Muzaffer Günüşen", ehliyetSinifi: "C" },
  { kod: "ramazan-turkkan", ad: "Ramazan Türkkan", ehliyetSinifi: "B" },
];

const DEPO = { lat: 38.28801183350053, lon: 27.141092424481496 };

function durak(over: Partial<Durak> & { musteriKodu: string }): Durak {
  return {
    unvan: over.musteriKodu,
    lat: DEPO.lat,
    lon: DEPO.lon + 0.3,
    kg: 0,
    cuvalEsdeger: 0,
    olcusuzSatir: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Çift kısıt — sistemin varlık sebebi
// ---------------------------------------------------------------------------
{
  // 40 çuval × 14,56 kg: hacimce %67 ama ağırlıkça %73 → ağırlık bağlayıcı
  const d = dolulukHesapla(KANGOO, [
    durak({ musteriKodu: "A", kg: 582.4, cuvalEsdeger: 40 }),
  ]);
  yakin(d.cuvalYuzde, 66.67, "kangoo hacim yüzdesi");
  yakin(d.kgYuzde, 72.8, "kangoo ağırlık yüzdesi");
  if (d.baglayiciKisit !== "agirlik") fail("ağır çuval yükünde ağırlık bağlamalı");
  if (d.asim) fail("aşım olmamalı");
}
console.log("doluluk: ağırlık bağlayıcı ok");

{
  // Hafif ama hacimli yük (küçük paket) — hacim bağlayıcı
  const d = dolulukHesapla(TRANSIT, [
    durak({ musteriKodu: "B", kg: 500, cuvalEsdeger: 150 }),
  ]);
  yakin(d.cuvalYuzde, 83.33, "transit hacim yüzdesi");
  yakin(d.kgYuzde, 25, "transit ağırlık yüzdesi");
  if (d.baglayiciKisit !== "hacim") fail("hafif hacimli yükte hacim bağlamalı");
}
console.log("doluluk: hacim bağlayıcı ok");

{
  // max_kg tanımsız — ağırlık yüzdesi null, tek ölçülebilir kısıt hacim
  const d = dolulukHesapla(LIMITSIZ, [
    durak({ musteriKodu: "C", kg: 5000, cuvalEsdeger: 30 }),
  ]);
  if (d.kgYuzde !== null) fail("maxKg null iken kgYuzde null olmalı");
  if (d.baglayiciKisit !== "hacim") fail("maxKg null iken hacim bağlamalı");
  if (d.asim) fail("hacim %50 iken aşım olmamalı");
}
console.log("doluluk: istiap tanımsız ok");

{
  const d = dolulukHesapla(KANGOO, [
    durak({ musteriKodu: "D", kg: 300, cuvalEsdeger: 70 }),
  ]);
  if (!d.asim) fail("70 çuval 60'lık araca sığmaz — aşım işaretlenmeli");
}
console.log("doluluk: aşım ok");

{
  const bos = dolulukHesapla(KANGOO, []);
  if (bos.baglayiciKisit !== null) fail("boş araçta bağlayıcı kısıt olmamalı");
  if (bos.kg !== 0 || bos.cuvalEsdeger !== 0) fail("boş araç sıfır olmalı");
}
console.log("doluluk: boş araç ok");

{
  const d = dolulukHesapla(KANGOO, [
    durak({ musteriKodu: "E", kg: 100, cuvalEsdeger: 7, olcusuzSatir: 2 }),
  ]);
  if (!d.olcusuzVar) fail("ölçüsüz satır içeren yük işaretlenmeli");
}
console.log("doluluk: ölçüsüz uyarısı ok");

// ---------------------------------------------------------------------------
// sigarMi — iki kısıt da aşılmamalı
// ---------------------------------------------------------------------------
{
  const mevcut = [durak({ musteriKodu: "X", kg: 700, cuvalEsdeger: 50 })];
  if (sigarMi(KANGOO, mevcut, durak({ musteriKodu: "Y", kg: 150, cuvalEsdeger: 5 }))) {
    fail("ağırlık aşılıyor, sığmamalı");
  }
  if (sigarMi(KANGOO, mevcut, durak({ musteriKodu: "Z", kg: 50, cuvalEsdeger: 15 }))) {
    fail("hacim aşılıyor, sığmamalı");
  }
  if (!sigarMi(KANGOO, mevcut, durak({ musteriKodu: "W", kg: 50, cuvalEsdeger: 5 }))) {
    fail("her iki kısıt da uygun, sığmalı");
  }
}
console.log("sigarMi ok");

// ---------------------------------------------------------------------------
// sweep — depodan açıya göre kümeleme
// ---------------------------------------------------------------------------
{
  // Depo çevresinde saat yönünün tersine 4 nokta: doğu, kuzey, batı, güney
  const dogu = durak({ musteriKodu: "DOGU", lat: DEPO.lat, lon: DEPO.lon + 0.3, cuvalEsdeger: 40 });
  const kuzey = durak({ musteriKodu: "KUZEY", lat: DEPO.lat + 0.3, lon: DEPO.lon, cuvalEsdeger: 40 });
  const bati = durak({ musteriKodu: "BATI", lat: DEPO.lat, lon: DEPO.lon - 0.3, cuvalEsdeger: 40 });
  const guney = durak({ musteriKodu: "GUNEY", lat: DEPO.lat - 0.3, lon: DEPO.lon, cuvalEsdeger: 40 });

  const iki: Arac[] = [
    { ...LIMITSIZ, kod: "a1" },
    { ...LIMITSIZ, kod: "a2" },
  ];
  // Giriş sırası karışık — sweep açıya göre yeniden dizmeli
  const sonuc = sweepKumele([guney, bati, kuzey, dogu], iki, DEPO);

  if (sonuc.yukler[0]!.duraklar.map((d) => d.musteriKodu).join() !== "DOGU") {
    fail(`ilk araç doğuyu almalı, aldı: ${sonuc.yukler[0]!.duraklar.map((d) => d.musteriKodu)}`);
  }
  if (sonuc.yukler[1]!.duraklar.map((d) => d.musteriKodu).join() !== "KUZEY") {
    fail("ikinci araç kuzeyi almalı (açı sırası)");
  }
  if (sonuc.yerlesmeyen.length !== 2) fail("filo dolmalı, 2 durak yerleşmemeli");
  if (sonuc.yerlesmeyen.some((y) => y.neden !== "arac-yok")) {
    fail("filo dolduğunda neden 'arac-yok' olmalı");
  }
}
console.log("sweep: açı sırası + filo tükenmesi ok");

{
  // Koordinatsız müşteri plana giremez ama sessizce kaybolmaz
  const sonuc = sweepKumele(
    [durak({ musteriKodu: "KONUMSUZ", lat: null, lon: null, kg: 100, cuvalEsdeger: 7 })],
    [KANGOO],
    DEPO
  );
  if (sonuc.yerlesmeyen[0]?.neden !== "koordinat-yok") {
    fail("koordinatsız durak 'koordinat-yok' ile düşmeli");
  }
  if (sonuc.yukler[0]!.duraklar.length !== 0) fail("koordinatsız durak araca binmemeli");
}
console.log("sweep: koordinatsız durak ok");

{
  // Tek başına en büyük araca sığmayan sipariş — bölünmesi gerekiyor
  const sonuc = sweepKumele(
    [durak({ musteriKodu: "DEV", kg: 100, cuvalEsdeger: 100 })],
    [KANGOO],
    DEPO
  );
  if (sonuc.yerlesmeyen[0]?.neden !== "kapasite-yetersiz") {
    fail("hiçbir araca sığmayan durak 'kapasite-yetersiz' olmalı");
  }
}
console.log("sweep: kapasite yetersiz ok");

// ---------------------------------------------------------------------------
// FFD — ağırdan hafife, ilk sığan araca
// ---------------------------------------------------------------------------
{
  const sonuc = ffdAta(
    [
      durak({ musteriKodu: "KUCUK", kg: 50, cuvalEsdeger: 3 }),
      durak({ musteriKodu: "BUYUK", kg: 700, cuvalEsdeger: 48 }),
      durak({ musteriKodu: "ORTA", kg: 100, cuvalEsdeger: 7 }),
    ],
    [KANGOO]
  );
  const binen = sonuc.yukler[0]!.duraklar.map((d) => d.musteriKodu);
  if (binen[0] !== "BUYUK") fail("FFD en ağır durakla başlamalı");
  if (binen.join() !== "BUYUK,ORTA") fail(`beklenen BUYUK,ORTA — gelen ${binen}`);
  // 700 + 100 = 800 = tam istiap; 50 daha sığmaz
  if (sonuc.yerlesmeyen.map((y) => y.durak.musteriKodu).join() !== "KUCUK") {
    fail("istiap dolduğunda kalan durak yerleşmemeli");
  }
}
console.log("ffd ok");

// ---------------------------------------------------------------------------
// kalanKapasite
// ---------------------------------------------------------------------------
{
  const k = kalanKapasite(KANGOO, [durak({ musteriKodu: "A", kg: 500, cuvalEsdeger: 35 })]);
  yakin(k.cuval, 25, "kalan çuval");
  yakin(k.kg, 300, "kalan kg");

  const limitsiz = kalanKapasite(LIMITSIZ, []);
  if (limitsiz.kg !== null) fail("maxKg null iken kalan kg null olmalı");

  const dolu = kalanKapasite(KANGOO, [durak({ musteriKodu: "B", kg: 900, cuvalEsdeger: 70 })]);
  if (dolu.cuval !== 0 || dolu.kg !== 0) fail("aşımda kalan kapasite negatife düşmemeli");
}
console.log("kalanKapasite ok");

// ---------------------------------------------------------------------------
// filoSec — günlük araç sayısını şoför belirler
// ---------------------------------------------------------------------------
{
  // 3 şoför, 2'si Isuzu sürebiliyor: günde en fazla 3 araç ve en fazla 2 Isuzu.
  // Sahada uygulanamayan planın kaynağı, motorun 4 aracı da doldurmasıydı.
  const agirYuk = [
    durak({ musteriKodu: "A", kg: 6000, cuvalEsdeger: 410 }),
    durak({ musteriKodu: "B", kg: 5000, cuvalEsdeger: 340 }),
    durak({ musteriKodu: "C", kg: 1500, cuvalEsdeger: 100 }),
    durak({ musteriKodu: "D", kg: 1800, cuvalEsdeger: 120 }),
  ];
  const secim = filoSec(agirYuk, FILO, SOFORLER);

  if (secim.secilen.length > 3) fail("3 şoförle 3'ten fazla araç seçilemez");
  if (secim.secilen.filter((a) => a.ehliyetSinifi === "C").length > 2) {
    fail("Isuzu'ları yalnız 2 şoför sürebiliyor, 2'den fazla seçilemez");
  }
  if (secim.soforSayisi.B !== 1 || secim.soforSayisi.C !== 2) {
    fail("şoför sayısı sınıf bazında yanlış sayıldı");
  }
  // Seçilen her araca gerçekten sürebilen bir şoför düşmeli
  for (const a of secim.secilen) {
    const s = secim.atamalar[a.kod];
    if (!s) fail(`${a.ad} için şoför atanmadı`);
    if (s.ehliyetSinifi === "B" && a.ehliyetSinifi === "C") {
      fail(`${s.ad} (B) ${a.ad} aracını süremez`);
    }
  }
}
console.log("filoSec: şoför sınırı ok");

{
  // C ehliyeti B'yi kapsadığı için Kangoo ve Transit AYNI GÜN çıkabilir:
  // biri Ramazan'a, biri bir C şoförüne. Önceki katı modelde imkânsızdı.
  const kucukFilo = [KANGOO, TRANSIT];
  const yuk = [
    durak({ musteriKodu: "A", kg: 780, cuvalEsdeger: 54 }),
    durak({ musteriKodu: "B", kg: 1900, cuvalEsdeger: 130 }),
  ];
  const secim = filoSec(yuk, kucukFilo, SOFORLER);
  const kodlar = secim.secilen.map((a) => a.kod).sort().join();
  if (kodlar !== "kangoo,transit") {
    fail(`iki küçük araç birlikte seçilebilmeli — gelen ${kodlar}`);
  }
  if (Object.keys(secim.atamalar).length !== 2) {
    fail("her iki araca da şoför atanmalı");
  }
}
console.log("filoSec: Kangoo + Transit birlikte ok");

{
  // Hafif yük — en küçük yeterli filo seçilmeli, üç araç birden değil.
  // Melih: "araçlar dolmadan rut'a göndermeyi tercih etmiyoruz."
  const hafif = [durak({ musteriKodu: "A", kg: 700, cuvalEsdeger: 48 })];
  const secim = filoSec(hafif, FILO, SOFORLER);

  if (!secim.yeterli) fail("48 çuval filoya sığmalı");
  if (secim.secilen.length !== 1) {
    fail(`tek araç yetiyorken ${secim.secilen.length} araç seçildi`);
  }
  if (secim.secilen[0]!.kod !== "kangoo") {
    fail(`en küçük yeterli araç Kangoo olmalı — gelen ${secim.secilen[0]!.kod}`);
  }
}
console.log("filoSec: en küçük yeterli filo ok");

{
  // Yalnız Ramazan varsa (B) hiçbir Isuzu plana giremez — B ehliyeti C'yi
  // kapsamıyor. Küçük araçlardan da yalnız biri çıkabilir (tek şoför).
  const yalnizB = SOFORLER.filter((s) => s.ehliyetSinifi === "B");
  const secim = filoSec(
    [durak({ musteriKodu: "A", kg: 5000, cuvalEsdeger: 340 })],
    FILO,
    yalnizB
  );
  if (secim.secilen.some((a) => a.ehliyetSinifi === "C")) {
    fail("B şoförü Isuzu süremez, seçilmemeli");
  }
  if (secim.secilen.length > 1) fail("tek şoförle 1'den fazla araç çıkamaz");
  if (secim.yeterli) fail("5 tonluk yük tek küçük araca sığmamalı");
}
console.log("filoSec: B şoförü Isuzu süremez ok");

{
  // Filoyu aşan yük: en büyük kombinasyon seçilir, artan durak havuzda kalır
  // ve nedeni "araç yok" değil — Transit boşta ama şoförü yok.
  // Çıkabilecek en büyük filo Transit+NPR+3D = 1.020 çuval / 17.400 kg.
  // 8 × 170 = 1.360 çuval, 8 × 2.500 = 20.000 kg — iki kısıt da aşılıyor.
  const cokAgir = Array.from({ length: 8 }, (_, i) =>
    durak({ musteriKodu: `M${i}`, kg: 2500, cuvalEsdeger: 170 })
  );
  const secim = filoSec(cokAgir, FILO, SOFORLER);
  if (secim.yeterli) fail("1.360 çuvallık yük filoya sığmamalı");

  const sonuc = sweepKumele(cokAgir, secim.secilen, DEPO, FILO);
  if (sonuc.yerlesmeyen.length === 0) fail("artan durak havuzda kalmalı");

  const nedenler = new Set(sonuc.yerlesmeyen.map((y) => y.neden));
  if (!nedenler.has("sofor-yok") && !nedenler.has("arac-yok")) {
    fail(`beklenen sofor-yok/arac-yok — gelen ${[...nedenler].join()}`);
  }
}
console.log("filoSec: kapasite aşımı ok");

{
  // Plan dışı kalan araç varsa neden "şoför yok" olmalı: yük tek Kangoo'ya
  // veriliyor, Transit filoda duruyor ama B şoförü Kangoo'da.
  const sonuc = sweepKumele(
    [
      durak({ musteriKodu: "A", kg: 780, cuvalEsdeger: 54 }),
      durak({ musteriKodu: "B", kg: 700, cuvalEsdeger: 48 }),
    ],
    [KANGOO],
    DEPO,
    FILO
  );
  const kalan = sonuc.yerlesmeyen[0];
  if (!kalan) fail("ikinci durak Kangoo'ya sığmamalı");
  if (kalan.neden !== "sofor-yok") {
    fail(`Transit boştayken neden sofor-yok olmalı — gelen ${kalan.neden}`);
  }
}
console.log("sweep: sofor-yok nedeni ok");

// ---------------------------------------------------------------------------
// gunUzunlugu — Google yalnız sürüşü veriyor, boşaltma ve mola bizde
// ---------------------------------------------------------------------------
{
  // 5 durak × 15 dk = 75 dk servis; takograf sınırı aşılmadı, mola yok.
  const g = gunUzunlugu({ surusSaniye: 3 * 3600, durakSayisi: 5, takograf: false });
  yakin(g.servisSaniye, 75 * 60, "servis süresi");
  yakin(g.molaSaniye, 0, "mola gereksiz");
  yakin(g.toplamSaniye, 3 * 3600 + 75 * 60, "toplam gün uzunluğu");

  // 5 saat sürüş takograflı araçta 4,5 saati aşıyor → 30 dk zorunlu mola
  const molali = gunUzunlugu({ surusSaniye: 5 * 3600, durakSayisi: 2, takograf: true });
  yakin(molali.molaSaniye, 30 * 60, "takograf molası");

  // Aynı sürüş takografsız araçta mola getirmez
  const molasiz = gunUzunlugu({ surusSaniye: 5 * 3600, durakSayisi: 2, takograf: false });
  yakin(molasiz.molaSaniye, 0, "takografsız araçta mola yok");
}
console.log("gunUzunlugu ok");

// ---------------------------------------------------------------------------
// sonrakiKalkis — 08:30, pazar atlanır
// ---------------------------------------------------------------------------
{
  // Cumartesi 14:00 → pazar atlanıp pazartesi 08:30
  const cumartesi = new Date(2026, 8, 5, 14, 0, 0, 0);
  if (cumartesi.getDay() !== 6) fail("test verisi cumartesi olmalı");
  const kalkis = sonrakiKalkis(cumartesi);
  if (kalkis.getDay() !== 1) fail(`pazar atlanmalı — gelen gün ${kalkis.getDay()}`);
  if (kalkis.getHours() !== 8 || kalkis.getMinutes() !== 30) {
    fail("kalkış 08:30 olmalı");
  }

  // Sabah 07:00 → aynı gün 08:30 (henüz geçmedi)
  const erken = new Date(2026, 8, 3, 7, 0, 0, 0);
  const ayniGun = sonrakiKalkis(erken);
  if (ayniGun.getDate() !== erken.getDate()) fail("08:30 geçmediyse aynı gün kalkılır");
}
console.log("sonrakiKalkis ok");

// ---------------------------------------------------------------------------
// Regresyon: dev sipariş filo imlecini yakmamalı
// ---------------------------------------------------------------------------
{
  // 24.02.2026 gününü geri oynatırken çıktı: 8,7 tonluk tek müşteri hiçbir
  // araca sığmıyor ama sweep onu yerleştirmeye çalışırken imleci filonun
  // sonuna itiyordu; arkasındaki duraklar boş duran Isuzu 3D'ye binemiyordu.
  const dev = durak({ musteriKodu: "DEV", kg: 8700, cuvalEsdeger: 600 });
  const normal1 = durak({ musteriKodu: "N1", kg: 400, cuvalEsdeger: 28 });
  const normal2 = durak({ musteriKodu: "N2", kg: 300, cuvalEsdeger: 20 });

  const sonuc = sweepKumele([dev, normal1, normal2], [KANGOO, NPR10], DEPO);

  const binen = sonuc.yukler.flatMap((y) => y.duraklar.map((d) => d.musteriKodu));
  if (!binen.includes("N1") || !binen.includes("N2")) {
    fail(`dev sipariş sonrası normal duraklar yerleşmeli — binen: ${binen.join()}`);
  }
  const devKalan = sonuc.yerlesmeyen.find((y) => y.durak.musteriKodu === "DEV");
  if (devKalan?.neden !== "kapasite-yetersiz") {
    fail(`dev sipariş 'kapasite-yetersiz' olmalı — gelen ${devKalan?.neden}`);
  }
  if (sonuc.yerlesmeyen.length !== 1) {
    fail(`yalnız dev sipariş havuzda kalmalı — ${sonuc.yerlesmeyen.length} kaldı`);
  }
}
console.log("sweep: dev sipariş imleci yakmıyor ok");
