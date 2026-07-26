/**
 * Repo kökündeki tek .env dosyasını frontend/.env.local'e kopyalar.
 * Next.js yalnızca kendi dizinindeki .env* dosyalarını bundle'a alır;
 * next.config loadEnvConfig client/SSR için yeterli değil.
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, "..");
const rootEnv = path.join(frontendDir, "..", ".env");
const target = path.join(frontendDir, ".env.local");

if (!existsSync(rootEnv)) {
  console.warn(
    `[sync-env] Kök .env yok: ${rootEnv}\n` +
      `  cp .env.example .env  ile oluşturun. Vercel'de Environment Variables kullanın.`
  );
  process.exit(0);
}

copyFileSync(rootEnv, target);
console.log(`[sync-env] ${rootEnv} → ${target}`);
