import { existsSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

import { createSupabaseAdmin } from "../lib/supabase-admin";
import { runPanoramaTransform } from "../lib/sync/run-transform";

async function main() {
  const force = process.argv.includes("--force");
  const skipGeocode = process.argv.includes("--skip-geocode");
  const recoverIdx = process.argv.indexOf("--geocode-limit");
  const geocodeLimit =
    recoverIdx >= 0 ? Number(process.argv[recoverIdx + 1]) : undefined;

  const admin = createSupabaseAdmin();
  console.log(
    `Starting transform… force=${force} skipGeocode=${skipGeocode} geocodeLimit=${geocodeLimit ?? "default"}`
  );
  const result = await runPanoramaTransform(admin, {
    force,
    skipGeocode,
    geocodeLimit: Number.isFinite(geocodeLimit) ? geocodeLimit : undefined,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
