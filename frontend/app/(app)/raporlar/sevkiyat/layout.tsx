import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Sevkiyat Raporları");

export default function SevkiyatLayout({ children }: { children: ReactNode }) {
  return children;
}
