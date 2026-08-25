import {
  konusmaAmaci,
  langgraphOrigin,
  playbookFromRows,
  stripStaleFigures,
} from "./agent-playbook";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  langgraphOrigin("http://127.0.0.1:2024/runs/stream") === "http://127.0.0.1:2024",
  "runs/stream origin"
);
assert(
  langgraphOrigin("https://agent.example/runs/stream/") === "https://agent.example",
  "trailing slash"
);

const stripped = stripStaleFigures(
  "Net ciro ₺47.831.052 (KDV hariç). 1234 müşteri.\n\n```locus\n{\"kind\":\"table\",\"rows\":[[\"A\",\"1\"]]}\n```\n"
);
assert(!stripped.includes("47.831"), "tutar silindi");
assert(!stripped.includes("1234"), "sayı silindi");
assert(stripped.includes("[görsel blok]"), "locus bloğu");
assert(stripped.includes("KDV hariç"), "yöntem kaldı");

const playbook = playbookFromRows(
  [
    { rol: "user", metin: "Bornova ciro?" },
    {
      rol: "assistant",
      metin: "belge_net_ciro, musteriler_rapor, sehir filtresi. ₺1.000.000",
    },
    { rol: "user", metin: "tekrar bak" },
  ],
  "tekrar bak"
);
assert(playbook.length === 2, `playbook length ${playbook.length}`);
assert(playbook[0]?.role === "user" && playbook[0].content.includes("Bornova"), "user kept");
assert(playbook[1]?.role === "assistant", "assistant kept");
assert(!playbook[1]?.content.includes("1.000"), "assistant tutar yok");
assert(playbook[1]?.content.includes("sql_query"), "yenile notu");

const empty = playbookFromRows(
  [{ rol: "user", metin: "kaç müşteri var?" }],
  "kaç müşteri var?"
);
assert(empty.length === 0, "ilk tur playbook boş");

const amac = konusmaAmaci(
  "Bornova teslimat ve borç",
  "Kaynak musteriler_rapor. Teslimat risk_durumu, borç yas_riskli_tutar. ₺8.400"
);
assert(amac.includes("Bornova"), "amaç soru");
assert(amac.includes("musteriler_rapor"), "amaç view");
assert(!amac.includes("8.400"), "amaçta tutar yok");

console.log("agent-playbook ok");
