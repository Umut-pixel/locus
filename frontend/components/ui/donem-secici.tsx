"use client";

import { CalendarRangeIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DONEM_SECENEKLERI,
  type DonemAraligi,
  type DonemPreset,
  araligiEtiketle,
  donemAraligi,
  gunEkle,
  istanbulIsoGun,
} from "@/lib/donem";
import { cn } from "@/lib/utils";

/**
 * Rapor sayfalarının ortak dönem seçicisi.
 *
 * Filtre kontrolleri MusteriRaporlamaFilters.tsx'teki ölçüyle aynı
 * (h-9 / 13px) — sayfalar arasında tek bir kontrol yüksekliği var.
 */
const KONTROL = "h-9 min-w-0 rounded-md text-[13px] md:text-[13px] [&>span]:truncate";

interface DonemSeciciProps {
  deger: DonemAraligi;
  onChange: (sonraki: DonemAraligi) => void;
  className?: string;
}

export function DonemSecici({ deger, onChange, className }: DonemSeciciProps) {
  // Tam kontrollü: yerel kopya state YOK. Girdi değerleri doğrudan `deger`den
  // türetiliyor, değişiklik yukarı bildiriliyor ve prop olarak geri geliyor.
  // (Yerel state + useEffect ile senkron tutmak cascading render üretiyordu —
  // react-hooks/set-state-in-effect.)
  //
  // Kullanıcı bitiş gününü DAHİL seçer; sözleşme hariç olduğu için gösterirken
  // bir gün geri alınır, yazarken bir gün eklenir.
  const ozelBas = deger.bas;
  const ozelBitis = gunEkle(deger.bitisHaric, -1);
  const bugun = istanbulIsoGun();

  function presetDegisti(sonraki: DonemPreset) {
    if (sonraki !== "ozel") {
      onChange(donemAraligi(sonraki));
      return;
    }
    // "Özel"e geçerken mevcut pencereyi başlangıç değeri olarak koru —
    // seçici açıldığında ekran boşalmasın.
    onChange(donemAraligi("ozel", { ozelBas, ozelBitisDahil: ozelBitis }));
  }

  function ozelDegisti(bas: string, bitisDahil: string) {
    // Tarih girdisi geçici olarak boşalabilir; yarım değerle aralık üretme.
    if (!bas || !bitisDahil) return;
    onChange(donemAraligi("ozel", { ozelBas: bas, ozelBitisDahil: bitisDahil }));
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select
        value={deger.preset}
        onValueChange={(v) => presetDegisti(v as DonemPreset)}
      >
        <SelectTrigger size="sm" className={cn(KONTROL, "w-[9.5rem]")}>
          <SelectValue>
            {(v: string) =>
              DONEM_SECENEKLERI.find((s) => s.preset === v)?.etiket ?? "Dönem"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {DONEM_SECENEKLERI.map((s) => (
            <SelectItem key={s.preset} value={s.preset}>
              {s.etiket}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {deger.preset === "ozel" ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="Başlangıç tarihi"
            value={ozelBas}
            max={ozelBitis || bugun}
            onChange={(e) => ozelDegisti(e.target.value, ozelBitis)}
            className={cn(KONTROL, "w-[8.5rem]")}
          />
          <span className="text-[13px] text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="Bitiş tarihi"
            value={ozelBitis}
            min={ozelBas}
            onChange={(e) => ozelDegisti(ozelBas, e.target.value)}
            className={cn(KONTROL, "w-[8.5rem]")}
          />
        </div>
      ) : (
        // Seçilen preset'in gerçekte hangi günleri kapsadığını göster —
        // "son 30 gün"ün hangi tarihler olduğu tahmine kalmasın.
        <span
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground"
          title={`${deger.bas} – ${gunEkle(deger.bitisHaric, -1)}`}
        >
          <CalendarRangeIcon className="size-3.5 shrink-0" strokeWidth={1.75} />
          {araligiEtiketle(deger.bas, deger.bitisHaric)}
        </span>
      )}
    </div>
  );
}
