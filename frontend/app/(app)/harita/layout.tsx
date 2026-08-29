import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Harita");

export default function HaritaLayout({ children }: { children: ReactNode }) {
  return children;
}
