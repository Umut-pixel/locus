import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  CEKIRDEK_PLAKALAR,
  gecerliPlaka,
  IL_LISTESI,
  ilAdi,
  ilAnahtar,
  plakaBul,
} from "./iller";
import { cagriTahmini, istanbulGunSonuIso, kalanSureMetni } from "./potansiyel-tarama";

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

// --- Kanonik liste ---------------------------------------------------------
{
  esit(IL_LISTESI.length, 81, "81 il");
  const plakalar = IL_LISTESI.map((i) => i.plaka);
  esit(new Set(plakalar).size, 81, "plakalar tekil");
  esit(Math.min(...plakalar), 1, "en kucuk plaka");
  esit(Math.max(...plakalar), 81, "en buyuk plaka");
  esit(new Set(IL_LISTESI.map((i) => i.ad)).size, 81, "il adlari tekil");
  esit(new Set(IL_LISTESI.map((i) => ilAnahtar(i.ad))).size, 81, "katlanmis adlar da tekil");
}
console.log("IL_LISTESI ok");

// --- Türkçe İ/I katlaması --------------------------------------------------
// Bu sinifin hatasi n8n'e ulasirsa tarama sessizce SIFIR ilce bulur.
{
  esit(plakaBul("İzmir"), 35, "kanonik yazim");
  esit(plakaBul("IZMIR"), 35, "ASCII buyuk harf");
  esit(plakaBul("izmir"), 35, "ASCII kucuk harf");
  esit(plakaBul("  İZMİR  "), 35, "bosluklu TR buyuk harf");
  esit(plakaBul("Muğla"), 48, "yumusak g");
  esit(plakaBul("mugla"), null, "g yerine g yazimi ESLESMEZ (bilincli)");
  esit(plakaBul("Şanlıurfa"), 63, "s ve i");
  esit(plakaBul("Hakkâri"), 30, "sapkali a");
  esit(plakaBul("Hakkari"), 30, "sapkasiz a");
  esit(plakaBul("Yok Böyle Bir İl"), null, "bilinmeyen il");
}
console.log("plakaBul / ilAnahtar ok");

// --- ilAdi / gecerliPlaka --------------------------------------------------
{
  esit(ilAdi(35), "İzmir", "35 -> Izmir");
  esit(ilAdi(64), "Uşak", "64 -> Usak");
  esit(ilAdi(0), null, "0 gecersiz");
  esit(ilAdi(82), null, "82 gecersiz");
  dogru(gecerliPlaka(1) && gecerliPlaka(81), "sinirlar gecerli");
  dogru(!gecerliPlaka(0) && !gecerliPlaka(82), "sinir disi gecersiz");
  dogru(!gecerliPlaka(35.5), "ondalik gecersiz");
  dogru(!gecerliPlaka("35" as unknown), "string gecersiz");
}
console.log("ilAdi / gecerliPlaka ok");

// --- ilce_merkezleri.il ile birebir yazim ----------------------------------
// Canli DB'den (2026-09-14) dogrulanmis yazimlar. Bir harf kayarsa
// /api/potansiyel/tarama kapsam sorgusu 0 satir doner ve il "kapsam disi"
// gorunur; hata tamamen sessizdir, bu yuzden burada sabitlendi.
{
  const canli = ["Aydın", "Balıkesir", "Çanakkale", "Denizli", "İzmir", "Manisa", "Muğla", "Uşak"];
  const cekirdekAdlari = CEKIRDEK_PLAKALAR.map((p) => ilAdi(p)!).sort((a, b) =>
    a.localeCompare(b, "tr")
  );
  esit(cekirdekAdlari, canli.sort((a, b) => a.localeCompare(b, "tr")), "cekirdek il adlari canli DB ile birebir");
}
console.log("ilce_merkezleri yazim ok");

// --- Yayinlanan GeoJSON artifact'i -----------------------------------------
{
  const yol = join(process.cwd(), "public", "veri", "turkiye-iller.geojson");
  const boyut = statSync(yol).size;
  dogru(boyut <= 250 * 1024, `GeoJSON 250 KB'i asmamali (${Math.round(boyut / 1024)} KB)`);

  const fc = JSON.parse(readFileSync(yol, "utf8")) as {
    attribution?: string;
    features: { id?: number; properties: { plaka: number; ad: string }; geometry: { type: string; coordinates: unknown } }[];
  };
  esit(fc.features.length, 81, "81 feature");
  dogru(
    typeof fc.attribution === "string" && /OpenStreetMap/i.test(fc.attribution),
    "atif satiri korunmali (CC BY-SA / OSM)"
  );

  const plakalar = fc.features.map((f) => f.properties.plaka);
  esit(new Set(plakalar).size, 81, "GeoJSON plakalari tekil");

  for (const f of fc.features) {
    const beklenen = ilAdi(f.properties.plaka);
    esit(f.properties.ad, beklenen, `plaka ${f.properties.plaka} adi kanonik listeyle ayni`);
    esit(f.id, f.properties.plaka, `feature.id = plaka (${f.properties.plaka})`);
    dogru(
      f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon",
      `plaka ${f.properties.plaka} geometri tipi poligon olmali`
    );
  }

  // Turkiye sinirlari icinde mi (kaba bbox): lon 25.5-45.0, lat 35.5-42.5
  const koordinatlar: number[][] = [];
  const topla = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      koordinatlar.push(c as number[]);
      return;
    }
    for (const alt of c) topla(alt);
  };
  for (const f of fc.features) topla(f.geometry.coordinates);
  dogru(koordinatlar.length > 5000, `nokta sayisi cok dusuk (${koordinatlar.length}) — asiri sadelestirme`);
  for (const [lon, lat] of koordinatlar) {
    dogru(lon! >= 25.5 && lon! <= 45.0, `lon Turkiye disinda: ${lon}`);
    dogru(lat! >= 35.5 && lat! <= 42.5, `lat Turkiye disinda: ${lat}`);
  }

  // Ege kiyisi asiri sadelestirilmis mi — kullanicinin calistigi bolge.
  for (const plaka of [35, 48]) {
    const f = fc.features.find((x) => x.properties.plaka === plaka)!;
    const say: number[] = [];
    const sayHelper = (c: unknown): void => {
      if (!Array.isArray(c)) return;
      if (typeof c[0] === "number") { say.push(1); return; }
      for (const alt of c) sayHelper(alt);
    };
    sayHelper(f.geometry.coordinates);
    dogru(say.length >= 150, `${f.properties.ad} kiyi detayi yetersiz (${say.length} nokta)`);
  }
}
console.log("turkiye-iller.geojson ok");

// --- Kota penceresi --------------------------------------------------------
// Turkiye 2016'dan beri kalici UTC+3; TR gece yarisi = 21:00 UTC.
{
  esit(
    istanbulGunSonuIso(new Date("2026-09-14T10:00:00Z")),
    "2026-09-14T21:00:00.000Z",
    "gun ortasi -> ayni gece"
  );
  esit(
    istanbulGunSonuIso(new Date("2026-09-14T21:00:00Z")),
    "2026-09-15T21:00:00.000Z",
    "TR gun donunce sonraki gece"
  );
  esit(
    istanbulGunSonuIso(new Date("2026-12-31T20:00:00Z")),
    "2026-12-31T21:00:00.000Z",
    "yil sinirini asar"
  );
  esit(kalanSureMetni("2026-09-14T21:00:00.000Z", new Date("2026-09-14T20:30:00Z")), "30 dakika", "dakika");
  esit(kalanSureMetni("2026-09-14T21:00:00.000Z", new Date("2026-09-14T18:00:00Z")), "3 saat", "tam saat");
  esit(kalanSureMetni("2026-09-14T21:00:00.000Z", new Date("2026-09-14T17:30:00Z")), "3 saat 30 dakika", "saat+dakika");
  esit(kalanSureMetni("2026-09-14T21:00:00.000Z", new Date("2026-09-14T22:00:00Z")), "birazdan", "gecmis damga");
}
console.log("kota penceresi ok");

// --- Çağrı tahmini ---------------------------------------------------------
// n8n Build Nearby Cells: yogun ilce 4 hucre + 3 Text, seyrek 1 hucre.
// Ust sinir her hucrenin iki pass derinlesmesi (1 + 4 + 16 = 21x).
{
  esit(cagriTahmini(9, 21), { alt: 93 + 63, ust: 93 * 21 + 63 }, "Izmir (30 ilce, 21 yogun)");
  esit(cagriTahmini(4, 2), { alt: 12 + 6, ust: 12 * 21 + 6 }, "Usak (6 ilce, 2 yogun)");
  esit(cagriTahmini(0, 0), { alt: 0, ust: 0 }, "taranacak ilce yok");
  // maxCells sigortasi alt siniri kirpar
  esit(cagriTahmini(0, 200, 600).alt, 600 + 600, "maxCells kirpmasi");
}
console.log("cagriTahmini ok");

console.log("TUM TESTLER GECTI");
