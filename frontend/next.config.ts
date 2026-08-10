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
  // SheetJS yalnızca API route'ta — client graph'a sızmasın
  serverExternalPackages: ["xlsx"],
  // @heroui/react'in "use client" sınırları prebuilt dist'te Next'in RSC
  // analiziyle güvenilir eşleşmiyor (route prefetch'te "client-only cannot be
  // imported from a Server Component" hatası) — transpilePackages paketi
  // kendi derleyicisinden geçirip sınırları yeniden, doğru tespit ettiriyor.
  transpilePackages: ["@heroui/react"],
  experimental: {
    optimizePackageImports: ["lucide-react", "motion", "thinking-orbs"],
  },
};

export default nextConfig;
