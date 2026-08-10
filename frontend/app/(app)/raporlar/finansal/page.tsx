"use client";

import { BanknoteIcon } from "lucide-react";
import { Typography } from "@heroui/react";

import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";

export default function FinansalRaporlarPage() {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <Typography.Heading level={5} className="tracking-tight">
          Finansal Raporlar
        </Typography.Heading>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <BanknoteIcon className="size-7 text-muted-foreground" strokeWidth={1.5} />
        <div className="space-y-1">
          <Typography.Heading level={6}>Yakında</Typography.Heading>
          <Typography.Paragraph size="sm" color="muted" className="max-w-sm">
            Bu bölüm henüz hazırlanıyor — nakit akışı, tahsilat ve borç
            yaşlandırması kırılımlı finansal raporlar buraya eklenecek.
          </Typography.Paragraph>
        </div>
      </div>
    </div>
  );
}
