import { notFound, redirect } from "next/navigation";

import { SohbetEkrani } from "@/components/agent/SohbetEkrani";
import { konusmaBySiraNo } from "@/lib/agent-konusma-server";
import { konusmaHref, konusmaSlug, siraNoFromSlug } from "@/lib/agent-konusma";
import { pageMetadata } from "@/lib/site";

export const runtime = "nodejs";
/** Konuşma içeriği her istekte tazedir; önbelleğe alma. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function generateMetadata(ctx: Ctx) {
  const { slug } = await ctx.params;
  const siraNo = siraNoFromSlug(slug);
  const konusma = siraNo ? await konusmaBySiraNo(siraNo) : null;
  return pageMetadata(konusma?.baslik ?? "Sohbet");
}

export default async function SohbetPage(ctx: Ctx) {
  const { slug } = await ctx.params;

  const siraNo = siraNoFromSlug(slug);
  if (!siraNo) notFound();

  const konusma = await konusmaBySiraNo(siraNo);
  if (!konusma) notFound();

  // Başlık sonradan değiştiyse eski slug hâlâ doğru konuşmayı bulur; kullanıcıyı
  // kanonik adrese taşı ki paylaşılan link ile adres çubuğu ayrışmasın.
  if (konusmaSlug(konusma.baslik, konusma.siraNo) !== slug) {
    redirect(konusmaHref(konusma.baslik, konusma.siraNo));
  }

  return <SohbetEkrani konusmaId={konusma.id} />;
}
