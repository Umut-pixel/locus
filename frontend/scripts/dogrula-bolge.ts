/**
 * Bölge dağıtımı uçtan uca doğrulama — gerçek sevkiyat günlerini geri oynatır.
 *
 * Bekleyen sipariş havuzu bugün 4 durak; motoru anlamlı bir yükle sınamanın
 * tek yolu geçmiş bir günün gerçek sevkiyatını yeniden dağıtmak. Sevkiyat
 * küpünden (5130) o günün müşterileri ve ağırlıkları çekilir, üç strateji de
 * aynı veriyle çalıştırılır.
 *
 * Kabul ölçütü: `bolge`, `sweep`'e göre bölünmüş bölgeyi ve max yayılımı
 * DÜŞÜRMELİ, havuzda kalanı ARTIRMAMALI.
 *
 *   npm run dogrula:bolge
 *   npm run dogrula:bolge -- 2026-08-18
 */
import { createClient } from "@supabase/supabase-js";

import { DEPOT } from "../lib/depot";
import { filoSec, type Arac, type Durak, type Sofor } from "../lib/rota/atama";
import { planMetrigi, planOlustur } from "../lib/rota/planla";
import type { Strateji } from "../lib/rota/tercihler";
import { araceCevir, soforeCevir, type AracRaw, type SoforRaw } from "../lib/rota/veri";

/**
 * Sevkiyat küpü çuval taşımıyor, yalnız ağırlık (gram). Ortalama çuval
 * 14,56 kg — `v_musteri_bekleyen_yuk`'teki ölçüm. Yaklaşık; strateji
 * KARŞILAŞTIRMASI için yeterli, mutlak doluluk iddiası için değil.
 */
const CUVAL_KG = 14.56;

/** Ölçülen tıkanma günleri: ay sonu toplu kesimler hariç, 20-60 durak. */
const VARSAYILAN_GUNLER = ["2025-12-22", "2026-01-21", "2026-08-18"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / anahtar yok. .env.local yüklendi mi?");
  process.exit(1);
}
const db = createClient(url, key);

interface SevkiyatSatiri {
  musteri_kodu: string;
  musteri_unvani: string | null;
  belge_tarihi: string | null;
  agirlik: string | number | null;
}

interface MusteriSatiri {
  musteri_kodu: string;
  sehir: string | null;
  ilce: string | null;
  lat: number | null;
  lon: number | null;
}

function sayi(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function tumSayfalar<T>(
  sec: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const hepsi: T[] = [];
  const adim = 1000;
  for (let from = 0; ; from += adim) {
    const { data, error } = await sec(from, from + adim - 1);
    if (error) throw new Error(error.message);
    const parca = data ?? [];
    hepsi.push(...parca);
    if (parca.length < adim) break;
  }
  return hepsi;
}

async function gununDuraklari(gun: string): Promise<Durak[]> {
  // belge_tarihi metin ve gg.aa.yyyy — SQL'de cast edilemiyor (bozuk değerler
  // var), o yüzden hepsini çekip burada süzüyoruz.
  const [gg, aa, yyyy] = [gun.slice(8, 10), gun.slice(5, 7), gun.slice(0, 4)];
  const hedef = `${gg}.${aa}.${yyyy}`;

  const sevkiyat = await tumSayfalar<SevkiyatSatiri>((from, to) =>
    db
      .from("v_panorama_sevkiyat_raporu_kup_guncel")
      .select("musteri_kodu,musteri_unvani,belge_tarihi,agirlik")
      .eq("belge_tarihi", hedef)
      .range(from, to)
  );
  if (sevkiyat.length === 0) return [];

  const kodlar = [...new Set(sevkiyat.map((s) => s.musteri_kodu))];
  const musteriler = await tumSayfalar<MusteriSatiri>((from, to) =>
    db
      .from("musteriler")
      .select("musteri_kodu,sehir,ilce,lat,lon")
      .in("musteri_kodu", kodlar)
      .range(from, to)
  );
  const harita = new Map(musteriler.map((m) => [m.musteri_kodu, m]));

  const toplam = new Map<string, { unvan: string; gram: number }>();
  for (const s of sevkiyat) {
    const mevcut = toplam.get(s.musteri_kodu) ?? {
      unvan: s.musteri_unvani ?? s.musteri_kodu,
      gram: 0,
    };
    mevcut.gram += sayi(s.agirlik);
    toplam.set(s.musteri_kodu, mevcut);
  }

  return [...toplam.entries()].map(([kod, v]) => {
    const m = harita.get(kod);
    const kg = v.gram / 1000;
    return {
      musteriKodu: kod,
      unvan: v.unvan,
      lat: m?.lat ?? null,
      lon: m?.lon ?? null,
      kg,
      cuvalEsdeger: kg / CUVAL_KG,
      olcusuzSatir: 0,
      sehir: m?.sehir ?? null,
      ilce: m?.ilce ?? null,
    } satisfies Durak;
  });
}

async function filoCek(): Promise<{ araclar: Arac[]; soforler: Sofor[] }> {
  const [{ data: a }, { data: s }] = await Promise.all([
    db.from("araclar").select("*").eq("aktif", true).order("sira"),
    db.from("soforler").select("*").eq("aktif", true).order("sira"),
  ]);
  return {
    araclar: ((a ?? []) as AracRaw[]).map(araceCevir),
    soforler: ((s ?? []) as SoforRaw[]).map(soforeCevir),
  };
}

/** Bir araçtaki farklı şehirler ve mesafe uçları — "kim kiminle gidiyor". */
function aracOzeti(duraklar: Durak[]): string {
  const sehirler = [
    ...new Set(duraklar.map((d) => d.sehir?.trim() || "?")),
  ].sort();
  return sehirler.join(", ");
}

async function main() {
  const gunler = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const hedefler = gunler.length > 0 ? gunler : VARSAYILAN_GUNLER;

  const { araclar, soforler } = await filoCek();
  console.log(
    `Filo: ${araclar.map((a) => `${a.ad} (${a.cuvalKapasite}ç/${a.maxKg}kg)`).join(" · ")}`
  );
  console.log(`Kadro: ${soforler.map((s) => `${s.ad}/${s.ehliyetSinifi}`).join(" · ")}\n`);

  const stratejiler: Strateji[] = ["bolge", "sweep", "ffd"];
  let basarisiz = 0;

  for (const gun of hedefler) {
    const duraklar = await gununDuraklari(gun);
    if (duraklar.length === 0) {
      console.log(`${gun}: sevkiyat kaydı yok, atlandı\n`);
      continue;
    }

    const filo = filoSec(duraklar, araclar, soforler);
    const cikan = filo.secilen.length > 0 ? filo.secilen : araclar;
    const toplamKg = duraklar.reduce((t, d) => t + d.kg, 0);

    console.log(
      `${gun} — ${duraklar.length} durak, ${Math.round(toplamKg).toLocaleString("tr-TR")} kg, ` +
        `filo: ${cikan.map((a) => a.kod).join("+")}`
    );
    console.log(
      "  strateji | araç | doluluk | bölünmüş bölge | max yayılım | havuz |   km"
    );

    const olcumler: Record<string, ReturnType<typeof planMetrigi>> = {};
    for (const strateji of stratejiler) {
      const sonuc = planOlustur({
        duraklar,
        araclar: cikan,
        tumFilo: araclar,
        depo: DEPOT,
        strateji,
        uzakAyir: false,
      });
      const m = planMetrigi(sonuc);
      olcumler[strateji] = m;
      console.log(
        `  ${strateji.padEnd(8)} | ${String(m.aracSayisi).padStart(4)} | ` +
          `${m.ortDoluluk.toFixed(0).padStart(6)}% | ${String(m.bolunmusBolge).padStart(14)} | ` +
          `${m.maxYayilimKm.toFixed(0).padStart(8)} km | ${String(m.havuzdaKalan).padStart(5)} | ` +
          `${m.toplamKm.toFixed(0).padStart(5)}`
      );
      if (strateji === "bolge") {
        for (const y of sonuc.yukler) {
          if (y.duraklar.length === 0) continue;
          console.log(
            `      ${y.arac.kod.padEnd(9)} ${String(y.duraklar.length).padStart(3)} durak · ${aracOzeti(y.duraklar)}`
          );
        }
      }
    }

    const b = olcumler.bolge!;
    const s = olcumler.sweep!;
    const sorunlar: string[] = [];
    if (b.bolunmusBolge > s.bolunmusBolge) sorunlar.push("bölünmüş bölge arttı");
    if (b.maxYayilimKm > s.maxYayilimKm + 1) sorunlar.push("max yayılım arttı");
    if (b.havuzdaKalan > s.havuzdaKalan) sorunlar.push("havuzda kalan arttı");
    if (sorunlar.length > 0) {
      console.log(`  ✗ ${sorunlar.join(", ")}`);
      basarisiz++;
    } else {
      console.log("  ✓ bölge stratejisi sweep'ten kötü değil");
    }
    console.log();
  }

  if (basarisiz > 0) {
    console.error(`${basarisiz} günde kabul ölçütü tutmadı.`);
    process.exit(1);
  }
  console.log("Tüm günlerde bölge stratejisi kabul ölçütünü karşıladı.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
