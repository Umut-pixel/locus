import { detectDosyaTipi } from "./detect-type";
import { parseDepoSktRaporu, sayimSktCiftleri } from "./parse-depo-skt";

function fail(msg: string): never {
  throw new Error(msg);
}

function esit(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(`${msg}: ${a} !== ${e}`);
}

/** "PATİGO DEPO SKT BİLGİSİ.xlsx" başlıkları — SheetJS tekrarları _1/_2 ile ayırıyor. */
const BASLIKLAR = [
  "Depo Kodu",
  "Depo Adı",
  "Ürün Kodu",
  "Grup",
  "Ürün",
  "DEPO STOK",
  "SAYIM",
  "SKT",
  "SAYIM_1",
  "SKT_1",
  "SAYIM_2",
  "SKT_2",
];

// --- Dosya tipi: föy fabrika imzasını da taşıyor ---------------------------
// 2026-09-06'da canlıda olan hata buydu — föy (SKT* + Ürün) kuralına takılıp
// fabrika parser'ına düştü, DEPO STOK ve SAYIM kolonları sessizce çöpe gitti.
{
  esit(detectDosyaTipi(BASLIKLAR), "DepoSktSayimRaporu", "föy kendi tipine gider");
  // Fabrika dosyası (DEPO STOK yok) hâlâ fabrika olarak tanınmalı.
  esit(
    detectDosyaTipi(["Belge Tip", "Matbu No", "Ürün", "Miktar", "SKT", "SKT_1"]),
    "FabrikaSktRaporu",
    "fabrika dosyası bozulmadı"
  );
}
console.log("detectDosyaTipi ok");

// --- SAYIM ↔ SKT eşleşmesi KOLON SIRASINDAN --------------------------------
{
  esit(
    sayimSktCiftleri(BASLIKLAR),
    [
      { sayimKey: "SAYIM", sktKey: "SKT" },
      { sayimKey: "SAYIM_1", sktKey: "SKT_1" },
      { sayimKey: "SAYIM_2", sktKey: "SKT_2" },
    ],
    "üç çift sırayla eşleşir"
  );
  // Sondaki eşsiz SAYIM kaybolmamalı: adet var, SKT yazılmamış.
  esit(
    sayimSktCiftleri(["Ürün", "SAYIM", "SKT", "SAYIM_1"]),
    [
      { sayimKey: "SAYIM", sktKey: "SKT" },
      { sayimKey: "SAYIM_1", sktKey: null },
    ],
    "eşsiz SAYIM tek başına döner"
  );
  // Sayımsız SKT kolonu da geçerli.
  esit(
    sayimSktCiftleri(["Ürün", "SKT", "SAYIM"]),
    [
      { sayimKey: null, sktKey: "SKT" },
      { sayimKey: "SAYIM", sktKey: null },
    ],
    "sayımsız SKT eşleşir"
  );
}
console.log("sayimSktCiftleri ok");

// --- Parse: gerçek föyden alınmış satırlar ---------------------------------
{
  const rows: Record<string, unknown>[] = [
    // Tek partili, ERP ile sayım TUTUYOR.
    {
      "Depo Kodu": 62,
      "Depo Adı": "ANA DEPO",
      "Ürün Kodu": "13202047",
      Grup: "SIGNATURE",
      Ürün: "Signature Kuzulu Yavru Köpek Orta ve Büyük Irk - 12 kg",
      "DEPO STOK": 16,
      SAYIM: 16,
      SKT: 46673, // 2027-10-13
      SAYIM_1: null,
      SKT_1: null,
      SAYIM_2: null,
      SKT_2: null,
    },
    // Üç partili, ERP 153 · sayım 165 → +12 fark.
    {
      "Depo Kodu": 62,
      "Depo Adı": "ANA DEPO",
      "Ürün Kodu": "13202046",
      Grup: "SIGNATURE",
      Ürün: "Signature Kuzulu Yetişkin Köpek Küçük Irk - 12 kg",
      "DEPO STOK": 153,
      SAYIM: 75,
      SKT: 46991,
      SAYIM_1: 30,
      SKT_1: 46837,
      SAYIM_2: 60,
      SKT_2: 46803,
    },
    // Hiç sayılmamış: bütün hücreler boş/sıfır. ERP 0 diyor.
    {
      "Depo Kodu": 62,
      "Depo Adı": "ANA DEPO",
      "Ürün Kodu": "10000001",
      Grup: "FRESH PATY",
      Ürün: "Fresh Paty Kedi Kumu Kokusuz - 6 lt",
      "DEPO STOK": 0,
      SAYIM: 0,
      SKT: null,
      SAYIM_1: 0,
      SKT_1: null,
      SAYIM_2: null,
      SKT_2: null,
    },
    // ERP 0 ama rafta 24 adet var — SKT yazılmamış.
    {
      "Depo Kodu": 62,
      "Depo Adı": "ANA DEPO",
      "Ürün Kodu": "10000002",
      Grup: "FRESH PATY",
      Ürün: "Fresh Paty Kedi Kumu Aloe Vera Kokulu - 6 lt",
      "DEPO STOK": 0,
      SAYIM: 24,
      SKT: null,
      SAYIM_1: 0,
      SKT_1: null,
      SAYIM_2: null,
      SKT_2: null,
    },
  ];

  const p = parseDepoSktRaporu(rows);

  esit(p.islenenSatir, 4, "dört ürün satırı");
  // 1 + 3 + 1 (kayıt yok) + 1 = 6 kayıt.
  esit(p.rows.length, 6, "parti başına bir kayıt");
  esit(p.depoStokToplam, 169, "ERP toplamı");
  esit(p.sayimToplam, 205, "fiziksel sayım toplamı");
  esit(p.sayimlar, { tarihli: 4, cozulemedi: 0, devir: 0, kayit_yok: 2 }, "durum dağılımı");
  esit(p.sayimsizUrun, 1, "hiç sayılmamış ürün");
  esit(p.cokPartiliUrun, 1, "çok partili ürün");
  esit(p.farkliUrunSayisi, 2, "ERP ile tutmayan ürün");
  esit(
    p.farklar.map((f) => [f.urunKodu, f.fark]),
    [
      ["10000002", 24],
      ["13202046", 12],
    ],
    "farklar büyükten küçüğe"
  );

  // Ürün kodu dosyadan geliyor — ad eşleştirmesine gerek yok.
  esit(p.rows[0]!.urun_kodu, "13202047", "kod doğrudan okunur");
  esit(p.rows[0]!.kaynak, "depo_sayim", "kaynak işaretli");
  esit(p.rows[0]!.depo_stok, 16, "ERP rakamı satıra yazılır");
  esit(p.rows[0]!.parti_miktar, 16, "parti adedi yazılır");
  esit(p.rows[0]!.skt_tarihi, "2027-10-13", "seri numarası UTC ile çözülür");
  // Fabrika kaynağına ait alanlar bu dosyada YOK — uydurulmuyor.
  esit(p.rows[0]!.islem_tarihi, null, "alış tarihi yok");
  esit(p.rows[0]!.satir_miktar, null, "kalem miktarı yok");
  esit(p.rows[0]!.matbu_no, null, "matbu no yok");

  // Çok partili üründe HER partinin adedi ayrı ayrı biliniyor — fabrika
  // dosyasının çözemediği tam olarak buydu.
  const cok = p.rows.filter((r) => r.urun_kodu === "13202046");
  esit(cok.length, 3, "üç parti");
  esit(
    cok.map((r) => [r.skt_tarihi, r.parti_miktar]),
    [
      ["2028-08-26", 75],
      ["2028-03-25", 30],
      ["2028-02-20", 60],
    ],
    "her parti kendi adediyle"
  );
  esit(
    cok.every((r) => r.tek_parti === false),
    true,
    "çok partili işaretli"
  );

  // Sayılmayan ürün tek kayıt_yok satırı bırakır: "sıfır sayıldı" değil.
  const bos = p.rows.filter((r) => r.urun_kodu === "10000001");
  esit(bos.length, 1, "sayılmamış ürün tek satır");
  esit(bos[0]!.durum, "kayit_yok", "durum kayıt yok");
  esit(bos[0]!.parti_miktar, null, "adet yok");

  // SKT'siz ama adetli parti kaybolmamalı.
  const sktsiz = p.rows.filter((r) => r.urun_kodu === "10000002");
  esit(sktsiz.length, 1, "tek parti");
  esit(sktsiz[0]!.durum, "kayit_yok", "SKT yok");
  esit(sktsiz[0]!.parti_miktar, 24, "adet korunur");
}
console.log("parseDepoSktRaporu ok");

console.log("parse-depo-skt: tüm testler geçti");
