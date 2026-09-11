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

type LngLat = [number, number];

export interface HaritaRotasi {
  aracKod: string;
  aracAd: string;
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
export function RotaHaritasi({ rotalar, havuz, onDurakSec, onBosaTikla }: RotaHaritasiProps) {
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
  useEffect(() => {
    rotalarRef.current = rotalar;
    havuzRef.current = havuz;
  }, [rotalar, havuz]);

  const ensureLineLayers = (map: mapboxgl.Map) => {
    if (!map.getSource(LINE_SOURCE)) {
      map.addSource(LINE_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
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
            element: createYonEl(rota.aracAd, rota.renk, aci),
            anchor: "center",
            offset: [0, -34],
          })
            .setLngLat(DEPOT.lngLat)
            .addTo(map)
        );
      }

      rota.duraklar.forEach((d, i) => {
        if (d.lat == null || d.lon == null) return;
        const el = createStopEl(i + 1, d.unvan, rota.renk);
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
          renk: r.renk,
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
        return lineFeature(yol ?? coords, r.renk, seritKaymasiHesapla(i, rotalarGuncel.length));
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
