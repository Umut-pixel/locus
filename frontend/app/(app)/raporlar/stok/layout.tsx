import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Stok Raporları");

export default function StokLayout({ children }: { children: ReactNode }) {
  return children;
}
