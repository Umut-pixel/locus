import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/site";

import { RotaPlaniProvider } from "./RotaPlaniProvider";

export const metadata = pageMetadata("Rotalar");

/**
 * Taslak plan üç ekran arasında paylaşılıyor (bento ana sayfa, araç detayı,
 * tam ekran harita). Sayfa state'inde tutulsaydı gezinirken kaybolurdu.
 */
export default function RotalarLayout({ children }: { children: ReactNode }) {
  return <RotaPlaniProvider>{children}</RotaPlaniProvider>;
}
