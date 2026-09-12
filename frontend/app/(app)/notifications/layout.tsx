import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Bildirimler");

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  return children;
}
