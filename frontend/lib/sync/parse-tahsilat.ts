import { parseIslemTarihi } from "@/lib/import/parse-belge-detay";
import type { TahsilatOzetUpdateRow } from "@/lib/import/types";
import { sayiyaCevir } from "@/lib/import/utils";

function metin(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function tutar(value: unknown): number {
  return sayiyaCevir(value) ?? 0;
}

/** Türkçe İ/I/Ö tuzağına düşmeden ödeme durumunu kıyasla. */
function odemeNorm(value: string | null): string {
  return (value ?? "")
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .replace(/Ö/g, "ö")
    .toLocaleLowerCase("tr-TR")
    .replace(/ö/g, "o");
}

export function tahsilatOdendiMi(durum: string | null): boolean {
  return odemeNorm(durum) === "odendi";
}

export function tahsilatOdenmediMi(durum: string | null): boolean {
  return odemeNorm(durum) === "odenmedi";
}

function istanbulIsoGun(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function gunEkle(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

interface Acc {
  musteri_kodu: string;
  sonOdendi: string | null;
  sonHerhangi: string | null;
  tahsilat_7g: number;
  tahsilat_30g: number;
  tahsilat_ytd: number;
  odenmemis_tutar: number;
  odenmemis_adet: number;
  satir_sayisi: number;
}

/**
 * 5230 landing satırlarını müşteri nakit özetine çevirir.
 * Ödendi = nakit girişi; Ödenmedi = çek/senet izleme.
 */
export function parseTahsilatOzet(
  rows: Record<string, unknown>[]
): {
  rows: TahsilatOzetUpdateRow[];
  islenenSatir: number;
  tarihBozuk: number;
} {
  const bugun = istanbulIsoGun();
  const ytdBas = `${bugun.slice(0, 4)}-01-01`;
  const gun7 = gunEkle(bugun, -6);
  const gun30 = gunEkle(bugun, -29);

  const byKod = new Map<string, Acc>();
  let tarihBozuk = 0;

  for (const raw of rows) {
    const kod = metin(raw.musteri_kod);
    if (!kod) continue;
    const tarih = parseIslemTarihi(raw.islem_tarihi);
    if (raw.islem_tarihi != null && metin(raw.islem_tarihi) && !tarih) {
      tarihBozuk += 1;
    }
    const durum = metin(raw.odeme_durum);
    const amount = tutar(raw.tutar);
    let acc = byKod.get(kod);
    if (!acc) {
      acc = {
        musteri_kodu: kod,
        sonOdendi: null,
        sonHerhangi: null,
        tahsilat_7g: 0,
        tahsilat_30g: 0,
        tahsilat_ytd: 0,
        odenmemis_tutar: 0,
        odenmemis_adet: 0,
        satir_sayisi: 0,
      };
      byKod.set(kod, acc);
    }
    acc.satir_sayisi += 1;
    if (tarih && (!acc.sonHerhangi || tarih > acc.sonHerhangi)) {
      acc.sonHerhangi = tarih;
    }
    if (tahsilatOdenmediMi(durum)) {
      acc.odenmemis_tutar += amount;
      acc.odenmemis_adet += 1;
      continue;
    }
    if (!tahsilatOdendiMi(durum)) continue;
    if (tarih && (!acc.sonOdendi || tarih > acc.sonOdendi)) {
      acc.sonOdendi = tarih;
    }
    if (tarih && tarih >= gun7) acc.tahsilat_7g += amount;
    if (tarih && tarih >= gun30) acc.tahsilat_30g += amount;
    if (tarih && tarih >= ytdBas) acc.tahsilat_ytd += amount;
  }

  const out: TahsilatOzetUpdateRow[] = [];
  for (const acc of byKod.values()) {
    out.push({
      musteri_kodu: acc.musteri_kodu,
      son_tahsilat_tarihi: acc.sonOdendi ?? acc.sonHerhangi,
      tahsilat_7g: Math.round(acc.tahsilat_7g * 100) / 100,
      tahsilat_30g: Math.round(acc.tahsilat_30g * 100) / 100,
      tahsilat_ytd: Math.round(acc.tahsilat_ytd * 100) / 100,
      odenmemis_tutar: Math.round(acc.odenmemis_tutar * 100) / 100,
      odenmemis_adet: acc.odenmemis_adet,
      satir_sayisi: acc.satir_sayisi,
    });
  }

  return { rows: out, islenenSatir: rows.length, tarihBozuk };
}
