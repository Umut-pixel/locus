import type { ReactNode } from "react";

import { AgentFollowCard } from "@/components/agent/AgentFollowCard";
import { AgentRuntimeProvider } from "@/hooks/useAgentSession";
import { LoginEnterTransition } from "@/components/auth/LoginEnterTransition";
import { AppSidebar } from "@/components/sidebar/AppSidebar";

/** Girişli tüm sayfaların ortak kabuğu — sidebar sayfalar arası state'ini korur. */
export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <AgentRuntimeProvider>
      <div className="relative flex h-dvh w-full max-w-[100vw] overflow-hidden">
        <LoginEnterTransition />
        <AppSidebar />
        {children}
        <AgentFollowCard />
      </div>
    </AgentRuntimeProvider>
  );
}
