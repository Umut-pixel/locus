import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Tahsilat");

export default function TahsilatLayout({ children }: { children: ReactNode }) {
  return children;
}
