import { parseAgentContent } from "./agent-blocks";

function fail(msg: string): never {
  throw new Error(msg);
}

const md = `
\`\`\`locus
{"kind":"filter","filterKey":"band","filters":[{"key":"all","label":"Tümü"},{"key":"g56","label":"56+ gün"}],"columns":["Müşteri"],"rows":[{"Müşteri":"A","band":"g56"}]}
\`\`\`

\`\`\`locus
{"kind":"chart","variant":"line","series":[{"name":"Bornova","values":[1,2,3],"unit":"money"}]}
\`\`\`
`;

const blocks = parseAgentContent(md);
if (blocks.length !== 1 || blocks[0]?.type !== "filter") {
  fail(`expected coalesced filter, got ${JSON.stringify(blocks.map((b) => b.type))}`);
}
if (blocks[0].type === "filter" && blocks[0].chart?.variant !== "line") {
  fail("filter should carry the line chart");
}
console.log("coalesce ok");

const mapMd = `
\`\`\`locus
{"kind":"map","title":"27.08 turu","points":[{"lat":38.32,"lon":26.76,"label":"GAMZE","meta":"225 kg"},{"lat":999,"lon":1}]}
\`\`\`
`;
const mapBlocks = parseAgentContent(mapMd);
if (mapBlocks.length !== 1 || mapBlocks[0]?.type !== "map") {
  fail(`expected map block, got ${JSON.stringify(mapBlocks.map((b) => b.type))}`);
}
if (mapBlocks[0].type === "map") {
  if (mapBlocks[0].includeDepot !== true) fail("includeDepot should default true");
  if (mapBlocks[0].title !== "27.08 turu") fail("title mismatch");
  if (mapBlocks[0].points.length !== 1) fail("invalid point should be dropped");
  if (mapBlocks[0].points[0]?.label !== "GAMZE") fail("label mismatch");
}
console.log("map parse ok");

const noDepotMd = `
\`\`\`locus
{"kind":"map","includeDepot":false,"points":[{"lat":38.1,"lon":27.1,"label":"A"}]}
\`\`\`
`;
const noDepot = parseAgentContent(noDepotMd);
if (noDepot[0]?.type !== "map" || noDepot[0].includeDepot !== false) {
  fail("includeDepot false not honored");
}
console.log("includeDepot false ok");

const emptyNoDepot = parseAgentContent(
  "```locus\n{\"kind\":\"map\",\"includeDepot\":false,\"points\":[]}\n```"
);
if (emptyNoDepot.length !== 0) {
  fail("empty map without depot should drop");
}
console.log("empty drop ok");

const depotOnly = parseAgentContent(
  "```locus\n{\"kind\":\"map\",\"title\":\"Depo\"}\n```"
);
if (depotOnly[0]?.type !== "map" || depotOnly[0].points.length !== 0 || !depotOnly[0].includeDepot) {
  fail("depot-only map should parse");
}
console.log("depot-only ok");

const openFence = parseAgentContent("önce\n```locus\n{\"kind\":\"map\"", { streaming: true });
if (!openFence.some((b) => b.type === "pending")) {
  fail("open map fence should be pending while streaming");
}
console.log("streaming pending ok");

const haritaEylemi = parseAgentContent(
  '```locus\n{"kind":"harita_eylemi","eylem":"bolgeyi_filtrele","sorgu":"Aydın"}\n```'
);
if (haritaEylemi.length !== 1 || haritaEylemi[0]?.type !== "harita_eylemi") {
  fail(`expected harita_eylemi block, got ${JSON.stringify(haritaEylemi.map((b) => b.type))}`);
}
if (haritaEylemi[0].type === "harita_eylemi" && haritaEylemi[0].sorgu !== "Aydın") {
  fail("sorgu mismatch");
}
console.log("harita_eylemi parse ok");

const bilinmeyenEylem = parseAgentContent(
  '```locus\n{"kind":"harita_eylemi","eylem":"aracin_gpsini_kapat"}\n```'
);
if (bilinmeyenEylem.length !== 0) {
  fail("unknown eylem should be dropped, not rendered");
}
console.log("harita_eylemi unknown action dropped ok");

const gecersizSekme = parseAgentContent(
  '```locus\n{"kind":"harita_eylemi","eylem":"sekmeyi_degistir","sekme":"uydurma"}\n```'
);
if (
  gecersizSekme[0]?.type !== "harita_eylemi" ||
  gecersizSekme[0].sekme !== undefined
) {
  fail("invalid sekme should fall back to undefined, not crash");
}
console.log("harita_eylemi invalid sekme ok");

const rotaOnerisiGecerli = parseAgentContent(
  '```locus\n{"kind":"rota_onerisi","baslik":"Ahmet Yılmaz\'ı taşı","adimlar":[{"eylem":"durak_tasi","durak":"Ahmet Yılmaz","hedefArac":"Isuzu 3D","pozisyon":2}]}\n```'
);
if (rotaOnerisiGecerli.length !== 1 || rotaOnerisiGecerli[0]?.type !== "rota_onerisi") {
  fail(`expected rota_onerisi block, got ${JSON.stringify(rotaOnerisiGecerli.map((b) => b.type))}`);
}
if (
  rotaOnerisiGecerli[0].type === "rota_onerisi" &&
  (rotaOnerisiGecerli[0].adimlar.length !== 1 ||
    rotaOnerisiGecerli[0].adimlar[0]?.pozisyon !== 2)
) {
  fail("rota_onerisi adim mismatch");
}
console.log("rota_onerisi parse ok");

const rotaOnerisiBilinmeyenEylem = parseAgentContent(
  '```locus\n{"kind":"rota_onerisi","baslik":"X","adimlar":[{"eylem":"aracin_gpsini_kapat"}]}\n```'
);
if (rotaOnerisiBilinmeyenEylem.length !== 0) {
  fail("rota_onerisi with unknown eylem should be dropped entirely");
}
console.log("rota_onerisi unknown eylem dropped ok");

// Hepsi-ya-da-hiçbiri: ikinci adım geçersizse TÜM blok düşmeli — harita_eylemi'nin
// alan-bazlı gevşek davranışından kasıtlı sapma (bkz. parseRotaOnerisiAdimi yorumu).
const rotaOnerisiKismenGecersiz = parseAgentContent(
  '```locus\n{"kind":"rota_onerisi","baslik":"X","adimlar":[{"eylem":"durak_havuza_al","durak":"Ahmet Yılmaz"},{"eylem":"durak_tasi","durak":"Veli"}]}\n```'
);
if (rotaOnerisiKismenGecersiz.length !== 0) {
  fail("rota_onerisi should drop the WHOLE block if any single step is invalid (missing hedefArac)");
}
console.log("rota_onerisi all-or-nothing ok");

const rotaOnerisiGecersizPozisyon = parseAgentContent(
  '```locus\n{"kind":"rota_onerisi","baslik":"X","adimlar":[{"eylem":"durak_tasi","durak":"A","hedefArac":"B","pozisyon":0}]}\n```'
);
if (rotaOnerisiGecersizPozisyon.length !== 0) {
  fail("rota_onerisi should reject non-positive pozisyon");
}
console.log("rota_onerisi invalid pozisyon rejected ok");
