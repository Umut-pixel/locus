import type { ReactNode } from "react";

import { AgentFollowCard } from "@/components/agent/AgentFollowCard";
import { AgentRuntimeProvider } from "@/hooks/useAgentSession";
import { LoginEnterTransition } from "@/components/auth/LoginEnterTransition";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { PotansiyelTaramaProvider } from "@/hooks/usePotansiyelTarama";
import { RaporCekmeProvider } from "@/hooks/useRaporCekme";

/**
 * Girişli tüm sayfaların ortak kabuğu — sidebar sayfalar arası state'ini korur.
 *
 * `RaporCekmeProvider` de burada: rapor çekimi sohbet kartının ya da ana
 * sayfadaki Sheet'in içinde başlıyor, ama o bileşenler sayfa değişince
 * unmount oluyor. Provider bu seviyede durduğu için çekim arka planda
 * sürüyor ve toast her sayfada görünmeye devam ediyor.
 *
 * `PotansiyelTaramaProvider` aynı gerekçeyle: harita üzerinden başlatılan
 * Google Places taraması 3-12 dk sürüyor ve kullanıcı bu sırada başka
 * sayfaya geçebilmeli.
 */
export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <AgentRuntimeProvider>
      <RaporCekmeProvider>
        <PotansiyelTaramaProvider>
          <div className="relative flex h-dvh w-full max-w-[100vw] overflow-hidden">
            <LoginEnterTransition />
            <AppSidebar />
            {children}
            <AgentFollowCard />
          </div>
        </PotansiyelTaramaProvider>
      </RaporCekmeProvider>
    </AgentRuntimeProvider>
  );
}
