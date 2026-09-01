import {
  dolulukHesapla,
  ffdAta,
  kalanKapasite,
  sigarMi,
  sweepKumele,
  type Arac,
  type Durak,
} from "./atama";

function fail(msg: string): never {
  throw new Error(msg);
}

function yakin(a: number | null, b: number, mesaj: string): void {
  if (a == null || Math.abs(a - b) > 0.05) {
    fail(`${mesaj}: beklenen ~${b}, gelen ${a}`);
  }
}

const KANGOO: Arac = {
  kod: "kangoo",
  ad: "Renault Kangoo",
  cuvalKapasite: 60,
  maxKg: 800,
  maxKgTeyitli: false,
};
const TRANSIT: Arac = {
  kod: "transit",
  ad: "Ford Transit",
  cuvalKapasite: 180,
  maxKg: 1500,
  maxKgTeyitli: false,
};
/** İstiap haddi girilmemiş araç — ağırlık kısıtı hesaplanamaz. */
const LIMITSIZ: Arac = { ...KANGOO, kod: "limitsiz", maxKg: null };

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
  yakin(d.kgYuzde, 33.33, "transit ağırlık yüzdesi");
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
