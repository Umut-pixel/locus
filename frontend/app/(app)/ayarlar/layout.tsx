import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Ayarlar");

export default function AyarlarLayout({ children }: { children: ReactNode }) {
  return children;
}
