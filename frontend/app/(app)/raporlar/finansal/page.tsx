import { BanknoteIcon } from "lucide-react";

import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";

export default function FinansalRaporlarPage() {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <h1 className="text-[18px] font-semibold tracking-tight">Finansal Raporlar</h1>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <BanknoteIcon className="size-7 text-muted-foreground" strokeWidth={1.5} />
        <div className="space-y-1">
          <p className="text-[15px] font-medium text-foreground">Yakında</p>
          <p className="max-w-sm text-[13.5px] text-muted-foreground">
            Bu bölüm henüz hazırlanıyor — nakit akışı, tahsilat ve borç
            yaşlandırması kırılımlı finansal raporlar buraya eklenecek.
          </p>
        </div>
      </div>
    </div>
  );
}
