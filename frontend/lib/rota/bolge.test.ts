import { filoyaSigarMi, filoSec, type Arac, type Durak, type Sofor } from "./atama";
import { bolgeAta, bolgele, turKur } from "./bolge";
import { planMetrigi } from "./planla";
import { DEPOT } from "../depot";

function fail(msg: string): never {
  throw new Error(msg);
}

function esit(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(`${msg}: ${a} !== ${e}`);
}

function dogru(kosul: boolean, msg: string): void {
  if (!kosul) fail(msg);
}

const DEPO = { lat: DEPOT.lat, lon: DEPOT.lon };

let sayac = 0;
function durak(
  p: Partial<Durak> & { lat: number | null; lon: number | null }
): Durak {
  sayac += 1;
  return {
    musteriKodu: p.musteriKodu ?? `M${sayac}`,
    unvan: p.unvan ?? `Müşteri ${sayac}`,
    lat: p.lat,
    lon: p.lon,
    kg: p.kg ?? 100,
    cuvalEsdeger: p.cuvalEsdeger ?? 10,
    olcusuzSatir: p.olcusuzSatir ?? 0,
    sehir: p.sehir ?? null,
    ilce: p.ilce ?? null,
  };
}

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

/** aracKod → o araçtaki müşteri kodları. */
function dagilim(sonuc: ReturnType<typeof bolgeAta>): Record<string, string[]> {
  const o: Record<string, string[]> = {};
  for (const y of sonuc.yukler) {
    o[y.arac.kod] = y.duraklar.map((d) => d.musteriKodu);
  }
  return o;
}

function aracinKodu(
  sonuc: ReturnType<typeof bolgeAta>,
  musteriKodu: string
): string | null {
  for (const y of sonuc.yukler) {
    if (y.duraklar.some((d) => d.musteriKodu === musteriKodu)) return y.arac.kod;
  }
  return null;
}

// ---------------------------------------------------------------------------
// REGRESYON — 2025-12-22'de sahada olan vaka
// ---------------------------------------------------------------------------
// Sweep o gün Transit'e iki durak koymuştu: depoya 4 km'deki bir müşteri ile
// İstanbul (325 km). Açı sırasında yan yana düştükleri ve kesim noktası
// tamamen kapasiteye bağlı olduğu için. Bölge dağıtımında bunun İMKÂNSIZ
// olması gerekiyor: farklı mesafe bandı → farklı bölge → farklı tur.
{
  const y1 = durak({ lat: 38.30, lon: 27.16, sehir: "İZMİR", ilce: "MENDERES", musteriKodu: "YAKIN-1" });
  const y2 = durak({ lat: 38.31, lon: 27.17, sehir: "İZMİR", ilce: "MENDERES", musteriKodu: "YAKIN-2" });
  // Kaydı "AYDIN" ama depoya 4 km — dosyadaki gerçek tuhaflık.
  const y3 = durak({ lat: 38.27, lon: 27.18, sehir: "AYDIN", ilce: "MERKEZ", musteriKodu: "AYDIN-4KM" });
  const uzak = durak({
    lat: 40.99, lon: 29.03, sehir: "İSTANBUL", ilce: "KADIKÖY",
    musteriKodu: "ISTANBUL", cuvalEsdeger: 20, kg: 250,
  });

  const sonuc = bolgeAta([y1, y2, y3, uzak], [KANGOO, TRANSIT], DEPO);

  const istanbulArac = aracinKodu(sonuc, "ISTANBUL");
  const aydinArac = aracinKodu(sonuc, "AYDIN-4KM");
  dogru(istanbulArac != null, "İstanbul durağı yerleşmeli");
  dogru(aydinArac != null, "4 km'deki durak yerleşmeli");
  dogru(
    istanbulArac !== aydinArac,
    `İstanbul (340 km) ile 4 km'deki durak aynı araca binmemeli — ikisi de ${istanbulArac}`
  );

  // Şehir içi üç durak birlikte kalmalı: küçük bölge aynı banttaki komşusuna
  // katılır, uzak bantla ASLA birleşmez.
  esit(
    aracinKodu(sonuc, "YAKIN-1"),
    aracinKodu(sonuc, "YAKIN-2"),
    "aynı ilçedeki iki durak aynı araçta"
  );
  esit(
    aracinKodu(sonuc, "YAKIN-1"),
    aydinArac,
    "açıca komşu şehir içi duraklar aynı araçta"
  );
  esit(sonuc.yerlesmeyen.length, 0, "hepsi yerleşmeli");
}
console.log("bolgeAta: uzak durak şehir içi turla birleşmiyor ok");

// ---------------------------------------------------------------------------
// Bir ilçe asla iki bölgeye bölünmez
// ---------------------------------------------------------------------------
{
  // Bornova'nın dört köşesi — sektör sınırına yayılsalar bile tek bölge.
  const bornova = [
    durak({ lat: 38.47, lon: 27.22, sehir: "İZMİR", ilce: "BORNOVA" }),
    durak({ lat: 38.45, lon: 27.26, sehir: "İZMİR", ilce: "BORNOVA" }),
    durak({ lat: 38.49, lon: 27.19, sehir: "İZMİR", ilce: "BORNOVA" }),
    durak({ lat: 38.46, lon: 27.24, sehir: "İZMİR", ilce: "BORNOVA" }),
  ];
  const digerleri = [
    durak({ lat: 38.16, lon: 27.36, sehir: "İZMİR", ilce: "TORBALI" }),
    durak({ lat: 37.85, lon: 27.84, sehir: "AYDIN", ilce: "MERKEZ" }),
  ];

  const bolgeler = bolgele([...bornova, ...digerleri], DEPO);
  const bornovaKodlari = new Set(bornova.map((d) => d.musteriKodu));
  const tasiyan = bolgeler.filter((b) =>
    b.duraklar.some((d) => bornovaKodlari.has(d.musteriKodu))
  );
  esit(tasiyan.length, 1, "Bornova tek bölgede");
  esit(
    tasiyan[0]!.duraklar.filter((d) => bornovaKodlari.has(d.musteriKodu)).length,
    4,
    "Bornova'nın tüm durakları o bölgede"
  );
  // Bölge adı baskın şehir + yön taşımalı — ekranda okunabilir olmalı.
  dogru(
    tasiyan[0]!.ad.includes("İzmir"),
    `bölge adı baskın şehri taşımalı: ${tasiyan[0]!.ad}`
  );
  dogru(tasiyan[0]!.ilceler.includes("Bornova"), "ilçe listesi dolmalı");
}
console.log("bolgele: ilçe bölünmüyor ok");

// ---------------------------------------------------------------------------
// Uzak hatlar yön yön ayrılıyor — Balıkesir ile Muğla aynı tura girmemeli
// ---------------------------------------------------------------------------
{
  const kuzey = durak({ lat: 39.65, lon: 27.89, sehir: "BALIKESİR", ilce: "MERKEZ", cuvalEsdeger: 40 });
  const guney = durak({ lat: 37.21, lon: 28.36, sehir: "MUĞLA", ilce: "MERKEZ", cuvalEsdeger: 40 });

  const bolgeler = bolgele([kuzey, guney], DEPO);
  esit(bolgeler.length, 2, "zıt yönlerdeki uzak bölgeler ayrı");

  const turlar = turKur(bolgeler, { cuval: 480, kg: 8800 });
  esit(turlar.length, 2, "zıt yönlü uzak bölgeler ayrı tur");

  // Kapasite ikisini de tek araca alabilir; yine de ayrı araca binmeliler.
  const sonuc = bolgeAta([kuzey, guney], [NPR10, ISUZU3D], DEPO);
  dogru(
    aracinKodu(sonuc, kuzey.musteriKodu) !== aracinKodu(sonuc, guney.musteriKodu),
    "Balıkesir ile Muğla aynı araca binmemeli"
  );
}
console.log("turKur: uzak hatlar yöne göre ayrışıyor ok");

// ---------------------------------------------------------------------------
// Bölge en büyük araca sığmıyorsa BÖLÜNÜR, ikinci araç aynı bölgeye gider
// ---------------------------------------------------------------------------
{
  // Tek ilçede 500 çuval — en büyük araç 480 alıyor.
  const agirlar = Array.from({ length: 10 }, (_, i) =>
    durak({
      lat: 38.47 + i * 0.001,
      lon: 27.22,
      sehir: "İZMİR",
      ilce: "BORNOVA",
      cuvalEsdeger: 50,
      kg: 600,
      musteriKodu: `B${i}`,
    })
  );

  const sonuc = bolgeAta(agirlar, [ISUZU3D, NPR10], DEPO);
  const d = dagilim(sonuc);
  dogru(d.isuzu3d!.length > 0, "en büyük araç dolmalı");
  dogru(d.npr10!.length > 0, "artan yük ikinci araca geçmeli");
  esit(
    d.isuzu3d!.length + d.npr10!.length,
    10,
    "bölünen bölgenin tüm durakları yerleşmeli"
  );
  esit(sonuc.yerlesmeyen.length, 0, "havuzda durak kalmamalı");
  // Aşım OLMAMALI — bölme kapasiteyi delmenin mazereti değil.
  for (const y of sonuc.yukler) {
    dogru(!y.doluluk.asim, `${y.arac.kod} kapasiteyi aşmamalı`);
  }
}
console.log("bolgeAta: bölge bölünüyor, ikinci araç aynı bölgeye ok");

// ---------------------------------------------------------------------------
// Sözleşme — koordinatsız durak ve boş filo
// ---------------------------------------------------------------------------
{
  const konumsuz = durak({ lat: null, lon: null, sehir: "İZMİR", ilce: "KONAK" });
  const normal = durak({ lat: 38.42, lon: 27.14, sehir: "İZMİR", ilce: "KONAK" });

  const sonuc = bolgeAta([konumsuz, normal], [TRANSIT], DEPO);
  esit(sonuc.yerlesmeyen.length, 1, "koordinatsız durak havuzda");
  esit(sonuc.yerlesmeyen[0]!.neden, "koordinat-yok", "neden doğru");
  esit(aracinKodu(sonuc, normal.musteriKodu), "transit", "diğeri yerleşti");

  // Filo boşsa her şey havuzda kalmalı, patlamamalı.
  const bosFilo = bolgeAta([normal], [], DEPO, [TRANSIT]);
  esit(bosFilo.yukler.length, 0, "araç yoksa yük listesi boş");
  esit(bosFilo.yerlesmeyen.length, 1, "araç yoksa durak havuzda");
  esit(bosFilo.yerlesmeyen[0]!.neden, "sofor-yok", "filoda araç var ama plana girmemiş");

  // Hiçbir araca sığmayan dev sipariş "kapasite-yetersiz" demeli.
  const dev = durak({ lat: 38.42, lon: 27.14, cuvalEsdeger: 5000, kg: 90000 });
  const devSonuc = bolgeAta([dev], [TRANSIT], DEPO);
  esit(devSonuc.yerlesmeyen[0]!.neden, "kapasite-yetersiz", "dev sipariş nedeni");
}
console.log("bolgeAta: sözleşme (koordinat/araç/kapasite) ok");

// ---------------------------------------------------------------------------
// filoyaSigarMi — toplam kapasite yetiyor ama duraklar bölünemiyor
// ---------------------------------------------------------------------------
// 2025-12-22'de olan buydu: filoSec toplam yüke bakıp yeterli diyordu,
// 28 duraktan 8'i havuzda kalıyordu.
{
  const a = durak({ lat: 38.42, lon: 27.14, cuvalEsdeger: 100, kg: 1200 });
  const b = durak({ lat: 38.43, lon: 27.15, cuvalEsdeger: 100, kg: 1200 });

  // Toplam 200 çuval, filo 60 + 180 = 240 → kaba hesap "yeter" der.
  // Ama 100 çuvallık durak Kangoo'ya sığmıyor, ikisi de Transit'e binemez.
  dogru(
    !filoyaSigarMi([a, b], [KANGOO, TRANSIT]),
    "bölünemez duraklar filoya sığmamalı"
  );
  dogru(filoyaSigarMi([a, b], [TRANSIT, NPR10]), "sığması gereken durum");

  const soforler: Sofor[] = [
    { kod: "s1", ad: "Mehmet", ehliyetSinifi: "C" },
    { kod: "s2", ad: "Ramazan", ehliyetSinifi: "B" },
  ];
  const filo = filoSec([a, b], [KANGOO, TRANSIT], soforler);
  dogru(!filo.yeterli, "filoSec kaba kapasiteye kanmamalı");
}
console.log("filoyaSigarMi: bölünemez durak ok");

// ---------------------------------------------------------------------------
// Metrik — bölge stratejisi sweep'ten daha az bölge bölüyor
// ---------------------------------------------------------------------------
{
  const duraklar = [
    ...Array.from({ length: 6 }, (_, i) =>
      durak({ lat: 38.46 + i * 0.002, lon: 27.22, sehir: "İZMİR", ilce: "BORNOVA", cuvalEsdeger: 25 })
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      durak({ lat: 37.85, lon: 27.84 + i * 0.002, sehir: "AYDIN", ilce: "MERKEZ", cuvalEsdeger: 25 })
    ),
  ];

  const bolge = planMetrigi(bolgeAta(duraklar, [TRANSIT, NPR10], DEPO));
  esit(bolge.bolunmusBolge, 0, "bölge stratejisi ilçe bölmemeli");
  dogru(bolge.maxYayilimKm < 100, `yayılım dar olmalı: ${bolge.maxYayilimKm}`);
  dogru(bolge.havuzdaKalan === 0, "durak havuzda kalmamalı");
}
console.log("planMetrigi: bölge bütünlüğü ok");

console.log("bolge: tüm testler geçti");
