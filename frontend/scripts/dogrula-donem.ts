/**
 * Dönem filtresi uçtan uca doğrulama — canlı Supabase'e karşı.
 *
 * useFinansalRaporu'nun tarih mantığının AYNISINI (parseIslemTarihi +
 * donemdeMi + BrutTutar toplamı) gerçek satırlar üzerinde çalıştırır ve
 * SQL'den bağımsız olarak ölçülmüş beklenen değerlerle karşılaştırır.
 *
 * Tarayıcı önizlemesi başka bir dev server tarafından bloke olduğunda
 * sayısal doğrulamanın yeri burası — ekran görüntüsünden daha güçlü, çünkü
 * rakamın kendisini kontrol ediyor.
 *
 *   npx tsx scripts/dogrula-donem.ts
 */
import { createClient } from "@supabase/supabase-js";

import { donemAraligi, donemdeMi, oncekiDonem } from "../lib/donem";
import { KEEP_BELGE_TIP, parseIslemTarihi } from "../lib/import/parse-belge-detay";
import { sayiyaCevir } from "../lib/import/utils";
import { tahsilatOdendiMi } from "../lib/sync/parse-tahsilat";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY yok — 'npm run sync-env' çalıştırın.");
}
const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

// Şikayetin yaşandığı gün; testin zamana bağlı kaymaması için sabit.
const NOW = new Date("2026-09-02T10:44:00Z");

function fail(msg: string): never {
  throw new Error(msg);
}
function tl(n: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n);
}

interface BelgeRow {
  islem_tarihi: string | null;
  brut_tutar: string | null;
  belge_tip: string | null;
}

async function tumSatirlar(): Promise<BelgeRow[]> {
  const hepsi: BelgeRow[] = [];
  const boy = 1000;
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase
      .from("v_panorama_belge_detay_raporu_guncel")
      .select("islem_tarihi,brut_tutar,belge_tip")
      .in("belge_tip", [...KEEP_BELGE_TIP])
      .order("id", { ascending: true })
      .range(i * boy, i * boy + boy - 1);
    if (error) fail(`Supabase: ${error.message}`);
    const batch = (data ?? []) as BelgeRow[];
    hepsi.push(...batch);
    if (batch.length < boy) break;
  }
  return hepsi;
}

/** useFinansalRaporu'daki `aylikNetCiro` hesabının birebir aynısı. */
function donemCirosu(rows: BelgeRow[], aralik: ReturnType<typeof donemAraligi>): number {
  let toplam = 0;
  for (const r of rows) {
    if (!donemdeMi(parseIslemTarihi(r.islem_tarihi), aralik)) continue;
    toplam += sayiyaCevir(r.brut_tutar) ?? 0;
  }
  return Math.round(toplam);
}

async function main() {
  const rows = await tumSatirlar();
  console.log(`belge_detay satır: ${rows.length}`);
  if (rows.length === 0) fail("Hiç satır gelmedi — anon key / RLS kontrol edin.");

  // 1. Tam çekim: 15.000 tavanına takılmadı mı?
  if (rows.length >= 15000) fail("Satır sayısı tavana dayandı — sayfalama tavanı yükseltilmeli.");

  // 2. GEÇEN AY — şikayetin doğrudan testi.
  //    SQL ile bağımsız ölçüm (2026-09-02): 1.132 satır / 9.211.636 TL brüt.
  const gecenAy = donemAraligi("gecenAy", { now: NOW });
  const gecenAyCiro = donemCirosu(rows, gecenAy);
  const gecenAySatir = rows.filter((r) =>
    donemdeMi(parseIslemTarihi(r.islem_tarihi), gecenAy)
  ).length;
  console.log(`geçen ay (${gecenAy.etiket}): ${gecenAySatir} satır / ${tl(gecenAyCiro)} TL`);
  if (gecenAySatir !== 1132) fail(`geçen ay satır 1132 bekleniyordu, ${gecenAySatir} geldi`);
  if (Math.abs(gecenAyCiro - 9211636) > 2) {
    fail(`geçen ay brüt ciro 9.211.636 TL bekleniyordu, ${tl(gecenAyCiro)} geldi`);
  }

  // 3. BU AY (MTD) — eskiden ekranı boşaltan pencere. Boş olması SORUN DEĞİL;
  //    sorun, geçen aya dönmenin yolu olmamasıydı. (2) bunu kanıtladı.
  const buAy = donemAraligi("buAy", { now: NOW });
  console.log(`bu ay  (${buAy.etiket}): ${tl(donemCirosu(rows, buAy))} TL`);

  // 4. Karşılaştırma: "bu ay"ın önceki dönemi, geçen ayın AYNI dilimi olmalı
  //    (tam ay değil) — 2 günlük MTD'yi 31 günle kıyaslamak yanıltıcı olurdu.
  const oncekiBuAy = oncekiDonem(buAy);
  if (oncekiBuAy.bas !== "2026-08-01" || oncekiBuAy.bitisHaric !== "2026-08-03") {
    fail(`bu ay karşılaştırması 2026-08-01..08-03 olmalı, ${oncekiBuAy.bas}..${oncekiBuAy.bitisHaric}`);
  }
  console.log(`bu ay karşılaştırma penceresi: ${oncekiBuAy.bas} → ${oncekiBuAy.bitisHaric} (hariç)`);

  // 5. VARSAYILAN "son 30 gün" — ay dönümünde ASLA boş olmamalı.
  const son30 = donemAraligi("son30", { now: NOW });
  const son30Ciro = donemCirosu(rows, son30);
  console.log(`son 30 gün: ${tl(son30Ciro)} TL`);
  if (son30Ciro <= 0) fail("son 30 gün boş çıktı — varsayılan dönem ay dönümünde boşalmamalı");

  // 6. Metin tarih tuzağı: ham metinle ISO kıyası hâlâ yanlış mı? Bu, normalize
  //    edilmiş `_d` kolonlarına neden ihtiyaç olduğunun kanıtı.
  const hamKapali = rows.filter(
    (r) => (r.islem_tarihi ?? "") >= "2026-08-01" && (r.islem_tarihi ?? "") <= "2026-08-31"
  ).length;
  if (hamKapali !== 0) {
    fail(`ham metin kapalı aralık 0 satır vermeliydi (nokta > tire), ${hamKapali} geldi`);
  }
  console.log(
    `ham metin kapalı aralık ('2026-08-01'..'2026-08-31'): ${hamKapali} satır ` +
      `— parse edilmiş yol ise ${gecenAySatir} satır buluyor`
  );

  // 7. KPI TANIM CAKISMASI (Finansal / Tahsilat "Donem tahsilati").
  //    Eskiden Finansal ay penceresiyle, Tahsilat FILTRESIZ topluyordu; iki
  //    sayfa ayni etiketle farkli rakam gosteriyordu. Artik ikisi de ayni
  //    donem sozlesmesini kullaniyor.
  const tahRows: {
    islem_tarihi: string | null;
    tutar: string | null;
    odeme_durum: string | null;
  }[] = [];
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase
      .from("v_panorama_tahsilat_raporu_guncel")
      .select("islem_tarihi,tutar,odeme_durum")
      .order("id", { ascending: true })
      .range(i * 1000, i * 1000 + 999);
    if (error) fail(`tahsilat: ${error.message}`);
    const batch = data ?? [];
    tahRows.push(...batch);
    if (batch.length < 1000) break;
  }
  console.log(`tahsilat satir: ${tahRows.length}`);

  const tahsilatDonemde = (a: ReturnType<typeof donemAraligi>) => {
    let t = 0;
    for (const r of tahRows) {
      if (!tahsilatOdendiMi(r.odeme_durum)) continue;
      if (!donemdeMi(parseIslemTarihi(r.islem_tarihi), a)) continue;
      t += sayiyaCevir(r.tutar) ?? 0;
    }
    return Math.round(t);
  };

  for (const preset of ["son30", "gecenAy", "buAy"] as const) {
    const a = donemAraligi(preset, { now: NOW });
    console.log(`donem tahsilati (${preset}): ${tl(tahsilatDonemde(a))} TL`);
  }

  // 8. Tahsilat metin formati DD/MM/YYYY -- leksikografik olarak siralanabilir
  //    DEGIL. Parse edilmis yol calisiyor mu? Gecen ay dolu olmali.
  const tahGecenAy = tahsilatDonemde(donemAraligi("gecenAy", { now: NOW }));
  if (tahGecenAy <= 0) fail("tahsilat gecen ay bos -- DD/MM/YYYY parse yolu bozuk");

  //    Ham metinle ayni kapali aralik: DD/MM/YYYY'de anlamsiz sonuc verir.
  const tahHam = tahRows.filter(
    (r) => (r.islem_tarihi ?? "") >= "01/08/2026" && (r.islem_tarihi ?? "") <= "31/08/2026"
  ).length;
  const tahParse = tahRows.filter((r) =>
    donemdeMi(parseIslemTarihi(r.islem_tarihi), donemAraligi("gecenAy", { now: NOW }))
  ).length;
  console.log(
    `tahsilat ham metin araligi: ${tahHam} satir -- parse edilmis yol: ${tahParse} satir`
  );
  if (tahHam === tahParse) fail("ham metin ile parse yolu ayni cikti -- beklenmedik");

  console.log("\nTUM DONEM DOGRULAMALARI GECTI");
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
