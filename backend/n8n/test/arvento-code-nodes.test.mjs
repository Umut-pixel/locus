// Arvento workflow'unun Code dugumlerini n8n OLMADAN calistiran kosum takimi.
//
// Calistir:  node backend/n8n/test/arvento-code-nodes.test.mjs
//
// Neden: n8n Code dugumlerinin govdesi saf JS. $input / $('Dugum') / $env /
// $getWorkflowStaticData sahtelenince JSON'dan cikarilip dogrudan kosulabilir.
// Boylece normalize ve dogrulama mantigi, workflow'u n8n'e import etmeden
// GERCEK Postman yanitlariyla sinanir. Asagidaki LAST_EVENTS ve ARAC_LISTESI
// sabitleri 2026-09-14 canli testinden birebir alindi.
//
// Workflow JSON'u degistiginde bu dosya da guncellenmelidir - testler
// dugum ADLARINA gore kod cekiyor.
import fs from 'node:fs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const buraya = path.dirname(fileURLToPath(import.meta.url));
const wf = JSON.parse(fs.readFileSync(
  path.join(buraya, '..', 'Arvento Arac Takibi.json'), 'utf8'));

const kod = (ad) => {
  const n = wf.nodes.find((x) => x.name === ad);
  if (!n) throw new Error('dugum yok: ' + ad);
  return n.parameters.jsCode;
};

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function calistir(nodeAdi, { girdi = [], digerDugumler = {}, env = {}, statik = {} } = {}) {
  const fn = new AsyncFunction('$input', '$', '$env', '$getWorkflowStaticData', kod(nodeAdi));
  const $input = { all: () => girdi.map((j) => ({ json: j })) };
  const $ = (ad) => {
    if (!(ad in digerDugumler)) throw new Error('sahte dugum tanimsiz: ' + ad);
    const arr = digerDugumler[ad];
    return { first: () => ({ json: arr[0] }), all: () => arr.map((j) => ({ json: j })) };
  };
  const ctx = { helpers: { httpRequest: async () => { throw new Error('testte ag cagrisi yok'); } } };
  return fn.call(ctx, $input, $, env, () => statik);
}

let gecti = 0, kaldi = 0;
async function test(ad, fn) {
  try { await fn(); console.log('  PASS  ' + ad); gecti++; }
  catch (e) { console.log('  FAIL  ' + ad + '\n        ' + e.message); kaldi++; }
}
const esit = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const dogru = (c, m) => { if (!c) throw new Error(m); };
async function atmali(fn, parca, m) {
  let atti = false;
  try { await fn(); } catch (e) {
    atti = true;
    if (!e.message.includes(parca)) throw new Error(`${m}: mesajda "${parca}" yok -> ${e.message}`);
  }
  if (!atti) throw new Error(m + ': hata atmasi gerekiyordu, atmadi');
}

// -- Gercek Postman yanitlari (2026-09-14) ---------------------------------
const LAST_EVENTS = {
  statusCode: 200,
  body: {
    List: [
      { Node: 'C11L00030370', Date: '20260914092225',
        Address: 'Ford - Store Çetaş İzmir, Doğanlar Mh., Bornova, İzmir, Türkiye',
        Region: '', Longitude: 27.253838, Latitude: 38.456276, Altitude: 52,
        Odometer: 23315.5, Speed: 8, Course: 245, VehicleClass: 'OTOMOBIL' },
      { Node: 'C11L00030374', Date: '20260914093214',
        Address: 'İzmir Aydın Otoyolu, Mevlana Mh., Bornova, İzmir, Türkiye',
        Region: '', Longitude: 27.239702, Latitude: 38.4462, Altitude: 40,
        Odometer: 22352.699, Speed: 85, Course: 232, VehicleClass: 'OTOMOBIL' },
    ],
    Result: 0, Status: 0, HasError: false,
  },
};

const ARAC_LISTESI = {
  statusCode: 200,
  body: {
    Status: 0, Result: 0, HasError: false,
    List: [
      { Node: 'C11L00030370', LicensePlate: '34PDV735', Driver: 'GAMZE SAĞIR', VehicleClass: 'OTOMOBIL', NodeGroup: '', Crew: '' },
      { Node: 'C11L00030371', LicensePlate: '34PDV731', Driver: 'TAMER ÇELİK', VehicleClass: 'OTOMOBIL', NodeGroup: '', Crew: '' },
      { Node: 'C11L00030372', LicensePlate: '35ASM899', Driver: 'PATİGO SEVKİYAT 1', VehicleClass: 'OTOMOBIL', NodeGroup: '', Crew: '' },
      { Node: 'C11L00030373', LicensePlate: '34UBB75', Driver: 'PATİGO SEVKİYAT 2', VehicleClass: 'KAMYON', NodeGroup: '', Crew: '' },
      { Node: 'C11L00030374', LicensePlate: '34PDV732', Driver: 'DERYA YAYLA', VehicleClass: 'OTOMOBIL', NodeGroup: '', Crew: '' },
      { Node: 'C11L00030375', LicensePlate: '42ENL50', Driver: 'PATİGO SEVKİYAT 3', VehicleClass: 'KAMYON', NodeGroup: '', Crew: '' },
      { Node: 'C11L00030376', LicensePlate: '34 PDV 736', Driver: 'ANIL BÖBEŞ', VehicleClass: 'OTOMOBIL', NodeGroup: '', Crew: '' },
      { Node: 'C11L00030377', LicensePlate: '34PDV733', Driver: '', VehicleClass: 'OTOMOBIL', NodeGroup: '', Crew: '' },
    ],
  },
};

console.log('\n== Dogrula ve Normalize (konum) ==');

await test('gercek 2 araclik yanit -> 2 son + 2 gecmis satiri', async () => {
  const r = (await calistir('Dogrula ve Normalize', { girdi: [LAST_EVENTS] }))[0].json;
  esit(r.satir, 2, 'satir');
  esit(r.ham_satir, 2, 'ham_satir');
  esit(r.atlanan, { koordinatsiz: 0, tarihsiz: 0, nodesuz: 0 }, 'atlanan');
  esit(r.gecmis.length, 2, 'gecmis uzunlugu');
});

await test('Date UTC+3 olarak parse ediliyor (09:22:25 TR -> 06:22:25Z)', async () => {
  const r = (await calistir('Dogrula ve Normalize', { girdi: [LAST_EVENTS] }))[0].json;
  esit(r.son[0].olcum_zamani, '2026-09-14T06:22:25.000Z', 'UTC cevrimi');
  esit(r.son[0].ham_tarih, '20260914092225', 'ham tarih korundu');
});

await test('bos Region null oluyor, adres korunuyor', async () => {
  const r = (await calistir('Dogrula ve Normalize', { girdi: [LAST_EVENTS] }))[0].json;
  esit(r.son[0].bolge, null, 'bolge');
  dogru(r.son[0].adres.includes('Bornova'), 'adres korunmali');
});

await test('birimler dogru tasiniyor (hiz/odometre/yon/rakim)', async () => {
  const r = (await calistir('Dogrula ve Normalize', { girdi: [LAST_EVENTS] }))[0].json;
  esit(r.son[1].hiz_kmh, 85, 'hiz');
  esit(r.son[1].odometre_km, 22352.699, 'odometre');
  esit(r.son[1].yon_derece, 232, 'yon');
  esit(r.son[1].rakim_m, 40, 'rakim');
});

await test('son ve gecmis satirlarinin anahtarlari tekduze (PostgREST sarti)', async () => {
  const r = (await calistir('Dogrula ve Normalize', { girdi: [LAST_EVENTS] }))[0].json;
  const k = (o) => Object.keys(o).sort().join(',');
  esit(k(r.son[0]), k(r.son[1]), 'son anahtarlari');
  esit(k(r.gecmis[0]), k(r.gecmis[1]), 'gecmis anahtarlari');
});

await test('401 -> tek-oturum kisitini anlatan hata', async () => {
  await atmali(() => calistir('Dogrula ve Normalize', { girdi: [{ statusCode: 401, body: '' }] }),
    'Tek-oturum', '401 mesaji');
});

await test('HasError:true + Status 1000 -> hata (HTTP 200 olmasina ragmen)', async () => {
  await atmali(() => calistir('Dogrula ve Normalize', {
    girdi: [{ statusCode: 200, body: { List: [], Status: 1000, HasError: true,
      Error: { Message: 'Object reference not set to an instance of an object.', Status: 1000 } } }],
  }), 'Object reference', 'HasError mesaji');
});

await test('bos List hata DEGIL, satir=0 (tum cihazlar sessiz olabilir)', async () => {
  const r = (await calistir('Dogrula ve Normalize', {
    girdi: [{ statusCode: 200, body: { List: [], Status: 0, HasError: false } }],
  }))[0].json;
  esit(r.satir, 0, 'satir');
});

await test('koordinat 0 olan satir atlaniyor', async () => {
  const r = (await calistir('Dogrula ve Normalize', {
    girdi: [{ statusCode: 200, body: { Status: 0, HasError: false, List: [
      { Node: 'A', Date: '20260914090000', Latitude: 0, Longitude: 0, Speed: 0 },
      { Node: 'B', Date: '20260914090000', Latitude: 38.4, Longitude: 27.1, Speed: 0 },
    ] } }],
  }))[0].json;
  esit(r.satir, 1, 'yalniz B yazilmali');
  esit(r.atlanan.koordinatsiz, 1, 'koordinatsiz sayaci');
});

await test('satir gelip hicbiri kullanilabilir degilse hata atiyor', async () => {
  await atmali(() => calistir('Dogrula ve Normalize', {
    girdi: [{ statusCode: 200, body: { Status: 0, HasError: false, List: [
      { Node: 'A', Date: '20260914090000', Latitude: 0, Longitude: 0 },
    ] } }],
  }), 'hicbiri yazilabilir degil', 'tumu atlandi hatasi');
});

console.log('\n== Filo Normalize ==');

await test('8 arac, plaka normalize ("34 PDV 736" -> "34PDV736")', async () => {
  const r = (await calistir('Filo Normalize', { girdi: [ARAC_LISTESI] }))[0].json;
  esit(r.satir, 8, 'satir');
  const a = r.rows.find((x) => x.node === 'C11L00030376');
  esit(a.plaka, '34PDV736', 'normalize plaka');
  esit(a.plaka_ham, '34 PDV 736', 'ham plaka korundu');
});

await test("arac_kod ve ilk_gorulme payload'da YOK (elle eslemeyi ezmesin)", async () => {
  const r = (await calistir('Filo Normalize', { girdi: [ARAC_LISTESI] }))[0].json;
  for (const row of r.rows) {
    dogru(!('arac_kod' in row), 'arac_kod payloadda olmamali');
    dogru(!('ilk_gorulme' in row), 'ilk_gorulme payloadda olmamali');
  }
});

await test('tum satirlarin anahtar kumesi ayni (PostgREST sarti)', async () => {
  const r = (await calistir('Filo Normalize', { girdi: [ARAC_LISTESI] }))[0].json;
  const ilk = Object.keys(r.rows[0]).sort().join(',');
  for (const row of r.rows) esit(Object.keys(row).sort().join(','), ilk, 'anahtar kumesi');
});

await test('bos surucu/grup/ekip null oluyor', async () => {
  const r = (await calistir('Filo Normalize', { girdi: [ARAC_LISTESI] }))[0].json;
  const a = r.rows.find((x) => x.node === 'C11L00030377');
  esit(a.surucu, null, 'surucu');
  esit(a.grup, null, 'grup');
});

await test('cakisan plaka -> UNIQUE ihlali oncesi anlasilir hata', async () => {
  await atmali(() => calistir('Filo Normalize', {
    girdi: [{ statusCode: 200, body: { Status: 0, HasError: false, List: [
      { Node: 'A', LicensePlate: '35ASM899' },
      { Node: 'B', LicensePlate: '35 ASM 899' },
    ] } }],
  }), 'Ayni plaka iki node', 'plaka cakismasi');
});

console.log('\n== Bakim Normalize ==');

const PENCERELER = { 'Bakim Pencereleri': [
  { pencere: '20240901000000..20241201000000' },
  { pencere: '20241201000000..20250301000000' },
] };

await test("bos pencereler -> satir 0, hata yok (Arvento'da kayit yok)", async () => {
  const bos = { statusCode: 200, body: { List: [], Status: 0, HasError: false } };
  const r = (await calistir('Bakim Normalize', {
    girdi: [bos, bos], digerDugumler: { ...PENCERELER, 'Filo Normalize': [{ rows: [] }] },
  }))[0].json;
  esit(r.satir, 0, 'satir');
  esit(r.bos_pencere_sayisi, 2, 'bos pencere sayisi');
});

await test('Status 1012 -> pencere adi + ADIM_AY ipucu iceren hata', async () => {
  await atmali(() => calistir('Bakim Normalize', {
    girdi: [{ statusCode: 200, body: { List: [], Status: 1012, HasError: true,
      Error: { Message: 'InvalidDateInterval', Status: 1012 } } }],
    digerDugumler: { ...PENCERELER, 'Filo Normalize': [{ rows: [] }] },
  }), 'ADIM_AY kucultulmeli', '1012 ipucu');
});

await test('kayit parse: plaka->node cozumu, tarih, ondalik sezgisi', async () => {
  const r = (await calistir('Bakim Normalize', {
    girdi: [{ statusCode: 200, body: { Status: 0, HasError: false, List: [
      { RecordNo: 7, LicensePlate: '35 ASM 899', Type: 'Periyodik Bakım', Firm: 'Servis A.Ş.',
        StartDate: '20260310080000', EndDate: '13.03.2026', PlannedDate: '2026-06-10',
        Km: '123.456', PlannedKm: '130.000', Amount: '12.450,75', Note: 'yağ+filtre' },
    ] } }],
    digerDugumler: {
      'Bakim Pencereleri': [{ pencere: 'p1' }],
      'Filo Normalize': [{ rows: [{ plaka: '35ASM899', node: 'C11L00030372' }] }],
    },
  }))[0].json;
  const k = r.rows[0];
  esit(k.kayit_no, 7, 'kayit_no');
  esit(k.plaka, '35ASM899', 'plaka normalize');
  esit(k.node, 'C11L00030372', 'plaka -> node cozumu');
  esit(k.baslangic_tarihi, '2026-03-10', 'yyyyMMddHHmmss tarihi');
  esit(k.bitis_tarihi, '2026-03-13', 'dd.MM.yyyy tarihi');
  esit(k.planlanan_tarih, '2026-06-10', 'yyyy-MM-dd tarihi');
  esit(k.km, 123456, 'binlik ayirici (3 hane) -> tam sayi');
  esit(k.tutar, 12450.75, 'ondalik virgul (2 hane)');
  dogru(k.ham_kayit && k.ham_kayit.RecordNo === 7, 'ham_kayit saklanmali');
});

await test('yanitta LicencePlate (c ile) gelirse de okunuyor', async () => {
  const r = (await calistir('Bakim Normalize', {
    girdi: [{ statusCode: 200, body: { Status: 0, HasError: false, List: [
      { RecordNo: 9, LicencePlate: '42ENL50' },
    ] } }],
    digerDugumler: { 'Bakim Pencereleri': [{ pencere: 'p1' }], 'Filo Normalize': [{ rows: [] }] },
  }))[0].json;
  esit(r.rows[0].plaka, '42ENL50', 'LicencePlate fallback');
});

console.log('\n== Hata Hazirla ==');

await test('error item -> failed satiri, is_turu korunuyor', async () => {
  const r = (await calistir('Hata Hazirla', {
    girdi: [{ error: { message: 'Arvento lastEvents HTTP 500' } }],
    digerDugumler: { 'Oturum Al': [{ is_turu: 'konum' }] },
  }))[0].json;
  esit(r.rows[0].durum, 'failed', 'durum');
  esit(r.rows[0].is_turu, 'konum', 'is_turu');
  dogru(r.rows[0].hata.includes('HTTP 500'), 'hata mesaji');
});

await test('bilinmeyen is_turu -> izinli degere dusuruluyor (check constraint)', async () => {
  const r = (await calistir('Hata Hazirla', {
    girdi: [{ error: { message: 'x' }, is_turu: 'sacma' }],
    digerDugumler: { 'Oturum Al': [{ is_turu: 'filo_bakim' }] },
  }))[0].json;
  esit(r.rows[0].is_turu, 'filo_bakim', "Oturum Al'dan alinmali");
});

await test('cok uzun hata mesaji 2000 karaktere kirpiliyor', async () => {
  const r = (await calistir('Hata Hazirla', {
    girdi: [{ error: { message: 'x'.repeat(9000) } }],
    digerDugumler: { 'Oturum Al': [{ is_turu: 'konum' }] },
  }))[0].json;
  esit(r.rows[0].hata.length, 2000, 'kirpma');
});

console.log('\n== Bakim Pencereleri ==');

await test('12 pencere, 3 aylik, gecmis 24 + gelecek 12 ay', async () => {
  const r = await calistir('Bakim Pencereleri', { girdi: [{}] });
  esit(r.length, 12, 'pencere sayisi');
  for (const p of r) {
    dogru(/^\d{14}$/.test(p.json.StartDate), 'StartDate formati: ' + p.json.StartDate);
    dogru(/^\d{14}$/.test(p.json.EndDate), 'EndDate formati: ' + p.json.EndDate);
    dogru(p.json.EndDate > p.json.StartDate, 'bitis > baslangic');
  }
  dogru(r[0].json.StartDate < r[11].json.StartDate, 'kronolojik sira');
});

console.log('\n== Sync Run Hazirla (filo kolu yazim kontrolu) ==');

const OK = { statusCode: 201, body: '' };

await test('basarili yazimlar -> completed satiri, sayilar toplaniyor', async () => {
  const r = (await calistir('Sync Run Hazirla', {
    girdi: [{}],
    digerDugumler: {
      'Upsert Arvento Araclar': [OK], 'Upsert Bakim': [OK],
      'Filo Normalize': [{ satir: 8 }], 'Bakim Normalize': [{ satir: 3 }],
    },
  }))[0].json;
  esit(r.rows[0].durum, 'completed', 'durum');
  esit(r.rows[0].satir_sayisi, 11, 'filo 8 + bakim 3');
  esit(r.rows[0].is_turu, 'filo_bakim', 'is_turu');
});

await test('PostgREST 401 sessizce gecmiyor -> hata atiyor', async () => {
  await atmali(() => calistir('Sync Run Hazirla', {
    girdi: [{}],
    digerDugumler: {
      'Upsert Arvento Araclar': [{ statusCode: 401, body: { message: 'Invalid API key' } }],
      'Upsert Bakim': [OK], 'Filo Normalize': [{ satir: 8 }], 'Bakim Normalize': [{ satir: 0 }],
    },
  }), 'PostgREST HTTP 401', 'yutulmamali');
});

await test('bakim upsert hic calismadiysa (kayit yok dali) sorun degil', async () => {
  const r = (await calistir('Sync Run Hazirla', {
    girdi: [{}],
    digerDugumler: {
      'Upsert Arvento Araclar': [OK],
      'Filo Normalize': [{ satir: 8 }], 'Bakim Normalize': [{ satir: 0 }],
    },
  }))[0].json;
  esit(r.rows[0].satir_sayisi, 8, 'yalniz filo');
});

console.log(`\n${gecti} gecti, ${kaldi} kaldi\n`);
process.exit(kaldi === 0 ? 0 : 1);
