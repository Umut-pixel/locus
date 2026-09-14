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
 * Rota planına eşlenmemiş araçların rengi. Bilerek nötr gri: bir rotaya ait
 * olmadıkları için plan paletinden renk almamalılar, yoksa haritada "bu araç
 * şu rotayı sürüyor" yanılsaması doğar. Müşteri haritasında zaten rota
 * kavramı yok — orada bütün araçlar bu rengi kullanır.
 */
export const CANLI_NOTR_RENK = "#94a3b8";

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
 * Canlı araç imleci — Arvento'dan gelen GERÇEK koordinat.
 *
 * `RotaHaritasi`'ndeki `createYonEl`'den farkı: o, depoda duran ve ilk durağa
 * bakan bir TAHMİN oku; bu, cihazın bildirdiği konum.
 *
 * Hareket halindeyse pusula oku (`yon` derece, kuzey = 0), duruyorsa dolu
 * nokta. Bayat ölçüm (10 dk+, eşik view'da) soluk ve kesik halkalı: "bu aracın
 * YERİ değil, EN SON BİLİNEN yeri" demek.
 */
export function createCanliAracEl(
  etiket: string,
  renk: string,
  yon: number | null,
  hareket: boolean,
  bayat: boolean
): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  const durum = bayat ? "son bilinen konum" : hareket ? "hareket halinde" : "duruyor";
  el.setAttribute("aria-label", `${etiket} — ${durum}`);
  el.style.cssText =
    // z-index: depo pini büyük ve `anchor:bottom`; araç imleci onun altında kalmasın.
    "width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:3;" +
    `filter:drop-shadow(0 2px 7px rgba(0,0,0,0.5));opacity:${bayat ? "0.55" : "1"}`;

  // Hareket yönü bilinmiyorsa ok döndürülemez — nokta göster, uydurma.
  const okGosterilsin = hareket && yon != null;
  const ic = okGosterilsin
    ? `<polygon points="18 8.5 23.5 23 18 19.6 12.5 23 18 8.5"
                fill="#fff" stroke="none"
                transform="rotate(${(yon as number).toFixed(1)} 18 18)" />`
    : `<circle cx="18" cy="18" r="4.4" fill="#fff" />`;

  el.innerHTML = `
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="15" fill="none" stroke="${renk}" stroke-width="1.6"
              opacity="0.45" ${bayat ? 'stroke-dasharray="3 3"' : ""} />
      <circle cx="18" cy="18" r="11.5" fill="${renk}" stroke="#ffffff" stroke-width="2.4" />
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
