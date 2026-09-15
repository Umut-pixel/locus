import type { ReactNode } from "react";

import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AyarlarBolum({
  baslik,
  aciklama,
  aksiyon,
  children,
}: {
  baslik: string;
  aciklama?: string;
  aksiyon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 border border-border py-0 ring-0">
      <CardHeader className="border-b border-border px-3.5 py-3">
        <CardTitle>{baslik}</CardTitle>
        {aciklama ? <CardDescription>{aciklama}</CardDescription> : null}
        {aksiyon ? (
          <CardAction className="flex items-center gap-1.5 self-center">
            {aksiyon}
          </CardAction>
        ) : null}
      </CardHeader>
      {children}
    </Card>
  );
}
