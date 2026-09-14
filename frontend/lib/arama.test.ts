import { aramaAnahtari, aramaEslesiyor, aramaFiltrele } from "./arama";

function fail(msg: string): never {
  throw new Error(msg);
}

function esit(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(`${msg}: ${a} !== ${e}`);
}

function dogru(kosul: boolean, msg: string): void {
  if (!kosul) fail(msg);
}

// --- Türkçe katlama ---------------------------------------------------------
// Asıl tuzak: `toLocaleLowerCase("tr-TR")` doğru İ→i / I→ı yapar ama diakritiği
// korur. Kullanıcı klavyeden ASCII yazınca ("sisli") veri ("Şişli") eşleşmez.
{
  esit(aramaAnahtari("Şişli"), "sisli", "ş ve i");
  esit(aramaAnahtari("SİSLİ"), "sisli", "büyük İ");
  esit(aramaAnahtari("IŞIK"), "isik", "dotless I + ş");
  esit(aramaAnahtari("Işık"), "isik", "karışık");
  esit(aramaAnahtari("Muğla"), "mugla", "yumuşak g");
  esit(aramaAnahtari("ÇİĞLİ"), "cigli", "ç + ğ + İ");
  esit(aramaAnahtari("Üsküdar"), "uskudar", "ü");
  esit(aramaAnahtari("Hakkâri"), "hakkari", "şapkalı a");
  esit(aramaAnahtari("  boşluk  "), "bosluk", "kırpma");
  esit(aramaAnahtari(null), "", "null");
  esit(aramaAnahtari(undefined), "", "undefined");
  esit(aramaAnahtari(12345), "12345", "sayı");
}
console.log("aramaAnahtari ok");

// --- Simetri: iki taraf da aynı anahtara gitmeli ----------------------------
{
  for (const [a, b] of [
    ["Şişli", "sisli"],
    ["İZMİR", "izmir"],
    ["Çiğli", "CIGLI"],
    ["Muğla", "mugla"],
    ["Iğdır", "igdir"],
  ] as const) {
    esit(aramaAnahtari(a), aramaAnahtari(b), `simetri: ${a} ↔ ${b}`);
  }
}
console.log("katlama simetrisi ok");

// --- aramaEslesiyor ---------------------------------------------------------
{
  const alanlar = ["Şişli Pet Market", "MUS0042", "Şişli", "Nakit"];

  dogru(aramaEslesiyor("", alanlar), "boş sorgu her şeyi geçirir");
  dogru(aramaEslesiyor("   ", alanlar), "yalnız boşluk da geçirir");
  dogru(aramaEslesiyor("sisli", alanlar), "ASCII yazım eşleşmeli");
  dogru(aramaEslesiyor("ŞİŞLİ", alanlar), "TR yazım eşleşmeli");
  dogru(aramaEslesiyor("pet", alanlar), "alt dize");
  dogru(aramaEslesiyor("mus0042", alanlar), "müşteri kodu");
  dogru(aramaEslesiyor("MUS0042", alanlar), "kod büyük harf");
  dogru(!aramaEslesiyor("beşiktaş", alanlar), "eşleşmeyen");

  // AND semantiği: her parça ayrı alanda olabilir
  dogru(aramaEslesiyor("pet sisli", alanlar), "iki parça, iki alan");
  dogru(aramaEslesiyor("sisli nakit", alanlar), "ad + ödeme tipi");
  dogru(!aramaEslesiyor("pet kredi", alanlar), "bir parça tutmuyorsa eleme");

  // boş/null alanlar kalabalık yapmamalı
  dogru(aramaEslesiyor("pet", ["Şişli Pet Market", null, undefined, ""]), "null alanlar atlanır");
  dogru(!aramaEslesiyor("pet", [null, undefined, ""]), "tüm alanlar boşsa eşleşmez");
}
console.log("aramaEslesiyor ok");

// --- aramaFiltrele ----------------------------------------------------------
{
  type Satir = { ad: string; kod: string; ilce: string | null };
  const liste: Satir[] = [
    { ad: "Şişli Pet Market", kod: "MUS001", ilce: "Şişli" },
    { ad: "Bornova Veteriner", kod: "MUS002", ilce: "Bornova" },
    { ad: "Çiğli Mama Dünyası", kod: "MUS003", ilce: "Çiğli" },
    { ad: "Kadıköy Pet", kod: "MUS004", ilce: null },
  ];
  const alanlar = (s: Satir) => [s.ad, s.kod, s.ilce];

  // Boş sorgu AYNI referansı döndürmeli — useMemo zinciri boşuna tetiklenmesin
  dogru(aramaFiltrele(liste, "", alanlar) === liste, "boş sorgu aynı referans");
  dogru(aramaFiltrele(liste, "   ", alanlar) === liste, "boşluk da aynı referans");

  esit(aramaFiltrele(liste, "pet", alanlar).map((s) => s.kod), ["MUS001", "MUS004"], "iki eşleşme");
  esit(aramaFiltrele(liste, "cigli", alanlar).map((s) => s.kod), ["MUS003"], "ASCII ile ç/ğ");
  esit(aramaFiltrele(liste, "ÇİĞLİ", alanlar).map((s) => s.kod), ["MUS003"], "TR ile ç/ğ");
  esit(aramaFiltrele(liste, "mus00", alanlar).length, 4, "kod öneki hepsini tutar");
  esit(aramaFiltrele(liste, "yok böyle", alanlar), [], "eşleşme yok");
  // ilce null olan satır ad üzerinden bulunabilmeli
  esit(aramaFiltrele(liste, "kadikoy", alanlar).map((s) => s.kod), ["MUS004"], "null ilçe engel değil");
}
console.log("aramaFiltrele ok");

console.log("TUM TESTLER GECTI");
