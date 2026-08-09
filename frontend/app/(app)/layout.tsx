import type { ReactNode } from "react";

import { LoginEnterTransition } from "@/components/auth/LoginEnterTransition";
import { AppSidebar } from "@/components/sidebar/AppSidebar";

/** Girişli tüm sayfaların ortak kabuğu — sidebar sayfalar arası state'ini korur. */
export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-dvh w-full max-w-[100vw] overflow-hidden">
      <LoginEnterTransition />
      <AppSidebar />
      {children}
    </div>
  );
}
