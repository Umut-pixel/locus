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
