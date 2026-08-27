import type { ReactNode } from "react";

export function AyarlarBolum({
  id,
  baslik,
  aksiyon,
  children,
}: {
  id: string;
  baslik: string;
  aksiyon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-b border-border">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border px-3.5">
        <h2 className="py-2.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          {baslik}
        </h2>
        {aksiyon ? <div className="flex shrink-0 items-center gap-1.5">{aksiyon}</div> : null}
      </div>
      {children}
    </section>
  );
}
