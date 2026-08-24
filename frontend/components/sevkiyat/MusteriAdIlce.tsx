import { unvandanIlceAyir } from "@/lib/unvan-ilce";
import { cn } from "@/lib/utils";

/**
 * Dar sütunda unvan `truncate` olur, ilçe `shrink-0` ile satır sonunda
 * kalır. Cihaza özel breakpoint gerekmez — isim uzunluğu ne olursa olsun
 * "(Edremit)" kesilmez.
 */
export function MusteriAdIlce({
  ad,
  ilce,
  className,
}: {
  ad: string;
  ilce: string | null;
  className?: string;
}) {
  const ayrilmis = unvandanIlceAyir(ad, ilce);
  return (
    <span className={cn("flex min-w-0 items-baseline", className)}>
      <span className="min-w-0 truncate">{ayrilmis.ad || ad}</span>
      {ayrilmis.ilce ? (
        <span className="shrink-0 text-muted-foreground"> ({ayrilmis.ilce})</span>
      ) : null}
    </span>
  );
}
