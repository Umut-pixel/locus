import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Finansal Raporlar");

export default function FinansalLayout({ children }: { children: ReactNode }) {
  return children;
}
