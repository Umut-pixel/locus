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
  // NOT İzmir kasıtlı: İzmir ilçeleri artık sabit RUT'lara düşüyor (aşağıda
  // ayrı test var) — bu test GENEL bant+açı adlandırma yolunu sınıyor.
  // Salihli'nin dört köşesi — sektör sınırına yayılsalar bile tek bölge.
  const salihli = [
    durak({ lat: 38.47, lon: 28.22, sehir: "MANİSA", ilce: "SALİHLİ" }),
    durak({ lat: 38.45, lon: 28.26, sehir: "MANİSA", ilce: "SALİHLİ" }),
    durak({ lat: 38.49, lon: 28.19, sehir: "MANİSA", ilce: "SALİHLİ" }),
    durak({ lat: 38.46, lon: 28.24, sehir: "MANİSA", ilce: "SALİHLİ" }),
  ];
  const digerleri = [
    durak({ lat: 38.16, lon: 27.36, sehir: "İZMİR", ilce: "TORBALI" }),
    durak({ lat: 37.85, lon: 27.84, sehir: "AYDIN", ilce: "MERKEZ" }),
  ];

  const bolgeler = bolgele([...salihli, ...digerleri], DEPO);
  const salihliKodlari = new Set(salihli.map((d) => d.musteriKodu));
  const tasiyan = bolgeler.filter((b) =>
    b.duraklar.some((d) => salihliKodlari.has(d.musteriKodu))
  );
  esit(tasiyan.length, 1, "Salihli tek bölgede");
  esit(
    tasiyan[0]!.duraklar.filter((d) => salihliKodlari.has(d.musteriKodu)).length,
    4,
    "Salihli'nin tüm durakları o bölgede"
  );
  // Bölge adı baskın şehir + yön taşımalı — ekranda okunabilir olmalı.
  dogru(
    tasiyan[0]!.ad.includes("Manisa"),
    `bölge adı baskın şehri taşımalı: ${tasiyan[0]!.ad}`
  );
  dogru(tasiyan[0]!.ilceler.includes("Salihli"), "ilçe listesi dolmalı");
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


// ---------------------------------------------------------------------------
// REGRESYON — bölge adı iki kez listelenmemeli
// ---------------------------------------------------------------------------
// Sahada "İzmir — Batı" iki ayrı satır olarak çıktı. Sebep: ad, bölge
// MERKEZİNDEN 45°'lik pusulaya yuvarlanıyordu; şehir içi sektörleri ise 60°.
// İki komşu sektörün merkezi (175° ve 185°) aynı ada yuvarlanabiliyordu.
// Ad artık SEKTÖRÜN ORTASINDAN türüyor — aynı bantta çakışma imkânsız.
{
  const duraklar = [
    // Depodan ~175° (sektör 2) — eski kuralda "Batı"
    durak({ lat: 38.314, lon: 26.841, sehir: "İZMİR", ilce: "URLA", musteriKodu: "S2" }),
    // Depodan ~185° (sektör 3) — eski kuralda yine "Batı"
    durak({ lat: 38.262, lon: 26.841, sehir: "İZMİR", ilce: "SEFERIHISAR", musteriKodu: "S3" }),
  ];

  // Birleştirme kapalı: iki bölge ayrı kalsın, ad çakışması görünsün.
  const bolgeler = bolgele(duraklar, DEPO);
  esit(bolgeler.length, 2, "iki ayrı sektör iki bölge");

  const adlar = bolgeler.map((b) => b.ad);
  esit(new Set(adlar).size, adlar.length, `bölge adları benzersiz olmalı: ${adlar.join(" | ")}`);
  // Kodlar da ayrı olmalı — React anahtarı ve açılır satır bunu kullanıyor.
  const kodlar = bolgeler.map((b) => b.kod);
  esit(new Set(kodlar).size, kodlar.length, "bölge kodları benzersiz");
}
console.log("bolgele: ad çakışması yok ok");


// ---------------------------------------------------------------------------
// Bölge sabitleme (günlük pin)
// ---------------------------------------------------------------------------
{
  // İki ayrı bölge: İzmir içi (yakın) ve Muğla (orta).
  const izmir = Array.from({ length: 3 }, (_, i) =>
    durak({
      lat: 38.46 + i * 0.002, lon: 27.22, sehir: "İZMİR", ilce: "BORNOVA",
      cuvalEsdeger: 20, kg: 250, musteriKodu: `IZ${i}`,
    })
  );
  const mugla = Array.from({ length: 2 }, (_, i) =>
    durak({
      lat: 37.21 + i * 0.002, lon: 28.36, sehir: "MUĞLA", ilce: "MERKEZ",
      cuvalEsdeger: 20, kg: 250, musteriKodu: `MU${i}`,
    })
  );
  const duraklar = [...izmir, ...mugla];
  const filo = [TRANSIT, NPR10, ISUZU3D];

  const bolgeler = bolgele(duraklar, DEPO);
  const izmirBolge = bolgeler.find((b) =>
    b.duraklar.some((d) => d.musteriKodu === "IZ0")
  )!;
  dogru(izmirBolge != null, "İzmir bölgesi bulunmalı");

  // Sabitlemesiz sonuç referans alınıyor.
  const serbest = bolgeAta(duraklar, filo, DEPO);
  const serbestIzmirArac = aracinKodu(serbest, "IZ0");

  // Aynı bölge ISUZU3D'ye sabitlenince oraya gitmeli.
  const sabit = bolgeAta(duraklar, filo, DEPO, filo, {
    sabitlemeler: { [izmirBolge.kod]: "isuzu3d" },
  });
  esit(aracinKodu(sabit, "IZ0"), "isuzu3d", "sabitlenen bölge o araca gider");
  for (const d of izmirBolge.duraklar) {
    esit(
      aracinKodu(sabit, d.musteriKodu),
      "isuzu3d",
      `${d.musteriKodu} sabitlenen araçta`
    );
  }
  // Muğla sabitlenmedi — başka bir araca gitmeli.
  dogru(
    aracinKodu(sabit, "MU0") !== "isuzu3d",
    "sabitlenmeyen bölge rezerve araca binmemeli"
  );
  esit(sabit.yerlesmeyen.length, 0, "sabitleme durak düşürmemeli");
  for (const y of sabit.yukler) {
    dogru(!y.doluluk.asim, `${y.arac.kod} aşmamalı`);
  }
  // Referans: sabitleme gerçekten bir şey değiştirdi mi (test anlamlı mı).
  dogru(
    serbestIzmirArac !== "isuzu3d",
    "sabitlemesiz halde İzmir zaten isuzu3d'de olmamalı — yoksa test hiçbir şey ölçmez"
  );
}
console.log("bolgeAta: sabitlenen bölge o araca gidiyor ok");

{
  // Sabitlenen bölge araca sığmıyor: sığan kısmı gider, kalanı başka araca.
  const agir = Array.from({ length: 4 }, (_, i) =>
    durak({
      lat: 38.46 + i * 0.002, lon: 27.22, sehir: "İZMİR", ilce: "BORNOVA",
      cuvalEsdeger: 50, kg: 600, musteriKodu: `A${i}`,
    })
  );
  const bolgeler = bolgele(agir, DEPO);
  esit(bolgeler.length, 1, "tek bölge");

  // 200 çuval Kangoo'ya (60) sığmaz.
  const sonuc = bolgeAta(agir, [KANGOO, ISUZU3D], DEPO, [KANGOO, ISUZU3D], {
    sabitlemeler: { [bolgeler[0]!.kod]: "kangoo" },
  });
  const d = dagilim(sonuc);
  dogru(d.kangoo!.length > 0, "sığan kısım sabitlenen araca gider");
  dogru(d.isuzu3d!.length > 0, "kalan başka araca geçer");
  esit(d.kangoo!.length + d.isuzu3d!.length, 4, "durak düşmemeli");
  for (const y of sonuc.yukler) {
    dogru(!y.doluluk.asim, `${y.arac.kod} aşmamalı`);
  }

  // Filoda olmayan araca sabitleme ve geçersiz bölge kodu sessizce yok sayılır.
  const gecersiz = bolgeAta(agir, [ISUZU3D], DEPO, [ISUZU3D], {
    sabitlemeler: { "yok-boyle-bir-bolge": "isuzu3d", [bolgeler[0]!.kod]: "npr10" },
  });
  esit(gecersiz.yerlesmeyen.length, 0, "geçersiz sabitleme planı bozmamalı");
  esit(dagilim(gecersiz).isuzu3d!.length, 4, "normal akışla yerleşmeli");
}
console.log("bolgeAta: sabitleme taşması ve geçersiz sabitleme ok");

// ---------------------------------------------------------------------------
// İzmir iç rutları — 30 ilçenin tamamı 6 sabit rutta, kayıp yok
// ---------------------------------------------------------------------------
// Melih'in tarif ettiği rutlar (2026-09-11): genel bant+açı-sektörü
// kümelemesi depoya kuş uçuşu mesafe/açı bakıyordu, gerçek yol ağını değil.
{
  const ILCELER: [string, number, number][] = [
    ["Aliağa", 38.7999, 26.9714], ["Balçova", 38.3844, 27.0511],
    ["Bayındır", 38.2214, 27.6469], ["Bayraklı", 38.4636, 27.1608],
    ["Bergama", 39.1189, 27.1789], ["Beydağ", 38.0997, 28.2308],
    ["Bornova", 38.4692, 27.2214], ["Buca", 38.3789, 27.1728],
    ["Çeşme", 38.3239, 26.3061], ["Çiğli", 38.4953, 27.0653],
    ["Dikili", 39.0700, 26.8858], ["Foça", 38.6714, 26.7561],
    ["Gaziemir", 38.3225, 27.1306], ["Güzelbahçe", 38.3733, 26.8931],
    ["Karabağlar", 38.3667, 27.1211], ["Karaburun", 38.6414, 26.5164],
    ["Karşıyaka", 38.4600, 27.1108], ["Kemalpaşa", 38.4256, 27.4183],
    ["Kınık", 38.7550, 27.3861], ["Kiraz", 38.2361, 28.2119],
    ["Konak", 38.4189, 27.1289], ["Menderes", 38.2531, 27.1339],
    ["Menemen", 38.6058, 27.0653], ["Narlıdere", 38.3897, 26.9247],
    ["Ödemiş", 38.2233, 27.9722], ["Seferihisar", 38.1961, 26.8339],
    ["Selçuk", 37.9500, 27.3667], ["Tire", 38.0906, 27.7325],
    ["Torbalı", 38.1611, 27.3611], ["Urla", 38.3239, 26.7658],
  ];
  const duraklar = ILCELER.map(([ilce, lat, lon]) =>
    durak({ lat, lon, sehir: "İZMİR", ilce, musteriKodu: ilce })
  );

  const bolgeler = bolgele(duraklar, DEPO);
  esit(bolgeler.length, 6, "30 İzmir ilçesi tam 6 rutta toplanmalı");

  const toplamDurak = bolgeler.reduce((t, b) => t + b.duraklar.length, 0);
  esit(toplamDurak, 30, "hiçbir ilçe kaybolmamalı");

  const adlar = bolgeler.map((b) => b.ad).sort();
  esit(
    adlar,
    [
      "RUT 1 — Kuzey", "RUT 2 — Kuzey/Merkez", "RUT 3 — Küçük Menderes",
      "RUT 4 — Güney", "RUT 5 — Yarımada", "RUT 6 — Merkez",
    ].sort(),
    "rut adları sabit olmalı"
  );

  const rut3 = bolgeler.find((b) => b.ad === "RUT 3 — Küçük Menderes")!;
  dogru(
    rut3.ilceler.includes("Beydağ") && rut3.ilceler.includes("Kiraz"),
    "Beydağ ve Kiraz Küçük Menderes rutunda kalmalı — batıya dağıtmak ekstra km yaratır"
  );

  // Aynı ilçe farklı yazımlarla gelirse (Panorama verisi tutarsız olabilir)
  // yine de AYNI ruta düşmeli — bkz. anahtar() Türkçe İ/ı/i/I düzeltmesi.
  const yaziVaryasyonlari = bolgele(
    [
      durak({ lat: 38.47, lon: 27.22, sehir: "İZMİR", ilce: "BORNOVA", musteriKodu: "V1" }),
      durak({ lat: 38.46, lon: 27.21, sehir: "İzmir", ilce: "Bornova", musteriKodu: "V2" }),
      durak({ lat: 38.45, lon: 27.20, sehir: "izmir", ilce: "bornova", musteriKodu: "V3" }),
    ],
    DEPO
  );
  esit(yaziVaryasyonlari.length, 1, "farklı yazımlar aynı rutta birleşmeli");
  esit(yaziVaryasyonlari[0]!.duraklar.length, 3, "üç yazım da yerleşmeli");
}
console.log("bolgele: İzmir rutları tam kapsıyor ok");

// ---------------------------------------------------------------------------
// RUT bölgeleri küçük-bölge birleştirmesinden ETKİLENMEMELİ
// ---------------------------------------------------------------------------
// Rutlar elle kurulmuş sabit gruplar; otomatik "küçük bölgeyi komşusuna kat"
// mantığı onları başka bir rutla ya da genel bölgeyle sessizce karıştırmamalı.
{
  // Tek başına çok küçük bir RUT 1 yükü (5 çuval) + hemen yanında (açıca
  // yakın) genel bir bölge — birleştirme eşiği yüksek tutulup RUT'un adının/
  // kimliğinin değişmediği doğrulanıyor.
  const kucukRut1 = durak({
    lat: 38.80, lon: 26.97, sehir: "İZMİR", ilce: "ALİAĞA",
    cuvalEsdeger: 5, musteriKodu: "RUT1-KUCUK",
  });
  const yakinGenel = durak({
    lat: 38.75, lon: 26.90, sehir: "MANİSA", ilce: "MERKEZ",
    cuvalEsdeger: 5, musteriKodu: "GENEL-KUCUK",
  });

  const bolgeler = bolgele([kucukRut1, yakinGenel], DEPO, {
    birlestirmeEsigiCuval: 1000, // her ikisi de kesinlikle eşiğin altında
  });

  const rut1 = bolgeler.find((b) => b.ad.startsWith("RUT 1"));
  dogru(rut1 != null, "RUT 1 bölgesi hâlâ ayrı durmalı");
  esit(rut1!.duraklar.length, 1, "RUT 1'e komşu genel bölge katılmamalı");
  dogru(
    !bolgeler.some((b) => b.ad.startsWith("RUT") && b.ilceler.includes("Merkez")),
    "genel bölge bir RUT'un içine katılmamalı"
  );
}
console.log("bolgele: RUT bölgeleri küçük-bölge birleştirmesinden bağışık ok");

console.log("bolge: tüm testler geçti");
