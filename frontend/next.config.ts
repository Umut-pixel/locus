import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Tek kaynak: repo kökü .env (Python ile aynı dosya).
// frontend/.env.local varsa üzerine yazar (opsiyonel override).
const repoRoot = path.join(__dirname, "..");
loadEnvConfig(repoRoot);
loadEnvConfig(__dirname);

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
