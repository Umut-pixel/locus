/**
 * `backend/n8n/google-places-prospecting (1).json` regresyon testi.
 *
 * Workflow n8n arayüzünde düzenlenip repoya yeniden export ediliyor; bu
 * dosya export'un iki kritik özelliğini koruyor:
 *
 *  1. **Cron eşdeğerliği.** Webhook tetiği eklendiğinde `Config` düğümü
 *     sabit değerler yerine `{{ $json.X || varsayılan }}` ifadelerine geçti.
 *     Cron/manuel yolda `$json` boş olduğu için sonuç eskisiyle bit-bit aynı
 *     olmalı — biri varsayılanı düşürürse haftalık tarama sessizce tüm
 *     ülkeyi yeni ayarlarla tarar.
 *  2. **İl filtresi + maxCells sigortası.** `Build Nearby Cells` tek ilin
 *     ilçelerini seçiyor ve hücre bütçesini ilçe granülaritesinde kesiyor.
 *     Hücresi üretilmeyen ilçe `scannedDistricts`'e girmemeli, yoksa
 *     taranmadan `son_tarama` yazılır ve 25 gün kilitlenir.
 *
 * n8n çalıştırmadan, düğümlerin JS'ini sahte bir bağlamda koşturur.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WF_YOL = join(process.cwd(), "..", "backend", "n8n", "google-places-prospecting (1).json");

type Node = {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
};

const doc = JSON.parse(readFileSync(WF_YOL, "utf8")) as {
  nodes: Node[];
  connections: Record<string, { main: { node: string }[][] }>;
};

function dugum(ad: string): Node {
  const n = doc.nodes.find((x) => x.name === ad);
  if (!n) throw new Error(`düğüm yok: ${ad}`);
  return n;
}

function kod(ad: string): string {
  return (dugum(ad).parameters as { jsCode: string }).jsCode;
}

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

function atar(fn: () => void, msg: string): void {
  try {
    fn();
  } catch {
    return;
  }
  fail(`${msg}: fırlatmadı`);
}

// --- Faz 0 düzeltmeleri kalıcı mı ------------------------------------------
{
  const url = (dugum("Fetch Ilce Merkezleri").parameters as { url: string }).url;
  dogru(url.includes("limit=2000"), "Fetch Ilce Merkezleri limit=2000 olmalı (TR'de ~973 ilçe)");
  dogru(
    kod("Expand Ilce Rows").includes("rows.length < 900"),
    "Expand Ilce Rows tabanı 900 olmalı — sessiz veri kaybının tek tripwire'ı"
  );
  dogru(
    /staticData\.placesApiErrors\s*=\s*\[\]/.test(kod("Reset Static Accumulator")),
    "placesApiErrors her koşuda sıfırlanmalı: kümülatif kalırsa 429 alan ilçeye bir daha son_tarama yazılmaz"
  );
}
console.log("faz-0 düzeltmeleri ok");

// --- Config: cron yolu bit-bit aynı ----------------------------------------
{
  const atamalar = (
    dugum("Config").parameters as {
      assignments: { assignments: { name: string; value: string }[] };
    }
  ).assignments.assignments;

  const bul = (ad: string) => {
    const a = atamalar.find((x) => x.name === ad);
    if (!a) fail(`Config'te ${ad} ataması yok`);
    return a.value;
  };
  const degerlendir = (v: string, $json: Record<string, unknown>) => {
    const ifade = String(v).replace(/^=\{\{\s*/, "").replace(/\s*\}\}$/, "");
    return new Function("$json", `return (${ifade});`)($json);
  };

  // cron / manuel tetikte $json boş
  esit(degerlendir(bul("il"), {}), "", "cron: il filtresi boş");
  esit(degerlendir(bul("runId"), {}), "", "cron: runId boş (PATCH yok)");
  esit(degerlendir(bul("skipDays"), {}), "25", "cron: skipDays eski sabitle aynı");
  esit(degerlendir(bul("maxCells"), {}), 600, "cron: maxCells varsayılanı");

  // webhook yolunda Guard çıktısı taşınıyor
  const g = { il: "İzmir", runId: "r-1", skipDays: "99999", maxCells: 42 };
  esit(degerlendir(bul("il"), g), "İzmir", "webhook: il");
  esit(degerlendir(bul("runId"), g), "r-1", "webhook: runId");
  esit(degerlendir(bul("skipDays"), g), "99999", "webhook: skipDays");
  esit(degerlendir(bul("maxCells"), g), 42, "webhook: maxCells");
}
console.log("Config cron eşdeğerliği ok");

// --- Guard Tarama Secret ---------------------------------------------------
{
  const guard = kod("Guard Tarama Secret");
  const calistir = (
    item: unknown,
    vars: Record<string, string> = {},
    env: Record<string, string> = {}
  ) =>
    new Function("$input", "$vars", "$env", guard)(
      { first: () => item },
      vars,
      env
    ) as { json: Record<string, unknown> }[];

  const SIR = "test-sirri";
  const govde = { runId: "r-1", il: "İzmir", plaka: 35, skipDays: "25", maxCells: 600 };
  const vars = { POTANSIYEL_TARAMA_SECRET: SIR };

  const out = calistir(
    { json: { headers: { "x-n8n-sync-secret": SIR }, body: govde, query: {} } },
    vars
  );
  esit(out[0]!.json.il, "İzmir", "guard: il");
  esit(out[0]!.json.plaka, 35, "guard: plaka");
  esit(out[0]!.json.runId, "r-1", "guard: runId");

  // başlık adı büyük/küçük harf duyarsız + Bearer kabul
  esit(
    calistir({ json: { headers: { "X-N8N-Sync-Secret": SIR }, body: govde, query: {} } }, vars)[0]!
      .json.il,
    "İzmir",
    "guard: başlık adı case-insensitive"
  );
  esit(
    calistir(
      { json: { headers: { Authorization: `Bearer ${SIR}` }, body: govde, query: {} } },
      vars
    )[0]!.json.il,
    "İzmir",
    "guard: Bearer"
  );
  // $env yedeği
  esit(
    calistir({ json: { headers: { "x-n8n-sync-secret": SIR }, body: govde, query: {} } }, {}, {
      N8N_POTANSIYEL_TARAMA_WEBHOOK_SECRET: SIR,
    })[0]!.json.il,
    "İzmir",
    "guard: $env yedeği"
  );
  // GET yedeği gövde taşımaz
  const q = calistir(
    {
      json: {
        headers: { "x-n8n-sync-secret": SIR },
        body: {},
        query: { runId: "r-2", il: "Uşak", plaka: "64", skipDays: "99999" },
      },
    },
    vars
  );
  esit(q[0]!.json.il, "Uşak", "guard: query yolu");
  esit(q[0]!.json.plaka, 64, "guard: query plaka string→number");

  atar(
    () =>
      calistir({ json: { headers: { "x-n8n-sync-secret": "yanlış" }, body: govde, query: {} } }, vars),
    "guard: yanlış sır"
  );
  atar(() => calistir({ json: { headers: {}, body: govde, query: {} } }), "guard: sırsız çağrı");
  atar(
    () => calistir({ json: { headers: { "x-n8n-sync-secret": SIR }, body: {}, query: {} } }, vars),
    "guard: il eksik — tüm ülkeyi taramaktansa dur"
  );
}
console.log("Guard Tarama Secret ok");

// --- Build Nearby Cells: il filtresi + maxCells -----------------------------
type IlceSatiri = {
  il: string;
  ilce: string;
  lat: number | null;
  lon: number;
  son_tarama: string | null;
  "yoğun_bolge": boolean;
};

function fixtures(sonTarama: string | null = null): IlceSatiri[] {
  const iller: Record<string, [number, number]> = {
    // il -> [toplam ilçe, yoğun ilçe] (canlı dağılıma yakın)
    "İzmir": [30, 21],
    "Manisa": [17, 6],
    "Uşak": [6, 2],
  };
  const rows: IlceSatiri[] = [];
  for (const [il, [toplam, yogun]] of Object.entries(iller)) {
    for (let i = 0; i < toplam!; i++) {
      rows.push({
        il,
        ilce: `${il}-${i}`,
        lat: 38 + i * 0.01,
        lon: 27 + i * 0.01,
        son_tarama: sonTarama,
        "yoğun_bolge": i < yogun!,
      });
    }
  }
  return rows;
}

function hucreKur(cfg: Record<string, unknown>, rows: IlceSatiri[]) {
  const staticData: Record<string, unknown> = {};
  const fn = new Function("$", "$input", "$getWorkflowStaticData", kod("Build Nearby Cells"));
  const out = fn(
    (ad: string) => {
      if (ad !== "Config") throw new Error(`beklenmeyen düğüm: ${ad}`);
      return { first: () => ({ json: cfg }) };
    },
    { all: () => rows.map((r) => ({ json: r })) },
    () => staticData
  ) as { json: Record<string, unknown> }[];
  return { out, staticData };
}

{
  const rows = fixtures();
  const toplamHucre = 21 * 4 + 9 + (6 * 4 + 11) + (2 * 4 + 4); // 93 + 35 + 12

  // cron: filtre yok
  const cron = hucreKur({ skipDays: "25", il: "", runId: "", maxCells: 600 }, rows);
  esit(cron.out.length, toplamHucre, "cron: tüm iller kurulmalı");
  esit(cron.staticData.queuedDistrictCount, rows.length, "cron: tüm ilçeler kuyrukta");
  esit(cron.staticData.ilFiltresi, null, "cron: il filtresi yok");

  // tek il
  const izmir = hucreKur({ skipDays: "25", il: "İzmir", maxCells: 600 }, rows);
  esit(izmir.out.length, 93, "İzmir: 21*4 + 9");
  esit(izmir.staticData.queuedDistrictCount, 30, "İzmir: 30 ilçe");
  esit(
    [...new Set(izmir.out.map((c) => c.json.il))],
    ["İzmir"],
    "İzmir: başka il sızmamalı"
  );

  // Türkçe katlama — iller.ts ilAnahtar() ile aynı algoritma olmalı
  for (const yazim of ["IZMIR", "izmir", " İZMİR "]) {
    esit(hucreKur({ skipDays: "25", il: yazim, maxCells: 600 }, rows).out.length, 93, `katlama: ${yazim}`);
  }

  // maxCells: ilçe granülaritesinde kesmeli
  const kesik = hucreKur({ skipDays: "25", il: "İzmir", maxCells: 50 }, rows);
  dogru(kesik.out.length <= 50, `maxCells aşıldı: ${kesik.out.length}`);
  const uretilen = new Set(kesik.out.map((c) => c.json.ilce));
  esit(kesik.staticData.queuedDistrictCount, uretilen.size, "kesilen ilçe scannedDistricts'e girmemeli");
  esit(
    (kesik.staticData.atlananIlceSayisi as number) + (kesik.staticData.queuedDistrictCount as number),
    30,
    "atlanan + taranan = toplam"
  );
  const scanned = (kesik.staticData.scannedDistricts as { ilce: string }[]).map((d) => d.ilce);
  dogru(
    scanned.every((i) => uretilen.has(i)),
    "hücresi olmayan ilçeye son_tarama yazılamamalı"
  );

  // skipDays: sıfır maliyetli uçtan uca testin dayandığı yol
  const taze = hucreKur(
    { skipDays: "99999", il: "İzmir", maxCells: 600 },
    fixtures(new Date(Date.now() - 40 * 864e5).toISOString())
  );
  esit(taze.out.length, 1, "hepsi taze: tek item");
  esit(taze.out[0]!.json.skipAll, true, "hepsi taze: skipAll");

  // kapsam dışı il
  const yok = hucreKur({ skipDays: "25", il: "İstanbul", maxCells: 600 }, rows);
  esit(yok.out[0]!.json.skipAll, true, "kapsam dışı il: skipAll");
}
console.log("Build Nearby Cells ok");

// --- Bağlantı topolojisi ---------------------------------------------------
{
  const hedefler = (ad: string) =>
    (doc.connections[ad]?.main ?? []).map((grp) => grp.map((c) => c.node));

  esit(hedefler("Webhook Potansiyel Tarama"), [["Guard Tarama Secret"]], "webhook → guard");
  esit(hedefler("Guard Tarama Secret"), [["Config"]], "guard → Config");
  esit(hedefler("Summary"), [["Has Run Id?"]], "Summary → Has Run Id?");
  esit(hedefler("Has Run Id?"), [["Complete Tarama"], []], "runId varsa PATCH, yoksa uçta biter");

  // Complete Tarama ev desenini kullanmalı (sır JSON'a geri sızmasın)
  const ct = dugum("Complete Tarama").parameters as Record<string, string>;
  esit(ct.authentication, "predefinedCredentialType", "Complete Tarama: predefined credential");
  esit(ct.nodeCredentialType, "supabaseApi", "Complete Tarama: supabaseApi");
  dogru(ct.url.includes("$credentials.host"), "Complete Tarama: host credential'dan");
  dogru(ct.method === "PATCH", "Complete Tarama: PATCH");
}
console.log("bağlantı topolojisi ok");

// --- Sır sızıntısı ---------------------------------------------------------
{
  const ham = readFileSync(WF_YOL, "utf8");
  dogru(!/eyJhbGciO/.test(ham), "workflow JSON'ında JWT görünüyor — sır sızmış");
  dogru(!/REPLACE_ME/.test(ham), "yer tutucu sır kalmış");
}
console.log("sır sızıntısı yok");

console.log("TUM TESTLER GECTI");
