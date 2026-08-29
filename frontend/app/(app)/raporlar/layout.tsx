import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Müşteri Raporlama");

export default function RaporlarLayout({ children }: { children: ReactNode }) {
  return children;
}
