import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Rotalar");

export default function RotalarLayout({ children }: { children: ReactNode }) {
  return children;
}
