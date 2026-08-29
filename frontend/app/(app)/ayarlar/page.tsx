"use client";

import { Typography } from "@heroui/react";

import { AnalystDurumu } from "@/components/ayarlar/AnalystDurumu";
import { HaritaDurumu } from "@/components/ayarlar/HaritaDurumu";
import { VeriDurumu } from "@/components/ayarlar/VeriDurumu";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";

export default function AyarlarPage() {
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <VeriDurumu />
        <AnalystDurumu />
        <HaritaDurumu />
      </div>
    </div>
  );
}
