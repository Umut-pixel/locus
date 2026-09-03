"use client";

import { RaporCekmePaneli } from "@/components/panorama/RaporCekmePaneli";
import type { SecimBlock } from "@/lib/agent-blocks";

/**
 * Sohbetteki çoktan seçmeli aksiyon kartı — şimdilik tek aksiyonu var:
 * rapor çekme.
 *
 * İşin tamamı `RaporCekmePaneli`'nde: ana sayfadaki "Şimdi çek" düğmesi de
 * aynı bileşeni kullanıyor, iki yerde iki ayrı davranış olmasın.
 *
 * Modelin bloktaki `secenekler` listesi burada KULLANILMIYOR; panel kayıt
 * defterini (`lib/panorama-raporlar.ts`) okur. Böylece asistan rapor adı
 * ya da süre uydursa bile kullanıcı doğru listeyi görür — blok yalnız
 * "burada bir seçim kartı olsun" sinyali.
 */
export function SelectCard({ block }: { block: SecimBlock }) {
  if (block.aksiyon !== "rapor_cek") return null;

  return (
    <div className="my-3 w-full">
      <RaporCekmePaneli baslik={block.title} />
    </div>
  );
}
