/**
 * Canlı araç imleci — İKİ haritanın ortak çizim katmanı.
 *
 * `RotaHaritasi` (rota planı) ve `PetshopMap` (müşteri haritası) aynı araçları
 * aynı görsel dille göstermeli. Kod burada tek yerde duruyor ki iki harita
 * zamanla birbirinden ayrışmasın — 2026-09-14'te önce yalnız rota haritasına
 * eklenmişti, müşteri haritasına da istenince kopyalamak yerine buraya çıkarıldı.
 *
 * DOM üretiyor, yani yalnız istemcide çağrılabilir.
 */

import type mapboxgl from "mapbox-gl";

import { yasMetni, yasSaniye, type CanliAracKonumu } from "@/lib/rota/canli-konum";

/**
 * Canlı araç rengi — rota eşlemesi HENÜZ yokken kullanılan ton.
 *
 * `ARAC_RENKLERI`nin ilk rengiyle (Google mavisi) aynı, bilerek: kullanıcı
 * zaten Apple/Google haritalarındaki "araç" mavisini tanıyor. Bir araca
 * `arac_kod` işaretlendiği anda rota rengi bunun yerini alır.
 *
 * Şahıs araçları da bu rengi kullanıyor (2026-09-14 kararı): nötr gri imleç
 * haritada "veri yok / bozuk" gibi okunuyordu. Sevkiyat / şahıs ayrımı artık
 * yalnız LİSTEDE — kartta iki ayrı başlıklı grup — ve balondaki sürücü
 * bilgisinde yaşıyor.
 */
export const CANLI_ARAC_RENK = "#4285F4";

/**
 * İmleç rengi: rota rengi > varsayılan araç mavisi.
 *
 * Rota rengi yalnız rota haritasında ve YALNIZ eşlenmiş araçlarda var; müşteri
 * haritasında rota kavramı olmadığı için hiç gelmiyor.
 */
export function canliAracRengi(
  _k: CanliAracKonumu,
  rotaRengi?: string | null
): string {
  return rotaRengi || CANLI_ARAC_RENK;
}

/**
 * Üst üste binen araçları yelpaze gibi açar.
 *
 * Neden gerekli: filonun çoğu gün boyunca depoda park hâlinde duruyor.
 * 2026-09-14'te ölçüldü — 4 araç ekranda 2 piksel içinde üst üste biniyor,
 * tek imleç gibi görünüyordu.
 *
 * ⚠ Kümeleme COĞRAFİ değil EKRAN PİKSELİNE göre. İlk sürüm ~11 m'lik bir
 * enlem/boylam ızgarası kullanıyordu ve işe yaramadı: Türkiye görünümünde
 * 11 m zaten tek piksel, yani depoda 60 m arayla duran araçlar ayrı hücrelere
 * düşüp hiç kaydırılmıyordu. Üst üste binme bir ekran olgusu, dolayısıyla
 * ölçüsü de ekranda alınmalı — ve zoom değişince yeniden hesaplanmalı
 * (bkz. `canliKaymalariUygula` çağıranları: `zoomend`).
 *
 * Coğrafi çapa korunuyor; yalnız piksel `offset`i veriliyor, yani
 * yakınlaştırınca imleçler gerçek konumlarına doğru toplanır. Aynı fikrin
 * çizgi hâli `RotaHaritasi`'ndeki `seritKaymasiHesapla`.
 */
/** İmleç çapı (px). Yelpazede iki komşu bu kadar aralıklı olmalı ki değmesinler. */
const IMLEC_CAPI_PX = 34;

/** En küçük yelpaze yarıçapı — 2-3 araçlık kümeler için. */
const MIN_YARICAP_PX = 19;

/**
 * Bu piksel mesafesinden yakın imleçler aynı kümeye girer.
 *
 * İmleç çapından (34 px) belirgin biçimde BÜYÜK seçildi ve sebebi ölçümle
 * bulundu: eşik 30 px'ken, aralarında 40 px olan iki araç ayrı kümelere
 * düşüyor, sonra kendi yelpazelerinde birbirine doğru kaydırılıp 11 px'e
 * yaklaşıyordu. Kümeleme eşiği, kaydırma sonrası oluşabilecek yakınlaşmayı da
 * kapsamalı — yoksa yelpaze çakışmayı çözmek yerine yerini değiştiriyor.
 */
const CAKISMA_ESIGI_PX = 64;

/**
 * Kümedeki üye sayısına göre yarıçap: çember uzunluğu üyeleri yan yana
 * sığdıracak kadar büyüsün, yoksa kalabalık kümede imleçler yine çakışır.
 */
function yelpazeYaricapi(adet: number): number {
  return Math.max(MIN_YARICAP_PX, (adet * IMLEC_CAPI_PX) / (2 * Math.PI));
}

function yelpazeKaymasi(index: number, adet: number): [number, number] {
  if (adet <= 1) return [0, 0];
  // Yukarıdan başlayıp saat yönünde — ilk araç hep tepede, sıra kararlı.
  const aci = (2 * Math.PI * index) / adet - Math.PI / 2;
  const r = yelpazeYaricapi(adet);
  return [Math.cos(aci) * r, Math.sin(aci) * r];
}

/** Haritaya bağlı canlı araç imleci — kayma hesabı için gereken asgari bilgi. */
export interface CanliImlec {
  node: string;
  plaka: string;
  lat: number;
  lon: number;
  marker: mapboxgl.Marker;
}

/**
 * Mevcut zoom'da üst üste binen imleçleri yelpazeye açar.
 *
 * TEK BAĞLANTILI (single-linkage) kümeleme: A ile B yakınsa ve B ile C
 * yakınsa üçü de aynı kümeye girer. İlk sürüm her imleci kümenin İLK üyesine
 * olan mesafesine göre atıyordu; depoda yayılmış araçlar farklı kümelere
 * düşüp açıldıktan sonra yine birbirine giriyordu (ölçüldü: en yakın ikili
 * 10 px). Zincirleme bakmak bu sorunu kökten çözüyor.
 *
 * Sıra plakaya göre sabit — zoom yaparken imleçler birbirinin yerine
 * sıçramasın.
 */
export function canliKaymalariUygula(
  map: mapboxgl.Map,
  imlecler: CanliImlec[]
): void {
  const sirali = [...imlecler].sort((a, b) => a.plaka.localeCompare(b.plaka, "tr"));
  const noktalar = sirali.map((im) => {
    const p = map.project([im.lon, im.lat]);
    return { im, x: p.x, y: p.y };
  });

  const atanmis = new Array(noktalar.length).fill(false);
  for (let i = 0; i < noktalar.length; i += 1) {
    if (atanmis[i]) continue;
    // Genişleyen kuyruk: kümeye giren her üyenin komşuları da kümeye alınır.
    const kume = [i];
    atanmis[i] = true;
    for (let bas = 0; bas < kume.length; bas += 1) {
      const a = noktalar[kume[bas]];
      for (let j = 0; j < noktalar.length; j += 1) {
        if (atanmis[j]) continue;
        const b = noktalar[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) <= CAKISMA_ESIGI_PX) {
          atanmis[j] = true;
          kume.push(j);
        }
      }
    }
    /*
     * Yelpaze kümenin ORTAK MERKEZİ etrafına diziliyor, her imlecin kendi
     * noktası etrafına değil.
     *
     * Bu fark ölçümle bulundu: üyeler zaten 40-60 px'e yayılmış olduğu için
     * herkesi kendi noktası etrafında döndürmek çakışmayı çözmüyor, yalnız
     * yerini değiştiriyordu (en yakın ikili 11 px'te kalıyordu). Ortak merkez
     * etrafında dizilince aralık tam olarak `yelpazeYaricapi` ile garanti
     * ediliyor.
     *
     * Kayma coğrafi çapadan sapmadır; küme zaten bir avuç piksele sığdığı için
     * bu sapma da küçük kalıyor ve yakınlaştırınca kümeler dağılıp kayma
     * kendiliğinden sıfırlanıyor.
     */
    const cx = kume.reduce((t, i) => t + noktalar[i].x, 0) / kume.length;
    const cy = kume.reduce((t, i) => t + noktalar[i].y, 0) / kume.length;

    kume.forEach((idx, sira) => {
      const [dx, dy] = yelpazeKaymasi(sira, kume.length);
      const n = noktalar[idx];
      // Hedef = merkez + yelpaze vektörü; offset = hedef - imlecin kendi yeri.
      n.im.marker.setOffset([cx + dx - n.x, cy + dy - n.y]);
    });
  }
}

/**
 * Aynı belgede birden çok imleç var ve her birinin kendi gradyanı gerekiyor;
 * SVG id'leri belge genelinde benzersiz olmalı yoksa hepsi ilk gradyanı
 * (yani ilk aracın rengini) kullanır.
 */
let gradyanSayaci = 0;

/** Yön konisinin yarı açısı (derece) — Google/Apple'daki huzme genişliği. */
const KONI_YARI_ACI = 28;
/** Koninin merkezden uzanma yarıçapı (48'lik viewBox içinde). */
const KONI_YARICAPI = 23;

/** Kuzeyden `aci` derece sapmış, merkezden `r` uzaklıktaki nokta. */
function koniUcu(aci: number, r: number): [number, number] {
  const rad = (aci * Math.PI) / 180;
  return [24 + r * Math.sin(rad), 24 - r * Math.cos(rad)];
}

/**
 * Kamyon / otomobil silueti — lucide `truck` ve `car-front` ikonlarının path
 * verisi. Repo zaten lucide kullanıyor; ikonu elle yeniden çizmek yerine aynı
 * kaynaktan alınıyor ki arayüzün geri kalanıyla aynı çizgi dilinde olsun.
 *
 * lucide 24'lük viewBox'ta tasarlanmış; 0.62 ölçek + (16.6, 16.6) öteleme onu
 * 48'lik puck'ın ortasına, çapı ~15 px olacak şekilde yerleştiriyor.
 * `stroke-width` ölçeği telafi edecek kadar kalın (2.6 × 0.62 ≈ 1.6 px).
 */
function siluet(kamyon: boolean): string {
  const yollar = kamyon
    ? `<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
       <path d="M15 18H9" />
       <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
       <circle cx="17" cy="18" r="2" />
       <circle cx="7" cy="18" r="2" />`
    : `<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8" />
       <rect width="18" height="8" x="3" y="10" rx="2" />
       <path d="M7 14h.01" />
       <path d="M17 14h.01" />
       <path d="M5 18v2" />
       <path d="M19 18v2" />`;
  return `<g transform="translate(16.6 16.6) scale(0.62)" fill="none" stroke="#ffffff"
             stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${yollar}</g>`;
}

/**
 * Canlı araç imleci — Arvento'dan gelen GERÇEK koordinat.
 *
 * Görsel dil bilerek Apple/Google Haritalar'ın seyir imlecine benziyor, çünkü
 * herkesin zaten tanıdığı biçim bu:
 *   - yuvarlak "puck" (renkli dolgu + kalın beyaz halka),
 *   - hareket hâlindeyken gidiş yönüne bakan yarı saydam KONİ (huzme),
 *   - puck'ın içinde beyaz chevron.
 *
 * Chevron, lucide'ın `navigation-2` poligonu (`12 2 19 21 12 17 5 21`) —
 * repo zaten lucide kullanıyor ve bu şekil tam olarak o haritalardaki ok.
 * `RotaHaritasi`'ndeki `createYonEl` de aynı şekli kullanıyor, böylece
 * "tahmini yön oku" ile "gerçek konum" görsel olarak akraba kalıyor.
 *
 * Duruyorsa koni ve chevron YOK — sade nokta. Yön bilinmiyorsa da koni yok:
 * olmayan bir yönü çizmektense göstermemek doğru.
 *
 * Bayat ölçüm soluk ve kesik halkalı: "bu aracın YERİ değil, EN SON BİLİNEN
 * yeri" demek.
 */
export function createCanliAracEl(
  k: CanliAracKonumu,
  renk: string
): HTMLDivElement {
  const { yonDerece: yon, hareket, bayat, sevkiyat } = k;
  const kamyonMu = (k.aracSinifi ?? "").toUpperCase().includes("KAMYON");
  const etiket = k.aracAdi ?? k.plaka;

  const el = document.createElement("div");
  el.setAttribute("role", "img");
  const durum = bayat ? "son bilinen konum" : hareket ? "hareket halinde" : "duruyor";
  const tur = sevkiyat ? (kamyonMu ? "kamyon, sevkiyat" : "otomobil, sevkiyat") : "şahıs aracı";
  el.setAttribute("aria-label", `${etiket} — ${tur} — ${durum}`);
  el.style.cssText =
    // z-index: depo pini büyük ve `anchor:bottom`; araç imleci onun altında kalmasın.
    "width:48px;height:48px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:3;" +
    `filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));opacity:${bayat ? "0.55" : "1"}`;

  const yonBelli = yon != null;
  const aci = yon ?? 0;

  // Yön konisi — yalnız gerçekten hareket ederken ve yön biliniyorken.
  let koni = "";
  if (hareket && yonBelli) {
    const gid = `arac-koni-${(gradyanSayaci += 1)}`;
    const [sx, sy] = koniUcu(-KONI_YARI_ACI, KONI_YARICAPI);
    const [ex, ey] = koniUcu(KONI_YARI_ACI, KONI_YARICAPI);
    koni = `
      <defs>
        <radialGradient id="${gid}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${renk}" stop-opacity="0.9" />
          <stop offset="45%" stop-color="${renk}" stop-opacity="0.6" />
          <stop offset="100%" stop-color="${renk}" stop-opacity="0.02" />
        </radialGradient>
      </defs>
      <path d="M24 24 L${sx.toFixed(2)} ${sy.toFixed(2)} A${KONI_YARICAPI} ${KONI_YARICAPI} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z"
            fill="url(#${gid})" stroke="${renk}" stroke-width="0.6" stroke-opacity="0.35"
            transform="rotate(${aci.toFixed(1)} 24 24)" />`;
  }

  /*
   * Puck'ın içi: HER araçta kamyon/otomobil silueti (lucide truck /
   * car-front). Yön zaten koniyle okunuyor, o yüzden chevron'a gerek yok;
   * araç türünü bir bakışta görmek daha değerli.
   *
   * Sınıf yalnız ikon seçiminde kullanılıyor, sevkiyat kararında DEĞİL:
   * 35ASM899 bir sevkiyat aracı ama OTOMOBIL sınıfında (bkz.
   * sql/arvento_sevkiyat_bayragi.sql).
   */
  const ic = siluet(kamyonMu);

  el.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      ${koni}
      <circle cx="24" cy="24" r="15.5" fill="none" stroke="${renk}" stroke-width="1.4"
              opacity="0.4" ${bayat ? 'stroke-dasharray="3 3"' : ""} />
      <circle cx="24" cy="24" r="12" fill="${renk}" stroke="#ffffff" stroke-width="3" />
      ${ic}
    </svg>
  `;
  return el;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Canlı araç balonu — plaka, sürücü, hız, adres, ölçüm yaşı. */
export function canliPopupHtml(k: CanliAracKonumu): string {
  const yas = yasMetni(yasSaniye(k));
  const satirlar: string[] = [];
  if (k.aracAdi) satirlar.push(`Rota aracı: ${k.aracAdi}`);
  if (k.surucu) satirlar.push(k.surucu);
  satirlar.push(
    k.hareket && k.hizKmh != null ? `${Math.round(k.hizKmh)} km/s` : "Duruyor"
  );
  if (k.adres) satirlar.push(k.adres);

  const govde = satirlar
    .map(
      (t) =>
        `<div style="font-size:11px;opacity:0.75;margin-top:3px">${escapeHtml(t)}</div>`
    )
    .join("");

  // Bayat ölçüm açıkça söyleniyor — kullanıcı "araç şu an orada" sanmasın.
  const tazelik = k.bayat
    ? `<div style="font-size:10.5px;margin-top:6px;opacity:0.95">⚠ Son bilinen konum · ${escapeHtml(yas)} önce</div>`
    : `<div style="font-size:10.5px;margin-top:6px;opacity:0.6">${escapeHtml(yas)} önce</div>`;

  return `<div style="line-height:1.4;min-width:150px;padding:8px 10px;font-family:var(--font-geist-sans),system-ui,sans-serif">
    <div style="font-size:12px;font-weight:600">${escapeHtml(k.plaka)}</div>${govde}${tazelik}
  </div>`;
}
