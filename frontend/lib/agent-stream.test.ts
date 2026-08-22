/**
 * agent-stream SSE ayrıştırıcı testleri.
 *
 * Çalıştır:  npm run test:stream        (frontend/ içinden)
 *
 * Test koşucusu yok — bilerek. Bu dosya sahte bir `fetch` kurup akışı baştan
 * sona sürüyor ve sonucu basıyor; beklenen çıktı her bloğun yanında yazılı.
 * Deploy sonrası gerçek olay biçimi farklı çıkarsa, buraya o biçimi ekleyip
 * tekrar çalıştırmak en hızlı geri bildirim döngüsü.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { streamAgent, type AgentStreamEvent } from "./agent-stream";

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function run(name: string, chunks: string[]) {
  (globalThis as any).fetch = async () => sseResponse(chunks);
  const events: AgentStreamEvent[] = [];
  await streamAgent({ message: "test", onEvent: (e) => events.push(e) });
  const text = events.filter((e) => e.kind === "text").map((e: any) => e.delta).join("");
  const tools = events.filter((e) => e.kind === "tool").map((e: any) => e.name);
  const errs = events.filter((e) => e.kind === "error").map((e: any) => e.message);
  const dbg = events.filter((e) => e.kind === "debug").length;
  console.log(`\n### ${name}`);
  console.log(`  metin : ${JSON.stringify(text)}`);
  console.log(`  arac  : ${JSON.stringify(tools)}`);
  console.log(`  hata  : ${JSON.stringify(errs)}`);
  console.log(`  debug : ${dbg}`);
}

(async () => {
  // 1) tuple + duz string icerik (klasik LangGraph messages modu)
  await run("tuple + string", [
    'event: messages\ndata: [{"content":"Izmir\'de ","type":"AIMessageChunk"},{"langgraph_node":"agent"}]\n\n',
    'event: messages\ndata: [{"content":"47 riskli","type":"AIMessageChunk"},{}]\n\n',
    "data: [DONE]\n\n",
  ]);

  // 2) Anthropic blok dizisi
  await run("blok dizisi", [
    'data: [{"content":[{"type":"text","text":"Toplam "},{"type":"text","text":"1.318"}],"type":"AIMessageChunk"},{}]\n\n',
  ]);

  // 3) arac cagrisi + ToolMessage donusu (ham SQL sonucu sohbete BASILMAMALI)
  await run("arac cagrisi", [
    'data: [{"content":"","tool_calls":[{"name":"sql_query","args":{}}],"type":"AIMessageChunk"},{}]\n\n',
    'data: [{"content":"[[1318]]","type":"tool","name":"sql_query"},{}]\n\n',
    'data: [{"content":"Sonuc: 1318","type":"AIMessageChunk"},{}]\n\n',
  ]);

  // 4) kare TCP sinirinda ikiye bolunmus (en kritik senaryo)
  await run("bolunmus kare", [
    'data: [{"content":"yar',
    'im kare","type":"AIMessageChunk"},{}]\n\n',
  ]);

  // 5) \r\n ayirici + heartbeat yorumu
  await run("CRLF + heartbeat", [
    ": ping\r\n\r\n",
    'data: [{"content":"crlf ok"},{}]\r\n\r\n',
  ]);

  // 6) hata olayi — duz metin
  await run("error (duz metin)", ["event: error\ndata: rate limit exceeded\n\n"]);

  // 6b) hata olayi — GERCEK bicim (yerel LangGraph sunucusundan gozlemlendi)
  await run("error (gercek JSON)", [
    'event: metadata\ndata: {"run_id":"01a02a21","attempt":1}\n\n',
    'event: error\ndata: {"error":"TypeError","message":"Anthropic authentication failed: no API key"}\n\n',
  ]);

  // 7) taninmayan bicim -> debug
  await run("taninmayan", ['data: {"beklenmedik":true}\n\n']);

  // 9) GERCEK AKIS — 2026-08-22'de yerel `mda dev` sunucusundan yakalandi.
  //    En onemli test: messages/partial KUMULATIF, delta degil. Parser
  //    farki almazsa metin katlanarak tekrarlanir.
  {
    const dir = join(import.meta.dirname, "__fixtures__");
    const ham = readFileSync(join(dir, "agent-sse-gercek.txt"), "utf-8");
    const beklenen = readFileSync(join(dir, "agent-sse-beklenen.txt"), "utf-8");

    // Akisi rastgele yerlerden bolerek besle — TCP parcalanmasini taklit eder.
    const parcalar: string[] = [];
    for (let i = 0; i < ham.length; i += 997) parcalar.push(ham.slice(i, i + 997));

    (globalThis as any).fetch = async () => sseResponse(parcalar);
    const events: AgentStreamEvent[] = [];
    await streamAgent({ message: "Toplam kac musteri var?", onEvent: (e) => events.push(e) });

    const metin = events.filter((e) => e.kind === "text").map((e: any) => e.delta).join("");
    const araclar = events.filter((e) => e.kind === "tool").map((e: any) => e.name);
    const debug = events.filter((e) => e.kind === "debug").length;

    console.log("\n### GERCEK AKIS (fixture)");
    console.log(`  arac cagrilari : ${JSON.stringify(araclar)}`);
    console.log(`  debug kare     : ${debug}`);
    console.log(`  metin uzunlugu : ${metin.length} (beklenen ${beklenen.length})`);
    console.log(`  metin          : ${JSON.stringify(metin.slice(0, 100))}`);
    const gecti = metin === beklenen;
    console.log(`  ${gecti ? "GECTI" : "KALDI"}  metin birebir esit mi -> ${gecti}`);
    if (!gecti) {
      console.log(`  BEKLENEN: ${JSON.stringify(beklenen)}`);
      process.exitCode = 1;
    }
    // Ham SQL sonucu sohbete sizmamali
    if (metin.includes("musteri_sayisi")) {
      console.log("  KALDI  ham SQL sonucu metne sizdi!");
      process.exitCode = 1;
    }
  }

  // 8) proxy 503 (JSON govde, SSE degil)
  (globalThis as any).fetch = async () =>
    new Response(JSON.stringify({ error: "LANGSMITH_AGENT_URL tanimli degil" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  const ev: AgentStreamEvent[] = [];
  await streamAgent({ message: "x", onEvent: (e) => ev.push(e) });
  console.log("\n### proxy 503");
  console.log("  hata  :", JSON.stringify(ev.map((e: any) => e.message)));
})();
