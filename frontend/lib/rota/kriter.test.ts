/**
 * Plan karnesi testleri — `npx tsx lib/rota/kriter.test.ts`
 *
 * Karnenin işi karar vermek değil, kararı GÖRÜNÜR kılmak. Bu yüzden testler
 * eşiklerden çok "hangi sinyal hangi satıra düşüyor" ve "kaynak dürüst mü"
 * sorularını kontrol ediyor.
 */

import assert from "node:assert/strict";

import type { Arac, AracYuku, FiloSecimi, Sofor, YerlesmeyenDurak } from "./atama";
import { dolulukHesapla } from "./atama";
import type { RotaBilgisi } from "./google-routes";
import {
  karneOzeti,
  kriterleriHesapla,
  type Kriter,
  type KriterAnahtari,
  type KriterGirdisi,
} from "./kriter";
import type { PlanMetrigi } from "./planla";
import type { Durak } from "./atama";

// --- sabitler ---------------------------------------------------------------

const NPR: Arac = {
  kod: "npr10",
  ad: "Isuzu NPR 10",
  cuvalKapasite: 360,
  maxKg: 6600,
  maxKgTeyitli: true,
  ehliyetSinifi: "C",
  takograf: true,
};

const KANGOO: Arac = {
  kod: "kangoo",
  ad: "Renault Kangoo",
  cuvalKapasite: 60,
  maxKg: 800,
  maxKgTeyitli: true,
  ehliyetSinifi: "B",
  takograf: false,
};

const MEHMET: Sofor = { kod: "mehmet", ad: "Mehmet Baylav", ehliyetSinifi: "C" };

function durak(kod: string, cuval: number, kg: number): Durak {
  return {
    musteriKodu: kod,
    unvan: kod,
    lat: 38.4,
    lon: 27.1,
    kg,
    cuvalEsdeger: cuval,
    olcusuzSatir: 0,
    ilce: "Bornova",
    sehir: "İzmir",
  } as Durak;
}

function yuk(arac: Arac, duraklar: Durak[]): AracYuku {
  return { arac, duraklar, doluluk: dolulukHesapla(arac, duraklar) };
}

const BOS_METRIK: PlanMetrigi = {
  aracSayisi: 0,
  yerlesenDurak: 0,
  havuzdaKalan: 0,
  ortDoluluk: 0,
  toplamKm: 0,
  asimVar: false,
  bolunmusBolge: 0,
  aracBasinaBolge: 0,
  maxYayilimKm: 0,
};

function girdi(over: Partial<KriterGirdisi> = {}): KriterGirdisi {
  const filo: FiloSecimi<Arac> = {
    secilen: [NPR],
    atamalar: { npr10: MEHMET },
    soforSayisi: { B: 0, C: 1 },
    yeterli: true,
    gerekce: "yük tek araca sığıyor",
  };
  return {
    metrik: { ...BOS_METRIK, aracSayisi: 1, yerlesenDurak: 2 },
    yukler: [yuk(NPR, [durak("a", 100, 1500), durak("b", 100, 1500)])],
    filo,
    yerlesmeyen: [],
    rotaBilgileri: {},
    veriYasiSaat: 2,
    ...over,
  };
}

function bul(kriterler: Kriter[], anahtar: KriterAnahtari): Kriter {
  const k = kriterler.find((x) => x.anahtar === anahtar);
  assert.ok(k, `${anahtar} kriteri yok`);
  return k;
}

// --- testler ----------------------------------------------------------------

function bosPlanKarneUretmez() {
  const k = kriterleriHesapla({
    ...girdi(),
    metrik: BOS_METRIK,
    yukler: [],
    yerlesmeyen: [],
  });
  assert.equal(k.length, 0, "boş planda karne çizilmemeli");
  console.log("kriter: boş plan karne üretmez ok");
}

function sureOlculmedenUydurmuyor() {
  // Google süresi yokken ortalama hız uydurulup süre üretilmemeli.
  const k = bul(kriterleriHesapla(girdi()), "sure");
  assert.equal(k.kaynak, "veri-yok");
  assert.equal(k.deger, "ölçülmedi");
  assert.match(k.aciklama, /optimize/i);
  console.log("kriter: süre ölçülmeden uydurulmuyor ok");
}

function sureOlculunceGercekDeger() {
  const bilgi: Record<string, RotaBilgisi> = {
    npr10: { saniye: 3 * 3600, metre: 120_000, trafik: "TRAFFIC_AWARE_OPTIMAL" },
  };
  const k = bul(kriterleriHesapla(girdi({ rotaBilgileri: bilgi })), "sure");
  assert.equal(k.kaynak, "olculen");
  // 3 sa sürüş + 2 durak × 15 dk = 3,5 sa; takograf sınırı (4,5 sa) aşılmadı.
  assert.match(k.deger, /^3 sa 30 dk$/);
  assert.equal(k.durum, "iyi");
  console.log("kriter: süre ölçülünce gerçek değer ok");
}

function uzunGunUyariyor() {
  // 11 sa sürüş + 2 durak × 15 dk + 30 dk takograf molası = 12 sa.
  // (Tam 11 saat sınırın kendisi; eşik `> 11` olduğu için üstüne çıkılıyor.)
  const bilgi: Record<string, RotaBilgisi> = {
    npr10: { saniye: 11 * 3600, metre: 600_000, trafik: "TRAFFIC_AWARE" },
  };
  const kriterler = kriterleriHesapla(girdi({ rotaBilgileri: bilgi }));
  assert.equal(bul(kriterler, "sure").durum, "sorun", "11 saati aşan gün sorun");
  // Takograf molası aynı veriden sürüş güvenliğine de düşmeli.
  const guvenlik = bul(kriterler, "surusGuvenligi");
  assert.equal(guvenlik.durum, "dikkat");
  assert.match(guvenlik.aciklama, /mola/i);
  console.log("kriter: uzun gün + takograf molası uyarıyor ok");
}

function maliyetDaimaTahmini() {
  const k = bul(
    kriterleriHesapla(girdi({ metrik: { ...BOS_METRIK, aracSayisi: 1, toplamKm: 412 } })),
    "maliyet"
  );
  // Filoda yakıt/km alanı yok; km vekil olarak gösteriliyor ve etiketleniyor.
  assert.equal(k.kaynak, "tahmini");
  assert.match(k.deger, /412 km/);
  assert.match(k.aciklama, /yakıt/i);
  console.log("kriter: maliyet daima tahmini etiketli ok");
}

function yerlesmemeNedeniGruplaniyor() {
  const yerlesmeyen: YerlesmeyenDurak[] = [
    { durak: durak("x", 10, 100), neden: "sofor-yok" },
    { durak: durak("y", 10, 100), neden: "sofor-yok" },
    { durak: durak("z", 10, 100), neden: "koordinat-yok" },
  ];
  const k = bul(kriterleriHesapla(girdi({ yerlesmeyen })), "guvenilirlik");
  // Neden ne olursa olsun (koordinatsız dahil) yerleşmeyen durak en fazla
  // "dikkat" — kırmızıyı yalnız veri bayatlığı gibi ayrı bir sinyal taşır.
  assert.equal(k.durum, "dikkat", "yerleşmeyen durak uyarı, sorun değil");
  assert.match(k.aciklama, /2 durak araç var, şoför yok/);
  assert.match(k.aciklama, /1 durak koordinatı yok/);
  assert.deepEqual(k.suclular.duraklar, ["x", "y", "z"]);
  console.log("kriter: yerleşmeme nedeni gruplanıyor ok");
}

function bayatVeriGuvenilirligiDusuruyor() {
  const iyi = bul(kriterleriHesapla(girdi({ veriYasiSaat: 3 })), "guvenilirlik");
  assert.equal(iyi.durum, "iyi");
  const bayat = bul(kriterleriHesapla(girdi({ veriYasiSaat: 30 })), "guvenilirlik");
  assert.equal(bayat.durum, "dikkat");
  const cokBayat = bul(kriterleriHesapla(girdi({ veriYasiSaat: 100 })), "guvenilirlik");
  assert.equal(cokBayat.durum, "sorun");
  console.log("kriter: bayat veri güvenilirliği düşürüyor ok");
}

function soforsuzYukluAracDikkat() {
  const filo: FiloSecimi<Arac> = {
    secilen: [NPR, KANGOO],
    atamalar: { npr10: MEHMET }, // Kangoo'ya şoför düşmedi
    soforSayisi: { B: 0, C: 1 },
    yeterli: false,
    gerekce: "şoför sayısı yetmiyor",
  };
  const k = bul(
    kriterleriHesapla(
      girdi({
        filo,
        yukler: [
          yuk(NPR, [durak("a", 100, 1500)]),
          yuk(KANGOO, [durak("b", 20, 300)]),
        ],
        metrik: { ...BOS_METRIK, aracSayisi: 2, yerlesenDurak: 2 },
      })
    ),
    "surusGuvenligi"
  );
  assert.equal(k.durum, "dikkat");
  assert.deepEqual(k.suclular.araclar, ["kangoo"]);
  console.log("kriter: şoförsüz yüklü araç dikkat ok");
}

function kapasiteAsimiSorun() {
  // Kangoo 800 kg — 1.200 kg ruhsatı aşıyor.
  const k = bul(
    kriterleriHesapla(
      girdi({
        yukler: [yuk(KANGOO, [durak("a", 50, 1200)])],
        filo: {
          secilen: [KANGOO],
          atamalar: { kangoo: MEHMET },
          soforSayisi: { B: 0, C: 1 },
          yeterli: true,
          gerekce: "",
        },
      })
    ),
    "yukRiski"
  );
  assert.equal(k.durum, "sorun");
  assert.deepEqual(k.suclular.araclar, ["kangoo"]);
  console.log("kriter: kapasite aşımı sorun ok");
}

function yayilimVeBolunmeSahaZorlugu() {
  const k = bul(
    kriterleriHesapla(
      girdi({
        metrik: {
          ...BOS_METRIK,
          aracSayisi: 1,
          maxYayilimKm: 240,
          bolunmusBolge: 2,
        },
      })
    ),
    "sahaZorlugu"
  );
  assert.equal(k.durum, "sorun", "150 km üstü yayılım sorun");
  assert.match(k.aciklama, /240 km/);
  assert.match(k.aciklama, /2 bölge/);
  console.log("kriter: yayılım + bölünme saha zorluğu ok");
}

function ozetEnKotuyuTasiyor() {
  const temiz = karneOzeti(kriterleriHesapla(girdi()));
  assert.equal(temiz.sorun, 0);
  assert.equal(temiz.durum, "iyi");

  // yerlesmeyen artık her nedende en fazla "dikkat" ürettiği için (bkz.
  // yerlesmemeNedeniGruplaniyor) burada gerçekten "sorun" üreten ayrı bir
  // sinyal kullanılıyor: çok bayat veri.
  const bozuk = karneOzeti(
    kriterleriHesapla(girdi({ veriYasiSaat: 100 }))
  );
  assert.ok(bozuk.sorun >= 1);
  assert.equal(bozuk.durum, "sorun");
  console.log("kriter: özet en kötü durumu taşıyor ok");
}

function herKriterAciklamaTasiyor() {
  // Açıklama `title`'a saklanmıyor, ekranda görünecek: boş kalmamalı.
  for (const k of kriterleriHesapla(girdi())) {
    assert.ok(k.aciklama.length > 10, `${k.anahtar} açıklaması boş`);
    assert.ok(k.ad.length > 0);
    assert.ok(k.deger.length > 0);
  }
  console.log("kriter: her satır açıklama taşıyor ok");
}

bosPlanKarneUretmez();
sureOlculmedenUydurmuyor();
sureOlculunceGercekDeger();
uzunGunUyariyor();
maliyetDaimaTahmini();
yerlesmemeNedeniGruplaniyor();
bayatVeriGuvenilirligiDusuruyor();
soforsuzYukluAracDikkat();
kapasiteAsimiSorun();
yayilimVeBolunmeSahaZorlugu();
ozetEnKotuyuTasiyor();
herKriterAciklamaTasiyor();

console.log("\nkriter: tüm testler geçti");
