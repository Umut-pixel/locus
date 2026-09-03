import type { Arac, Durak } from "./atama";
import {
  PALET_CUVAL,
  paletGozu,
  paletlereYerlestir,
  type PaletSlotu,
} from "./palet";

function fail(msg: string): never {
  throw new Error(msg);
}

function yakin(a: number, b: number, mesaj: string): void {
  if (Math.abs(a - b) > 0.01) fail(`${mesaj}: beklenen ~${b}, gelen ${a}`);
}

type TestArac = Arac & { paletKapasite?: number | null };

const ISUZU3D: TestArac = {
  kod: "isuzu3d", ad: "Isuzu 3D", cuvalKapasite: 480, maxKg: 8800,
  maxKgTeyitli: true, ehliyetSinifi: "C", takograf: true, paletKapasite: 8,
};
const TRANSIT: TestArac = {
  kod: "transit", ad: "Ford Transit", cuvalKapasite: 180, maxKg: 2000,
  maxKgTeyitli: true, ehliyetSinifi: "B", takograf: false, paletKapasite: 3,
};
const KANGOO: TestArac = {
  kod: "kangoo", ad: "Renault Kangoo", cuvalKapasite: 60, maxKg: 800,
  maxKgTeyitli: true, ehliyetSinifi: "B", takograf: false, paletKapasite: 1,
};

function durak(kod: string, cuval: number, kg = cuval * 14.56): Durak {
  return {
    musteriKodu: kod, unvan: kod, lat: 38.3, lon: 27.2,
    kg, cuvalEsdeger: cuval, olcusuzSatir: 0,
  };
}

const dolu = (s: PaletSlotu[]) => s.filter((x) => x.doluCuval > 0);
const toplamCuval = (s: PaletSlotu[]) => s.reduce((t, x) => t + x.doluCuval, 0);

// ---------------------------------------------------------------------------
// Göz sayısı ve ızgara düzeni
// ---------------------------------------------------------------------------
{
  if (paletGozu(ISUZU3D) !== 8) fail("Isuzu 3D 8 palet gözü");
  if (paletGozu(TRANSIT) !== 3) fail("Transit 3 palet gözü");
  if (paletGozu(KANGOO) !== 1) fail("Kangoo 1 palet gözü");

  // paletKapasite yoksa çuval kapasitesinden türetilmeli (480/60 = 8)
  const paletsiz: TestArac = { ...ISUZU3D, paletKapasite: null };
  if (paletGozu(paletsiz) !== 8) {
    fail("palet kapasitesi yoksa çuvaldan türetilmeli");
  }

  const y8 = paletlereYerlestir([], ISUZU3D);
  if (y8.slotlar.length !== 8) fail("8 slot olmalı");
  if (y8.satirSayisi !== 2) fail("8 palet iki sıra çizilmeli");
  if (y8.slotlar[0]!.etiket !== "A1") {
    fail(`ilk etiket A1 olmalı, gelen ${y8.slotlar[0]!.etiket}`);
  }
  if (y8.slotlar[4]!.etiket !== "B1") {
    fail(`5. göz B1 olmalı, gelen ${y8.slotlar[4]!.etiket}`);
  }

  const y3 = paletlereYerlestir([], TRANSIT);
  if (y3.satirSayisi !== 1) fail("3 palet tek sıra çizilmeli");
  if (y3.slotlar.map((s) => s.etiket).join() !== "A1,A2,A3") {
    fail("3 palet A1,A2,A3 olmalı");
  }
}
console.log("palet: göz sayısı + ızgara düzeni ok");

// ---------------------------------------------------------------------------
// Tam palet — karışık değil
// ---------------------------------------------------------------------------
{
  const y = paletlereYerlestir([durak("A", 60)], ISUZU3D);
  if (dolu(y.slotlar).length !== 1) fail("60 çuval tek slotu doldurmalı");
  yakin(y.slotlar[0]!.doluCuval, 60, "ilk slot");
  if (y.slotlar[0]!.karisik) fail("tek müşteri karışık sayılmamalı");
  if (y.karisikSayisi !== 0) fail("karışık palet olmamalı");
  if (y.tasanCuval !== 0) fail("taşma olmamalı");
}
console.log("palet: tam palet ok");

// ---------------------------------------------------------------------------
// Karışık palet ve sarkma
// ---------------------------------------------------------------------------
{
  // 30 + 40 = 70 çuval: A1 karışık (30+30), A2'ye 10 sarkar
  const y = paletlereYerlestir([durak("A", 30), durak("B", 40)], ISUZU3D);

  yakin(y.slotlar[0]!.doluCuval, 60, "A1 dolmalı");
  yakin(y.slotlar[1]!.doluCuval, 10, "A2 sarkması");
  if (!y.slotlar[0]!.karisik) fail("A1 iki müşteri taşıyor, karışık olmalı");
  if (y.slotlar[1]!.karisik) fail("A2 tek müşteri, karışık olmamalı");
  if (y.karisikSayisi !== 1) fail(`karışık sayısı 1 olmalı, gelen ${y.karisikSayisi}`);

  // Paylar çuvalla orantılı bölünmeli
  const bPayi = y.slotlar[0]!.duraklar.find((d) => d.musteriKodu === "B")!;
  yakin(bPayi.cuval, 30, "B payının çuvalı");
  yakin(bPayi.kg, 40 * 14.56 * (30 / 40), "B payının kg orantısı");

  yakin(toplamCuval(y.slotlar), 70, "toplam çuval korunmalı");
}
console.log("palet: karışık palet + sarkma ok");

// ---------------------------------------------------------------------------
// Tek müşteri birden çok palete yayılıyor — hiçbiri karışık değil
// ---------------------------------------------------------------------------
{
  const y = paletlereYerlestir([durak("DEV", 170)], ISUZU3D);
  const doluSlotlar = dolu(y.slotlar);
  if (doluSlotlar.length !== 3) {
    fail(`170 çuval 3 slota yayılmalı, gelen ${doluSlotlar.length}`);
  }
  yakin(doluSlotlar[2]!.doluCuval, 50, "üçüncü slotta kalan");
  if (doluSlotlar.some((s) => s.karisik)) {
    fail("tek müşteri hiçbir slotu karışık yapmamalı");
  }
  yakin(toplamCuval(y.slotlar), 170, "toplam çuval korunmalı");
}
console.log("palet: çok palete yayılan durak ok");

// ---------------------------------------------------------------------------
// Ağırlık kilidi — kasada yer var, ruhsatta yok
// ---------------------------------------------------------------------------
{
  // Transit: 3 palet gözü ama 2.000 kg. 14,56 kg/çuval ile ~137 çuval = 2,3
  // palet; A3 (120. çuvaldan başlar) hâlâ erişilebilir.
  const bos = paletlereYerlestir([], TRANSIT);
  if (bos.slotlar[0]!.agirlikKilitli) fail("ilk göz asla kilitli olmamalı");
  if (bos.slotlar[2]!.agirlikKilitli) {
    fail("boş Transit'te A3, 137 çuval sınırının altında kalır");
  }

  // Yük ağırlaşırsa (20 kg/çuval) sınır 100 çuvala düşer, A3 kilitlenir
  const agir = paletlereYerlestir([durak("AGIR", 60, 60 * 20)], TRANSIT);
  if (agir.slotlar[0]!.agirlikKilitli) fail("A1 kilitli olmamalı");
  if (!agir.slotlar[2]!.agirlikKilitli) {
    fail("20 kg/çuval yükte 2.000 kg 100 çuvalda biter, A3 kilitli olmalı");
  }

  // İstiap tanımsızsa hiçbir göz kilitlenmemeli
  const limitsiz = paletlereYerlestir([durak("A", 60)], { ...TRANSIT, maxKg: null });
  if (limitsiz.slotlar.some((s) => s.agirlikKilitli)) {
    fail("maxKg null iken ağırlık kilidi olmamalı");
  }
}
console.log("palet: ağırlık kilidi ok");

// ---------------------------------------------------------------------------
// Kapasite aşımı ve ölçüsüz kalem
// ---------------------------------------------------------------------------
{
  // Kangoo tek palet: 100 çuval yüklenirse 40 taşar
  const y = paletlereYerlestir([durak("A", 100)], KANGOO);
  if (y.slotlar.length !== 1) fail("Kangoo tek slot");
  yakin(y.slotlar[0]!.doluCuval, 60, "slot 60 çuvalda durmalı");
  yakin(y.tasanCuval, 40, "taşan çuval");

  // Ölçüsü sıfır kalem (boş palet / POP) yer kaplamamalı ama görünmeli
  const olcusuz = paletlereYerlestir(
    [durak("PALET", 0, 0), durak("A", 30)],
    ISUZU3D
  );
  yakin(toplamCuval(olcusuz.slotlar), 30, "sıfır çuvallı kalem yer kaplamamalı");
  const gorunuyor = olcusuz.slotlar[0]!.duraklar.some(
    (d) => d.musteriKodu === "PALET"
  );
  if (!gorunuyor) fail("sıfır çuvallı kalem yine de slotta görünmeli");
}
console.log("palet: taşma + ölçüsüz kalem ok");

// ---------------------------------------------------------------------------
// Slot sayısı hiçbir koşulda palet kapasitesini aşmaz
// ---------------------------------------------------------------------------
{
  for (const arac of [KANGOO, TRANSIT, ISUZU3D]) {
    const cok = Array.from({ length: 30 }, (_, i) => durak(`M${i}`, 25));
    const y = paletlereYerlestir(cok, arac);
    if (y.slotlar.length !== paletGozu(arac)) {
      fail(`${arac.ad}: slot sayısı ${y.slotlar.length}, olmalı ${paletGozu(arac)}`);
    }
    if (y.slotlar.some((s) => s.doluCuval > PALET_CUVAL + 0.01)) {
      fail(`${arac.ad}: bir slot 60 çuvalı aştı`);
    }
    yakin(
      toplamCuval(y.slotlar) + y.tasanCuval,
      30 * 25,
      `${arac.ad}: çuval korunumu`
    );
  }
}
console.log("palet: kapasite sınırı + çuval korunumu ok");
