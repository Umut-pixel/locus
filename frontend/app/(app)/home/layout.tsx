import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Analyst");

export default function HomeLayout({ children }: { children: ReactNode }) {
  return children;
}
