"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { DurakRotaBaglami, DurakSecimi } from "@/components/rota/DurakDetayKarti";
import type { RotaDuragi } from "@/hooks/useRotaPlani";
import { DEPOT } from "@/lib/depot";
import { fetchDrivingRoute } from "@/lib/mapbox-directions";
import {
  applyMapRuntimeTuning,
  applyMapStyle,
  mapRenderOptions,
  observeMapContainer,
} from "@/lib/mapbox-init";
import { revealStageVeil } from "@/lib/map-curtain";
import { revealRouteLine } from "@/lib/route-reveal";
import { MAPBOX_TOKEN, mapboxStyleForTheme } from "@/lib/mapbox-style";
import { useTheme } from "@/components/theme/ThemeProvider";

const LINE_SOURCE = "rota-plan-line";
const LINE_LAYER = "rota-plan-line";
const LINE_CASING = "rota-plan-line-casing";
const LINE_ARROWS = "rota-plan-line-arrows";
const ARROW_IMAGE = "rota-plan-arrow";

/**
 * Ekleme önizlemesi — "araç seç → onayla" arasındaki bekleme anında (bkz.
 * `DurakDetayKarti`) o aracın rengiyle ama SOLUK bir düz çizgi. Ayrı
 * kaynak/katman: `LINE_LAYER`'dan ÖNCE eklenir ki (Mapbox'ta sonra eklenen
 * üstte çizilir) onaylanınca gerçek rota çizgisinin canlanma animasyonu
 * (`revealRouteLine`) bu soluk çizginin ÜSTÜNDEN geçerek görünsün.
 */
const PREVIEW_LINE_SOURCE = "rota-onizleme-line";
const PREVIEW_LINE_LAYER = "rota-onizleme-line-katman";

/**
 * Çizgi üstünde tekrarlanan yön oku.
 *
 * Font glyph'i yerine kanvasta çiziliyor: `text-field` ile bir üçgen karakteri
 * kullanmak Mapbox'ın glyph setine bağımlılık yaratıyor, eksikse ok hiç
 * çıkmıyor. Kanvas görüntüsü her stilde garanti.
 *
 * Ok +x yönüne bakıyor; `symbol-placement: "line"` onu çizginin gidiş yönüne
 * döndürüyor, yani "bu güzergâh hangi yöne akıyor" haritadan okunabiliyor.
 */
function okGoruntusu(): ImageData | null {
  const boyut = 18;
  const cv = document.createElement("canvas");
  cv.width = boyut;
  cv.height = boyut;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;

  const ciz = () => {
    ctx.beginPath();
    ctx.moveTo(boyut * 0.28, boyut * 0.2);
    ctx.lineTo(boyut * 0.76, boyut * 0.5);
    ctx.lineTo(boyut * 0.28, boyut * 0.8);
    ctx.closePath();
  };

  // Beyaz kontur + koyu dolgu: hem açık hem koyu zeminde, hem de her araç
  // renginin üstünde okunur kalsın.
  ciz();
  ctx.lineJoin = "round";
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();
  ctx.fillStyle = "rgba(17,19,23,0.92)";
  ctx.fill();

  return ctx.getImageData(0, 0, boyut, boyut);
}

/** Araç başına ayrı renk — kartlarla harita aynı paleti kullanır. */
export const ARAC_RENKLERI = [
  "#4285F4",
  "#f59e0b",
  "#10b981",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
] as const;

export function aracRengi(index: number): string {
  return ARAC_RENKLERI[index % ARAC_RENKLERI.length]!;
}

/**
 * Hex rengi beyaza doğru açar — HSL'de yalnız lightness yükseltiliyor
 * (düz RGB-beyaz karışımı bazı tonları soluklaştırıyordu, HSL doygunluğu
 * daha iyi koruyor). Yalnız KOYU harita zemininde kullanılıyor: araç renkleri
 * (`ARAC_RENKLERI`) açık temada tasarlanmış, koyu uydu/harita zemininde
 * "çok koyu" okunuyordu — bu yalnız haritadaki çizim için; kart/liste
 * noktaları (`baglam.renk`, sidebar) hâlâ orijinal, tutarlı rengi kullanıyor.
 */
function hexAcikVer(hex: string, artis: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const yeniL = Math.min(1, l + artis);
  const c = (1 - Math.abs(2 * yeniL - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = yeniL - c / 2;
  let r2 = 0;
  let g2 = 0;
  let b2 = 0;
  if (h < 60) [r2, g2, b2] = [c, x, 0];
  else if (h < 120) [r2, g2, b2] = [x, c, 0];
  else if (h < 180) [r2, g2, b2] = [0, c, x];
  else if (h < 240) [r2, g2, b2] = [0, x, c];
  else if (h < 300) [r2, g2, b2] = [x, 0, c];
  else [r2, g2, b2] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

/** Haritada ÇİZİLECEK renk — koyu temada biraz açılır, açık temada aynen kalır. */
function haritaRengi(hex: string, karanlikMi: boolean): string {
  return karanlikMi ? hexAcikVer(hex, 0.14) : hex;
}

type LngLat = [number, number];

export interface HaritaRotasi {
  aracKod: string;
  aracAd: string;
  renk: string;
  duraklar: RotaDuragi[];
}

/**
 * Bir durağın belirli bir araca eklenmesi ÖNİZLENİRKEN (bkz. `DurakDetayKarti`
 * → `onRotayaEklemeOnizle`) gösterilecek soluk rota — `duraklar` aracın MEVCUT
 * durakları + eklenmesi önizlenen durak, bu SIRAYLA. Onaylanana kadar hiçbir
 * plan state'i değişmez; bu yalnız görsel bir tahmin.
 */
export interface HaritaOnizleme {
  aracKod: string;
  renk: string;
  duraklar: RotaDuragi[];
}

interface RotaHaritasiProps {
  rotalar: HaritaRotasi[];
  /** Henüz atanmamış duraklar — soluk noktalarla gösterilir. */
  havuz: RotaDuragi[];
  /** Numaralı bir durağa ya da havuzdaki bir noktaya tıklanınca. */
  onDurakSec?: (secim: DurakSecimi) => void;
  /** Boş bir noktaya tıklanınca — açık kartı kapatmak için. */
  onBosaTikla?: () => void;
  /**
   * Belirli bir alana yumuşak kaydırma isteği — ör. Bölgeler listesinde bir
   * bölgeye tıklanınca. `zaman` her istekte değişir (aynı bölgeye art arda
   * tıklansa bile yeniden tetiklensin diye); `noktalar` boşsa hiçbir şey
   * olmaz.
   */
  ucusHedefi?: { noktalar: LngLat[]; zaman: number } | null;
  /** Eklenmesi önizlenen durak varsa o aracın soluk önizleme çizgisi. */
  onizleme?: HaritaOnizleme | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function popupHtml(title: string, subtitle?: string): string {
  const sub = subtitle
    ? `<div style="font-size:11px;opacity:0.7;margin-top:3px">${escapeHtml(subtitle)}</div>`
    : "";
  return `<div style="line-height:1.4;min-width:120px;padding:8px 10px;font-family:var(--font-geist-sans),system-ui,sans-serif">
    <div style="font-size:12px;font-weight:600">${escapeHtml(title)}</div>${sub}
  </div>`;
}

function createDepotEl(): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", DEPOT.label);
  el.title = `${DEPOT.label} — ${DEPOT.address}`;
  el.style.cssText =
    "display:flex;flex-direction:column;align-items:center;gap:3px;border:0;background:transparent;padding:0;cursor:pointer;filter:drop-shadow(0 2px 8px rgba(28,29,32,0.38))";
  el.innerHTML = `
    <span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;background:#1c1d20;border:2px solid #f4f4f5;color:#f4f4f5">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
        <path d="M9 21v-7h6v7" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
      </svg>
    </span>
    <span style="font:600 11px/1.3 var(--font-geist-sans),system-ui,sans-serif;color:#1c1d20;background:#f4f4f5;padding:2px 7px;border-radius:999px;border:1px solid rgba(28,29,32,0.12);white-space:nowrap">Depo</span>
  `;
  return el;
}

function createStopEl(index: number, label: string, renk: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `${index}. ${label}`);
  el.title = `${index}. ${label}`;
  el.style.cssText =
    `display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;border:2px solid #fff;background:${renk};color:#fff;font:700 12px/1 var(--font-geist-sans),system-ui,sans-serif;padding:0;cursor:pointer;box-shadow:0 1px 5px rgba(28,29,32,0.35)`;
  el.textContent = String(index);
  return el;
}

/**
 * Atanmamış (havuzdaki) durak — gri, üstü çizili, numarasız; yalnız konum
 * işareti kalır. Aynı işaret bir rotadan ÇIKARILAN durak için de kullanılıyor:
 * `durakCikar` sonrası durak zaten bu havuz listesine düşüyor, ayrı bir
 * "az önce çıkarıldı" durumu tutulmuyor — görsel olarak "artık rotada değil"
 * demek yeterli. Eskiden 11px düz nokta idi, tıklanabilir bir eylem taşımadığı
 * için göze çarpmıyordu; artık numaralı duraklarla aynı boyutta ve tıklanınca
 * "rotaya ekle" kartını açıyor.
 */
function createHavuzEl(label: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", label);
  el.title = `${label} — henüz araca atanmadı, rotaya eklemek için tıklayın`;
  el.style.cssText =
    "display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;border:0;background:transparent;padding:0;cursor:pointer;box-shadow:0 1px 5px rgba(28,29,32,0.35);border-radius:999px";
  el.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#94a3b8" stroke="#fff" stroke-width="2"/>
      <path d="M12 6.4a3.7 3.7 0 0 0-3.7 3.7c0 3 3.7 6.6 3.7 6.6s3.7-3.6 3.7-6.6A3.7 3.7 0 0 0 12 6.4Z" fill="#fff"/>
      <circle cx="12" cy="10" r="1.35" fill="#94a3b8"/>
      <line x1="4.5" y1="19.5" x2="19.5" y2="4.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  `;
  return el;
}

/** İki nokta arasındaki pusula açısı (derece, kuzey = 0). */
function yonAcisi(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const dLon = (b[0] - a[0]) * rad;
  const lat1 = a[1] * rad;
  const lat2 = b[1] * rad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Aracın depodan çıkış yönü — Navigation2 oku, ilk durağa doğru döndürülmüş.
 *
 * CANLI KONUM DEĞİL: Arvento bağlı olmadığı için aracın nerede olduğunu
 * bilmiyoruz. Bu imleç yalnız "bu araç depodan şu yöne çıkıyor" der; anlık
 * konum bağlandığında aynı imleç gerçek koordinata taşınır.
 */
function createYonEl(aracAd: string, renk: string, aci: number): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `${aracAd} — depodan çıkış yönü`);
  el.title = `${aracAd} — depodan çıkış yönü`;
  el.style.cssText =
    "width:30px;height:30px;display:flex;align-items:center;justify-content:center;pointer-events:none;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45))";
  el.innerHTML = `
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
         style="transform:rotate(${aci.toFixed(1)}deg);transform-origin:50% 50%">
      <polygon points="12 2 19 21 12 17 5 21 12 2"
               fill="${renk}" stroke="#ffffff" stroke-width="1.6"
               stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  `;
  return el;
}

function lineFeature(
  coords: LngLat[],
  renk: string,
  seritKaymasi: number
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: { renk, kaymasi: seritKaymasi },
    geometry: { type: "LineString", coordinates: coords },
  };
}

/** Aynı yolu paylaşan araçları ekranda ayırmak için piksel cinsinden şerit aralığı. */
const SERIT_ARALIGI_PX = 3.5;

/**
 * Bir aracın kaç numaralı "şeritte" çizileceği — `count` kadar araç aynı
 * yolu paylaşıyorsa (depodan çıkışta neredeyse hep öyle) çizgiler tam
 * üst üste binip yalnız birini gösteriyordu; her araca sabit küçük bir
 * perpendicular offset vererek Apple/Google'ın toplu taşıma haritalarındaki
 * gibi paralel, renk renk ayrılmış şeritler oluşturuyor. `index`, `rotalar`
 * dizisindeki sırası — aynı zamanda `aracRengi(index)`in kullandığı sıra,
 * yani renk ile şerit konumu hep eşleşir.
 */
function seritKaymasiHesapla(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * SERIT_ARALIGI_PX;
}

/**
 * Depo → 1 → 2 → … → depo. Kapalı halka, çünkü araç günün sonunda depoya
 * dönüyor (Melih 2026-09-02) ve dönüş bacağı hem mesafeye hem süreye giriyor.
 * Google isteğinde de `depoyaDonus: true` gönderiliyor; harita onunla aynı
 * güzergâhı çizmeli.
 */
function rotaNoktalari(duraklar: RotaDuragi[]): LngLat[] {
  const stops: LngLat[] = [];
  for (const d of duraklar) {
    if (d.lat == null || d.lon == null) continue;
    stops.push([d.lon, d.lat]);
  }
  return stops.length > 0 ? [DEPOT.lngLat, ...stops, DEPOT.lngLat] : [];
}

/**
 * Önizleme çizgisi — her zaman DÜZ (yol oturtma yok). Yalnız "araç seçiliyken
 * bekleme" anında görünen, henüz onaylanmamış bir tahmin; bunun için gerçek
 * bir Directions isteği atmak hem gereksiz gecikme hem gereksiz maliyet
 * olurdu — yalnız onaylanan rota `fetchDrivingRoute` çağırır.
 */
function onizlemeOzellikleri(
  onizleme: HaritaOnizleme | null | undefined,
  karanlikMi: boolean
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  if (!onizleme) return { type: "FeatureCollection", features: [] };
  const coords = rotaNoktalari(onizleme.duraklar);
  if (coords.length < 2) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [lineFeature(coords, haritaRengi(onizleme.renk, karanlikMi), 0)],
  };
}

/**
 * Plan haritası — araç başına ayrı renkli güzergâh, atanmamış duraklar soluk.
 * Yol oturtma mevcut Mapbox Directions katmanıyla; başarısız olursa düz çizgi.
 *
 * Harita instance'ı YALNIZ BİR KEZ kurulur (mount). `rotalar`/`havuz`
 * değiştiğinde harita SÖKÜLÜP YENİDEN KURULMUYOR — yalnız marker'lar ve rota
 * çizgisi güncelleniyor, kamera olduğu yerde kalıyor. Eskiden her durak
 * ekleme/çıkarmada (`planKey` değiştiğinde) tüm harita yeniden kuruluyordu:
 * stil+tile'lar yeniden yükleniyor, `revealStageVeil` perdesi tekrar
 * oynuyordu — kullanıcıya tam bir sayfa yenilemesi gibi görünüyordu.
 */
export function RotaHaritasi({
  rotalar,
  havuz,
  onDurakSec,
  onBosaTikla,
  ucusHedefi,
  onizleme,
}: RotaHaritasiProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageVeilRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleUrlRef = useRef<string | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  /** Sürüş rotası isteği — her `redraw` yenisini kurar, öncekini iptal eder. */
  const routeAbortRef = useRef<AbortController | null>(null);
  const { theme } = useTheme();
  // Harita init effect'i tema değerini ref üzerinden okur; ref render sırasında
  // değil effect'te güncellenir (react-hooks/refs).
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  /**
   * Tıklama callback'leri de ref üzerinden okunuyor — kurulum effect'i
   * yalnız mount'ta çalışıyor, sayfa her render'da yeni bir fonksiyon
   * kimliği geçse bile (useCallback'siz) haritayı etkilemesin.
   */
  const onDurakSecRef = useRef(onDurakSec);
  const onBosaTiklaRef = useRef(onBosaTikla);
  useEffect(() => {
    onDurakSecRef.current = onDurakSec;
    onBosaTiklaRef.current = onBosaTikla;
  }, [onDurakSec, onBosaTikla]);

  /** Yeniden çizim anahtarı — atama değişince güncellensin. */
  const planKey = useMemo(
    () =>
      JSON.stringify([
        rotalar.map((r) => [r.aracKod, r.renk, r.duraklar.map((d) => d.musteriKodu)]),
        havuz.map((d) => d.musteriKodu),
      ]),
    [rotalar, havuz]
  );

  /**
   * En güncel rotalar/havuz — kurulum effect'i yalnız mount'ta çalıştığı
   * için `style.load` (async, tile yüklemesi kadar geç tetiklenebilir) o
   * anki en taze veriyi buradan okumalı; mount anındaki closure değerini
   * değil (o an muhtemelen boş/başlangıç durumu).
   */
  const rotalarRef = useRef(rotalar);
  const havuzRef = useRef(havuz);
  const onizlemeRef = useRef(onizleme);
  useEffect(() => {
    rotalarRef.current = rotalar;
    havuzRef.current = havuz;
    onizlemeRef.current = onizleme;
  }, [rotalar, havuz, onizleme]);

  const ensureLineLayers = (map: mapboxgl.Map) => {
    if (!map.getSource(LINE_SOURCE)) {
      map.addSource(LINE_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }

    // Önizleme SIRADAN önce eklenir ki gerçek rota katmanının ALTINDA kalsın —
    // onaylanınca gerçek çizginin canlanma animasyonu bunun üstünden geçer.
    if (!map.getSource(PREVIEW_LINE_SOURCE)) {
      map.addSource(PREVIEW_LINE_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.getLayer(PREVIEW_LINE_LAYER)) {
      map.addLayer({
        id: PREVIEW_LINE_LAYER,
        type: "line",
        source: PREVIEW_LINE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "renk"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 3, 12, 6, 16, 9],
          "line-opacity": 0.38,
        },
      });
    }

    // Apple Maps deseni: kalın nötr kontur + üstünde dolgun renkli çekirdek.
    // Zoom'a göre kalınlaşıyor ki şehir içinde de kırsalda da okunur kalsın.
    if (!map.getLayer(LINE_CASING)) {
      map.addLayer({
        id: LINE_CASING,
        type: "line",
        source: LINE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": themeRef.current === "dark" ? "#0b0f14" : "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 6, 12, 10, 16, 14],
          "line-opacity": 0.9,
          "line-blur": 0.6,
          // Aynı yolu paylaşan araçlar üst üste binmesin — bkz. seritKaymasiHesapla.
          "line-offset": ["get", "kaymasi"],
        },
      });
    }
    if (!map.getLayer(LINE_LAYER)) {
      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: LINE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "renk"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 3, 12, 6, 16, 9],
          "line-opacity": 1,
          "line-offset": ["get", "kaymasi"],
        },
      });
    }

    // Gidiş yönü okları — Google/Apple'daki gibi çizgi boyunca tekrar eder.
    // Numaralı duraklar sırayı söylüyordu ama iki durak arasında aracın hangi
    // yöne aktığı okunmuyordu; dönüş bacağı gidiş bacağının üstüne bindiğinde
    // güzergâh özellikle karışık görünüyordu.
    if (!map.hasImage(ARROW_IMAGE)) {
      const img = okGoruntusu();
      if (img) map.addImage(ARROW_IMAGE, img, { pixelRatio: 2 });
    }
    if (map.hasImage(ARROW_IMAGE) && !map.getLayer(LINE_ARROWS)) {
      map.addLayer({
        id: LINE_ARROWS,
        type: "symbol",
        source: LINE_SOURCE,
        // Uzakta seyrek, yakında sık: z8'de her ~160px, z14'te her ~70px.
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 8, 160, 14, 70],
          "icon-image": ARROW_IMAGE,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 0.8],
          "icon-rotation-alignment": "map",
          "icon-pitch-alignment": "map",
          // Ok, çizgiyi takip ettiği için üst üste binmesi sorun değil;
          // eleme açık kalırsa kalabalık koridorda oklar kayboluyor.
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-offset": [0, 0],
        },
        paint: { "icon-opacity": 0.95 },
      });
    }
  };

  /**
   * Marker'ları ve rota çizgisini günceller — haritayı YENİDEN KURMADAN.
   * `fitCamera` yalnız ilk açılışta true: sonraki her düzenlemede kullanıcının
   * baktığı yer sabit kalır, ekleme/çıkarma "gerçek zamanlı" hissettirir.
   */
  const redraw = (
    map: mapboxgl.Map,
    rotalarGuncel: HaritaRotasi[],
    havuzGuncel: RotaDuragi[],
    fitCamera: boolean
  ) => {
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    // Yalnız haritadaki ÇİZİM için — bkz. `haritaRengi` tanımı.
    const karanlikMi = themeRef.current === "dark";

    markersRef.current.push(
      new mapboxgl.Marker({ element: createDepotEl(), anchor: "bottom" })
        .setLngLat(DEPOT.lngLat)
        .setPopup(
          new mapboxgl.Popup({ offset: 16, closeButton: false, className: "petshop-popup" }).setHTML(
            popupHtml(DEPOT.label, DEPOT.address)
          )
        )
        .addTo(map)
    );

    for (const rota of rotalarGuncel) {
      // Depoda, ilk durağa bakan yön oku — araç başına bir tane.
      const ilk = rota.duraklar.find((d) => d.lat != null && d.lon != null);
      if (ilk?.lat != null && ilk.lon != null) {
        const aci = yonAcisi(DEPOT.lngLat, [ilk.lon, ilk.lat]);
        markersRef.current.push(
          new mapboxgl.Marker({
            element: createYonEl(rota.aracAd, haritaRengi(rota.renk, karanlikMi), aci),
            anchor: "center",
            offset: [0, -34],
          })
            .setLngLat(DEPOT.lngLat)
            .addTo(map)
        );
      }

      rota.duraklar.forEach((d, i) => {
        if (d.lat == null || d.lon == null) return;
        const el = createStopEl(i + 1, d.unvan, haritaRengi(rota.renk, karanlikMi));
        // `baglam.renk` bilerek ORİJİNAL renk — durak kartı/sidebar noktaları
        // haritanın koyu-tema düzeltmesinden bağımsız, hep aynı tutarlı tonu
        // gösteriyor.
        const baglam: DurakRotaBaglami = {
          aracKod: rota.aracKod,
          aracAd: rota.aracAd,
          renk: rota.renk,
          sira: i + 1,
        };
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const nokta = map.project([d.lon!, d.lat!]);
          onDurakSecRef.current?.({ durak: d, rota: baglam, nokta: { x: nokta.x, y: nokta.y } });
        });
        markersRef.current.push(
          new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([d.lon, d.lat]).addTo(map)
        );
      });
    }

    for (const d of havuzGuncel) {
      if (d.lat == null || d.lon == null) continue;
      const el = createHavuzEl(d.unvan);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const nokta = map.project([d.lon!, d.lat!]);
        onDurakSecRef.current?.({ durak: d, rota: null, nokta: { x: nokta.x, y: nokta.y } });
      });
      markersRef.current.push(
        new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([d.lon, d.lat]).addTo(map)
      );
    }

    const duzCizgiler: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: rotalarGuncel
        .map((r, i) => ({
          coords: rotaNoktalari(r.duraklar),
          renk: haritaRengi(r.renk, karanlikMi),
          kaymasi: seritKaymasiHesapla(i, rotalarGuncel.length),
        }))
        .filter((x) => x.coords.length >= 2)
        .map((x) => lineFeature(x.coords, x.renk, x.kaymasi)),
    };
    (map.getSource(LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData(duzCizgiler);

    if (fitCamera) {
      const fitTargets: LngLat[] = [DEPOT.lngLat];
      for (const r of rotalarGuncel) {
        for (const d of r.duraklar) {
          if (d.lat != null && d.lon != null) fitTargets.push([d.lon, d.lat]);
        }
      }
      for (const d of havuzGuncel) {
        if (d.lat != null && d.lon != null) fitTargets.push([d.lon, d.lat]);
      }

      if (fitTargets.length === 1) {
        map.easeTo({ center: fitTargets[0], zoom: 11, duration: 0 });
      } else {
        const bounds = new mapboxgl.LngLatBounds();
        for (const c of fitTargets) bounds.extend(c);
        map.fitBounds(bounds, {
          padding: { top: 56, bottom: 48, left: 48, right: 56 },
          maxZoom: 12,
          duration: 0,
        });
      }
    }

    // Yolları oturt — önceki istek varsa iptal edilip yenisi kurulur, araç
    // başına tek istek; hata olursa düz çizgi kalır.
    routeAbortRef.current?.abort();
    const ac = new AbortController();
    routeAbortRef.current = ac;

    void Promise.all(
      rotalarGuncel.map(async (r, i) => {
        const coords = rotaNoktalari(r.duraklar);
        if (coords.length < 2) return null;
        const yol = await fetchDrivingRoute(coords, ac.signal);
        return lineFeature(
          yol ?? coords,
          haritaRengi(r.renk, karanlikMi),
          seritKaymasiHesapla(i, rotalarGuncel.length)
        );
      })
    )
      .then((features) => {
        if (ac.signal.aborted) return;
        const kalan = features.filter(
          (f): f is GeoJSON.Feature<GeoJSON.LineString> => f !== null
        );
        if (kalan.length === 0) return;
        const src = map.getSource(LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
        if (!src) return;
        // Güzergâh depodan başlayarak çiziliyor — PetshopMap'teki rota
        // animasyonunun aynısı; hareket azaltma açıksa anında görünür.
        void revealRouteLine(
          { type: "FeatureCollection", features: kalan },
          (fc) => src.setData(fc),
          { duration: 1.1, signal: ac.signal }
        );
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
      });
  };

  // Harita YALNIZ BİR KEZ kurulur (mount/unmount). Aşağıdaki ikinci effect
  // rotalar/havuz değiştiğinde devreye girer ve `redraw` ile günceller —
  // harita burada asla yeniden kurulmaz.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: el,
      ...mapRenderOptions(themeRef.current),
      center: DEPOT.lngLat,
      zoom: 11,
      attributionControl: false,
      // cooperativeGestures kapalı: "yakınlaştırmak için ctrl + kaydır"
      // uyarısı tam ekran planlama haritasında gereksiz engel.
      logoPosition: "bottom-left",
    });
    mapRef.current = map;
    styleUrlRef.current = mapboxStyleForTheme(themeRef.current);
    // +/- yakınlaştırma düğmeleri yalnız dokunmatikte: masaüstünde fare
    // tekerleği zaten var, düğmeler yalnız haritanın köşesini kaplıyordu.
    const dokunmatikDuzen =
      typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
    if (dokunmatikDuzen) {
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    }
    const unobserve = observeMapContainer(map, el);

    const onStyle = () => {
      applyMapRuntimeTuning(map, themeRef.current);
      ensureLineLayers(map);
      // İlk çizimde kamera fit edilir; sonraki her `redraw` (bkz. aşağıdaki
      // ikinci effect) kamerayı oynatmaz.
      redraw(map, rotalarRef.current, havuzRef.current, true);
      (map.getSource(PREVIEW_LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData(
        onizlemeOzellikleri(onizlemeRef.current, themeRef.current === "dark")
      );
    };

    map.on("style.load", onStyle);
    map.once("idle", () => revealStageVeil(stageVeilRef.current));
    // Boş bir noktaya tıklamak açık durak kartını kapatır — durak/depo
    // marker'ları kendi dinleyicilerinde `stopPropagation` çağırdığı için
    // bu yalnız gerçekten boş haritaya tıklanınca tetiklenir.
    map.on("click", () => onBosaTiklaRef.current?.());

    return () => {
      routeAbortRef.current?.abort();
      unobserve();
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // Kasıtlı olarak yalnız mount/unmount — bkz. üstteki not. rotalar/havuz
    // değişimi ayrı, aşağıdaki effect'in işi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotalar/havuz değişince: haritayı YENİDEN KURMADAN yalnız marker'ları ve
  // rota çizgisini güncelle. Kamerayı OYNATMIYOR — kullanıcı neye bakıyorsa
  // öyle kalır, ekleme/çıkarma bir "sayfa yenilemesi" gibi hissettirmez.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Stil henüz yüklenmediyse `onStyle` zaten ilk `redraw`'ı yapacak —
    // burada erken/eksik bir çizim denemeyelim.
    if (!map.isStyleLoaded()) return;
    redraw(map, rotalar, havuz, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  /**
   * Önizleme çizgisi — `redraw`'dan BİLEREK ayrı: `onizleme` her araç
   * seçiminde/vazgeçmede değişir, tam `redraw` (marker'lar + yol oturtma
   * isteği) baştan çalıştırmak gereksiz. Yalnız önizleme kaynağının verisini
   * anında (animasyonsuz) günceller — soluklaşma/kaybolma anlık olsun,
   * "canlanan" yalnız ONAYLANMIŞ gerçek rota (bkz. `redraw` içindeki
   * `revealRouteLine`).
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource(PREVIEW_LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(onizlemeOzellikleri(onizleme, themeRef.current === "dark"));
  }, [onizleme]);

  useEffect(() => {
    const map = mapRef.current;
    const next = mapboxStyleForTheme(theme);
    if (!map || styleUrlRef.current === next) return;
    styleUrlRef.current = next;
    try {
      map.stop();
    } catch {
      /* yok */
    }
    applyMapStyle(map, theme);
  }, [theme]);

  // Bölgeler listesinde bir bölgeye tıklanınca — diğer redraw'ların aksine
  // burada kamera BİLEREK oynuyor, kullanıcı "oraya git" dedi.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ucusHedefi || ucusHedefi.noktalar.length === 0) return;

    if (ucusHedefi.noktalar.length === 1) {
      map.flyTo({
        center: ucusHedefi.noktalar[0],
        zoom: Math.max(map.getZoom(), 12),
        duration: 1200,
        essential: true,
      });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    for (const c of ucusHedefi.noktalar) bounds.extend(c);
    map.fitBounds(bounds, {
      padding: { top: 56, bottom: 48, left: 48, right: 56 },
      maxZoom: 13,
      duration: 1200,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucusHedefi?.zaman]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-[13px] text-muted-foreground">
          NEXT_PUBLIC_MAPBOX_TOKEN tanımlı değil — harita gösterilemiyor.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div
        ref={stageVeilRef}
        className="pointer-events-none absolute inset-0 bg-background"
        aria-hidden
      />
    </div>
  );
}
