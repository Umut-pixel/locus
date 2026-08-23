import {
  clipAgentError,
  parseAgentRuntimeStatus,
} from "./agent-status";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(parseAgentRuntimeStatus("{") === null, "bozuk JSON");
assert(parseAgentRuntimeStatus("null") === null, "null");
assert(parseAgentRuntimeStatus(JSON.stringify({ ok: true }))?.ok === true, "ok");

const down = parseAgentRuntimeStatus(
  JSON.stringify({ ok: false, message: "Agent hatası (502)", at: "2026-08-23T15:00:00.000Z" })
);
assert(down && !down.ok && down.message.includes("502"), "down");
assert(parseAgentRuntimeStatus(JSON.stringify({ ok: false })) === null, "eksik alan");

assert(clipAgentError("kısa") === "kısa", "kısa kesit");
assert(clipAgentError("  a  b  ") === "a b", "whitespace");
const long = "x".repeat(50);
assert(clipAgentError(long).length === 40, "40 char clip");
assert(clipAgentError(long).endsWith("…"), "ellipsis");

console.log("agent-status ok");
