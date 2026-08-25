import { revealablePrefix, revealUnits } from "./agent-reveal";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const prose = "Aktif müşteri: **951**.";
assert(revealablePrefix(prose) === prose, "düz metin");
assert(revealUnits(prose).join("") === prose, "kelimeler birleşir");
assert(revealUnits(prose).length >= 3, "kelime birimleri");

const withFence =
  "Özet satır.\n\n```locus\n{\"kind\":\"table\",\"columns\":[\"A\"],\"rows\":[[\"1\"]]}\n```\n";
assert(revealablePrefix(withFence) === withFence, "kapalı çit tam");
const units = revealUnits(withFence);
assert(units.some((u) => u.startsWith("```locus")), "çit tek birim");
assert(units.filter((u) => u.startsWith("```locus")).length === 1, "tek çit");
assert(units.join("") === withFence, "çitli birleşim");

const open = "Özet.\n\n```locus\n{\"kind\":\"table\"";
assert(revealablePrefix(open) === "Özet.\n\n", "açık çit tutulur");
assert(
  revealUnits(open).every((u) => !u.includes("```locus")),
  "açık çit birimde yok"
);

console.log("agent-reveal ok");
