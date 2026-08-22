import { parseAgentContent } from "./agent-blocks";

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
  throw new Error(`expected coalesced filter, got ${JSON.stringify(blocks.map((b) => b.type))}`);
}
if (blocks[0].type === "filter" && blocks[0].chart?.variant !== "line") {
  throw new Error("filter should carry the line chart");
}
console.log("coalesce ok");
