import { DEPOT, googleMapsDirUrl } from "./depot";

function fail(msg: string): never {
  throw new Error(msg);
}

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

const a = { lat: 38.32, lon: 26.76 };
const b = { lat: 37.03, lon: 27.43 };

{
  const q = params(googleMapsDirUrl([a, b], { includeDepot: true }));
  if (q.get("origin") !== `${DEPOT.lat},${DEPOT.lon}`) fail("origin should be depot");
  if (q.get("destination") !== `${b.lat},${b.lon}`) fail("dest should be last stop");
  if (q.get("waypoints") !== `${a.lat},${a.lon}`) fail("waypoints should be middle stops");
  if (q.get("travelmode") !== "driving") fail("travelmode");
}
console.log("depot outbound ok");

{
  const q = params(googleMapsDirUrl([a], { includeDepot: true }));
  if (q.get("origin") !== `${DEPOT.lat},${DEPOT.lon}`) fail("single origin");
  if (q.get("destination") !== `${a.lat},${a.lon}`) fail("single dest");
  if (q.get("waypoints")) fail("single stop should have no waypoints");
}
console.log("depot single stop ok");

{
  const q = params(googleMapsDirUrl([a, b], { includeDepot: true, roundTrip: true }));
  const depot = `${DEPOT.lat},${DEPOT.lon}`;
  if (q.get("origin") !== depot || q.get("destination") !== depot) fail("round trip ends at depot");
  if (q.get("waypoints") !== `${a.lat},${a.lon}|${b.lat},${b.lon}`) fail("round trip waypoints");
}
console.log("depot round trip ok");

{
  const q = params(googleMapsDirUrl([a, b], { includeDepot: false }));
  if (q.get("origin") !== `${a.lat},${a.lon}`) fail("no-depot origin");
  if (q.get("destination") !== `${b.lat},${b.lon}`) fail("no-depot dest");
}
console.log("no-depot ok");

{
  const url = googleMapsDirUrl([], { includeDepot: true });
  if (!url.includes("maps/search")) fail("depot-only should be search");
  if (!url.includes(`${DEPOT.lat},${DEPOT.lon}`)) fail("depot-only coords");
}
console.log("depot-only search ok");
