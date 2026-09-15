"use client";

import { useState, type ComponentType } from "react";

import { Typography } from "@heroui/react";

import { AnalystDurumu } from "@/components/ayarlar/AnalystDurumu";
import { BildirimAyarlari } from "@/components/ayarlar/BildirimAyarlari";
import { HaritaDurumu } from "@/components/ayarlar/HaritaDurumu";
import { HesabimBolum } from "@/components/ayarlar/HesabimBolum";
import { KullanicilarBolum } from "@/components/ayarlar/KullanicilarBolum";
import { VeriDurumu } from "@/components/ayarlar/VeriDurumu";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AYARLAR_TABS, type AyarlarTabId } from "@/lib/ayarlar-nav";

const PANEL_COMPONENTS: Record<AyarlarTabId, ComponentType> = {
  hesabim: HesabimBolum,
  veri: VeriDurumu,
  analyst: AnalystDurumu,
  harita: HaritaDurumu,
  bildirimler: BildirimAyarlari,
  kullanicilar: KullanicilarBolum,
};

export default function AyarlarPage() {
  const [tab, setTab] = useState<AyarlarTabId>("veri");
  const { izinler, loading: userLoading } = useCurrentUser();

  // Yüklenirken tam listeyi göster — izinler gelince daralır. AppSidebar'daki
  // aynı desen: güvenlik sınırı zaten middleware'de, burası yalnız görünürlük.
  const visibleTabs = userLoading
    ? AYARLAR_TABS
    : AYARLAR_TABS.filter((t) => !t.izin || izinler.includes(t.izin));

  // `tab` state'i artık görünmeyen bir sekmeyi (örn. satış temsilcisi için
  // "veri") gösteriyorsa ilk görünen sekmeye düş — aksi halde içerik boş
  // kalır (Tabs kontrollü, otomatik düzeltme yapmaz).
  const activeTab = visibleTabs.some((t) => t.id === tab)
    ? tab
    : (visibleTabs[0]?.id ?? "hesabim");

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Typography.Heading level={5} className="shrink-0 tracking-tight">
            Ayarlar
          </Typography.Heading>
          <Typography.Paragraph size="sm" color="muted" truncate className="hidden sm:block">
            Patinfo, Panorama ERP’sinin yerini almaz.
          </Typography.Paragraph>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setTab(value as AyarlarTabId)}
        orientation="vertical"
        className="flex min-h-0 flex-1 flex-col lg:flex-row"
      >
        <TabsList>
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <TabsTab key={id} value={id}>
              <Icon />
              {label}
            </TabsTab>
          ))}
          <TabsIndicator />
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 p-4 lg:p-6">
            {visibleTabs.map(({ id }) => {
              const Panel = PANEL_COMPONENTS[id];
              return (
                <TabsPanel key={id} value={id}>
                  <Panel />
                </TabsPanel>
              );
            })}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
