import {
  araligiEtiketle,
  ayEkle,
  degisimOrani,
  donemAraligi,
  donemdeMi,
  gunEkle,
  gunSayisi,
  istanbulIsoGun,
  karsilastirmaKapsami,
  oncekiDonem,
} from "./donem";

function fail(msg: string): never {
  throw new Error(msg);
}

function esit(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(`${msg}: ${a} !== ${e}`);
}

// --- İstanbul takvim günü (UTC ile karıştırma tuzağı) ----------------------
// Türkiye yıl boyu UTC+3. UTC 21:30, İstanbul'da ERTESİ gün 00:30'dur;
// toISOString().slice(0,10) burada bir gün geri kalıyordu.
{
  esit(istanbulIsoGun(new Date("2026-08-31T21:30:00Z")), "2026-09-01", "TR 00:30 ertesi gün");
  esit(istanbulIsoGun(new Date("2026-09-01T20:59:59Z")), "2026-09-01", "TR 23:59 aynı gün");
  esit(istanbulIsoGun(new Date("2026-09-01T21:00:00Z")), "2026-09-02", "TR 00:00 gün döner");
  // Ay dönümü gecesi: kullanıcının şikayet ettiği an.
  esit(istanbulIsoGun(new Date("2026-08-31T21:25:58Z")), "2026-09-01", "ay dönümü 00:25 TR");
}
console.log("istanbulIsoGun ok");

// --- Gün / ay aritmetiği ---------------------------------------------------
{
  esit(gunEkle("2026-09-02", -30), "2026-08-03", "30 gün geri");
  esit(gunEkle("2026-01-01", -1), "2025-12-31", "yıl sınırı geri");
  esit(gunEkle("2026-12-31", 1), "2027-01-01", "yıl sınırı ileri");
  esit(gunEkle("2024-02-28", 1), "2024-02-29", "artık yıl");

  esit(ayEkle("2026-09-01", -1), "2026-08-01", "bir ay geri");
  esit(ayEkle("2026-01-15", -1), "2025-12-15", "yıl sınırı ay geri");
  // Hedef ayda o gün yoksa ayın son gününe kırpılır.
  esit(ayEkle("2026-03-31", -1), "2026-02-28", "31 Mart -1 ay -> 28 Şubat");
  esit(ayEkle("2024-03-31", -1), "2024-02-29", "artık yılda 29 Şubat");
}
console.log("gün/ay aritmetiği ok");

// --- Preset aralıkları -----------------------------------------------------
// Referans an: 2 Eylül 2026, 13:44 TR (kullanıcının şikayet ettiği gün).
const now = new Date("2026-09-02T10:44:00Z");

{
  const a = donemAraligi("bugun", { now });
  esit([a.bas, a.bitisHaric], ["2026-09-02", "2026-09-03"], "bugün");

  const d = donemAraligi("dun", { now });
  esit([d.bas, d.bitisHaric], ["2026-09-01", "2026-09-02"], "dün");

  // "Son N gün" bugünü de kapsar -> tam N takvim günü.
  const s7 = donemAraligi("son7", { now });
  esit([s7.bas, s7.bitisHaric], ["2026-08-27", "2026-09-03"], "son 7 gün");
  esit(gunSayisi(s7), 7, "son7 gün sayısı");

  const s30 = donemAraligi("son30", { now });
  esit([s30.bas, s30.bitisHaric], ["2026-08-04", "2026-09-03"], "son 30 gün");
  esit(gunSayisi(s30), 30, "son30 gün sayısı");

  const s90 = donemAraligi("son90", { now });
  esit(gunSayisi(s90), 90, "son90 gün sayısı");

  const buAy = donemAraligi("buAy", { now });
  esit([buAy.bas, buAy.bitisHaric], ["2026-09-01", "2026-09-03"], "bu ay (MTD)");

  const gecenAy = donemAraligi("gecenAy", { now });
  esit([gecenAy.bas, gecenAy.bitisHaric], ["2026-08-01", "2026-09-01"], "geçen ay");
  esit(gunSayisi(gecenAy), 31, "Ağustos 31 gün");

  const buYil = donemAraligi("buYil", { now });
  esit([buYil.bas, buYil.bitisHaric], ["2026-01-01", "2026-09-03"], "bu yıl");
}
console.log("preset aralıkları ok");

// --- KRİTİK: 30 Ağustos siparişi hangi dönemlerde görünüyor? ---------------
// Şikayetin özü. Varsayılan "son 30 gün" onu KAPSAMALI; "bu ay" kapsamamalı
// ama "geçen ay" ile erişilebilir olmalı.
{
  const ag30 = "2026-08-30";
  if (!donemdeMi(ag30, donemAraligi("son30", { now }))) fail("son30, 30 Ağustos'u kapsamalı");
  if (!donemdeMi(ag30, donemAraligi("son7", { now }))) fail("son7, 30 Ağustos'u kapsamalı");
  if (!donemdeMi(ag30, donemAraligi("gecenAy", { now }))) fail("geçen ay, 30 Ağustos'u kapsamalı");
  if (!donemdeMi(ag30, donemAraligi("buYil", { now }))) fail("bu yıl, 30 Ağustos'u kapsamalı");
  if (donemdeMi(ag30, donemAraligi("buAy", { now }))) fail("bu ay, 30 Ağustos'u KAPSAMAMALI");

  // Özel aralık, tek gün: 30.08.2026 – 30.08.2026
  const ozel = donemAraligi("ozel", { now, ozelBas: ag30, ozelBitisDahil: ag30 });
  esit([ozel.bas, ozel.bitisHaric], ["2026-08-30", "2026-08-31"], "özel tek gün");
  if (!donemdeMi(ag30, ozel)) fail("özel tek gün 30 Ağustos'u kapsamalı");
  if (donemdeMi("2026-08-31", ozel)) fail("özel tek gün 31 Ağustos'u kapsamamalı");
}
console.log("30 Ağustos kapsama ok");

// --- Yarı açık sözleşme: ardışık dönemler birleşir, çakışmaz --------------
{
  const gecenAy = donemAraligi("gecenAy", { now });
  const buAy = donemAraligi("buAy", { now });
  esit(gecenAy.bitisHaric, buAy.bas, "geçen ay bitişi = bu ay başlangıcı");
  if (donemdeMi("2026-08-31", buAy)) fail("31 Ağustos bu aya girmemeli");
  if (!donemdeMi("2026-08-31", gecenAy)) fail("31 Ağustos geçen aya girmeli");
  if (donemdeMi("2026-09-01", gecenAy)) fail("1 Eylül geçen aya girmemeli");
}
console.log("yarı açık sınır ok");

// --- Özel aralık: ters seçim düzeltilir, bitiş DAHİL yorumlanır -----------
{
  const ters = donemAraligi("ozel", {
    now,
    ozelBas: "2026-08-31",
    ozelBitisDahil: "2026-08-01",
  });
  esit([ters.bas, ters.bitisHaric], ["2026-08-01", "2026-09-01"], "ters seçim düzeltilir");
  esit(gunSayisi(ters), 31, "ters seçim gün sayısı");
}
console.log("özel aralık ok");

// --- Önceki dönem ----------------------------------------------------------
{
  // Gün sayısı tabanlı: eşit uzunlukta, hemen öncesi, çakışmasız.
  const s30 = donemAraligi("son30", { now });
  const o30 = oncekiDonem(s30);
  esit([o30.bas, o30.bitisHaric], ["2026-07-05", "2026-08-04"], "son30 önceki");
  esit(gunSayisi(o30), gunSayisi(s30), "önceki dönem eşit uzunluk");
  esit(o30.bitisHaric, s30.bas, "önceki dönem hemen bitişik");

  // Bu ay (MTD) -> geçen ayın AYNI dilimi (2 gün / 2 gün), tam ay değil.
  const buAy = donemAraligi("buAy", { now });
  const oBuAy = oncekiDonem(buAy);
  esit([oBuAy.bas, oBuAy.bitisHaric], ["2026-08-01", "2026-08-03"], "bu ay önceki = MTD dilimi");
  esit(gunSayisi(oBuAy), gunSayisi(buAy), "MTD karşılaştırması adil");

  // Geçen ay -> ondan önceki tam ay.
  const oGecenAy = oncekiDonem(donemAraligi("gecenAy", { now }));
  esit([oGecenAy.bas, oGecenAy.bitisHaric], ["2026-07-01", "2026-08-01"], "geçen ay önceki");

  // Bu yıl -> geçen yılın aynı dilimi.
  const oBuYil = oncekiDonem(donemAraligi("buYil", { now }));
  esit([oBuYil.bas, oBuYil.bitisHaric], ["2025-01-01", "2025-09-03"], "bu yıl önceki");
}
console.log("önceki dönem ok");

// --- Karşılaştırma kapsamı (tek çekim) -------------------------------------
{
  const s30 = donemAraligi("son30", { now });
  const kapsam = karsilastirmaKapsami(s30);
  esit([kapsam.bas, kapsam.bitisHaric], ["2026-07-05", "2026-09-03"], "kapsam iki dönemi kapsar");
  esit(
    gunSayisi(kapsam),
    gunSayisi(s30) + gunSayisi(oncekiDonem(s30)),
    "kapsam = iki dönemin toplamı"
  );
}
console.log("karşılaştırma kapsamı ok");

// --- Değişim oranı ---------------------------------------------------------
{
  esit(degisimOrani(150, 100), 0.5, "+%50");
  esit(degisimOrani(50, 100), -0.5, "-%50");
  esit(degisimOrani(100, 0), null, "sıfır bölen -> null");
  esit(degisimOrani(0, 100), -1, "sıfıra düşüş");
  // Negatif taban (iade ağırlıklı dönem) mutlak değere bölünür.
  esit(degisimOrani(-50, -100), 0.5, "negatif taban");
}
console.log("değişim oranı ok");

// --- Etiketler -------------------------------------------------------------
{
  esit(araligiEtiketle("2026-08-30", "2026-08-31"), "30 Ağu 2026", "tek gün etiketi");
  esit(araligiEtiketle("2026-08-04", "2026-09-03"), "4 Ağu – 2 Eyl 2026", "aynı yıl aralığı");
  esit(
    araligiEtiketle("2025-12-30", "2026-01-03"),
    "30 Ara 2025 – 2 Oca 2026",
    "yıl aşan aralık"
  );
  esit(donemAraligi("gecenAy", { now }).etiket, "Ağustos 2026", "geçen ay etiketi");
}
console.log("etiketler ok");

console.log("\nTUM DONEM TESTLERI GECTI");
