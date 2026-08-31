import { redirect } from "next/navigation";

import { HomeLauncher } from "@/components/agent/HomeLauncher";
import { konusmaHref } from "@/lib/agent-konusma";
import { konusmaById } from "@/lib/agent-konusma-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Ana sayfa artik SADECE baslatici. Sohbet /sohbet/{slug}-{no} altinda.
 *
 * Eski yer imleri /home?k=<uuid> seklindeydi; onlari kanonik sohbet
 * adresine tasiyoruz, bulunamazsa temiz ana sayfaya dusuruyoruz.
 */
export default async function HomePage(ctx: Ctx) {
  const sp = await ctx.searchParams;
  const raw = sp.k;
  const eskiThread = Array.isArray(raw) ? raw[0] : raw;

  if (eskiThread) {
    const konusma = await konusmaById(eskiThread);
    redirect(konusma ? konusmaHref(konusma.baslik, konusma.siraNo) : "/home");
  }

  return <HomeLauncher />;
}
