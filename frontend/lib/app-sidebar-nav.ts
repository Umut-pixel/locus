import {
  BanknoteIcon,
  BarChart3Icon,
  BoxesIcon,
  BrainCircuitIcon,
  MapIcon,
  RouteIcon,
  SettingsIcon,
  SparklesIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

import type { IzinKodu } from "@/lib/permissions";

export interface SidebarNavLeaf {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Gerçek route'u olan öğeler Link olarak render edilir; yoksa yer tutucu buton. */
  href?: string;
  /** Operasyonel canlı nokta (ör. Panorama transform bekliyor). */
  liveKey?: "panorama";
  /** href'i olan öğeler için gereken izin — yoksa herkese (girişli) açık. */
  izin?: IzinKodu;
}

export interface SidebarNavItem extends SidebarNavLeaf {
  children?: SidebarNavLeaf[];
}

export interface NavSectionConfig {
  id: string;
  label: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  items: SidebarNavItem[];
  /** Section'ın tamamı (KonusmalarNav gibi ayrı render edilenler dahil) için izin. */
  sectionIzin?: IzinKodu;
}

/**
 * Tek kaynak — sidebar, mobil sheet ve ileride ⌘K aynı ağacı okur.
 *
 * Komuta / Operasyon / Araçlar: günlük döngü önde, altyapı gruplu.
 * Alt öğeler (Harita, Raporlar) in-page sekmelerin yanındaki nested ağaç —
 * açılışta yükseklik animasyonu korunur.
 */
export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: "komuta",
    label: "Komuta",
    items: [
      {
        id: "analyst",
        label: "Analyst",
        icon: BrainCircuitIcon,
        href: "/home",
        izin: "ai_sohbet",
      },
      {
        id: "harita",
        label: "Harita",
        icon: MapIcon,
        href: "/harita",
        izin: "harita",
        children: [
          { id: "harita-musteri", label: "Müşteri Haritası", icon: UsersIcon },
          {
            id: "harita-potansiyel",
            label: "Potansiyel Müşteriler",
            icon: SparklesIcon,
          },
        ],
      },
      {
        id: "rotalar",
        label: "Rotalar",
        icon: RouteIcon,
        href: "/rotalar",
        izin: "rota_planlama",
        children: [
          {
            id: "rotalar-planlama",
            label: "Planlama",
            icon: RouteIcon,
            href: "/rotalar",
            izin: "rota_planlama",
          },
          {
            id: "rotalar-harita",
            label: "Rota Haritası",
            icon: MapIcon,
            href: "/rotalar/harita",
            izin: "rota_planlama",
          },
        ],
      },
    ],
  },
  {
    id: "operasyon",
    label: "Operasyon",
    items: [
      {
        id: "raporlar",
        label: "Raporlar",
        icon: BarChart3Icon,
        href: "/raporlar",
        izin: "musteri_raporlama",
        children: [
          {
            id: "raporlar-musteri",
            label: "Müşteri Raporlama",
            icon: UsersIcon,
            href: "/raporlar",
            izin: "musteri_raporlama",
          },
          {
            id: "raporlar-finansal",
            label: "Finansal Raporlar",
            icon: BanknoteIcon,
            href: "/raporlar/finansal",
            izin: "finansal_raporlar",
          },
          {
            id: "raporlar-tahsilat",
            label: "Tahsilat",
            icon: WalletIcon,
            href: "/raporlar/tahsilat",
            izin: "tahsilat_raporlari",
          },
          {
            id: "raporlar-sevkiyat",
            label: "Sevkiyat Raporları",
            icon: TruckIcon,
            href: "/raporlar/sevkiyat",
            izin: "sevkiyat_raporlari",
          },
          {
            id: "raporlar-stok",
            label: "Stok Raporları",
            icon: BoxesIcon,
            href: "/raporlar/stok",
            izin: "stok_raporlari",
          },
        ],
      },
    ],
  },
  {
    id: "konusmalar",
    label: "Konuşmalar",
    collapsible: true,
    defaultCollapsed: false,
    sectionIzin: "ai_sohbet",
    items: [],
  },
];

export const FOOTER_NAV: SidebarNavLeaf[] = [
  // izin YOK, bilerek — Ayarlar'daki Hesabım sekmesi (şifre değiştirme)
  // herkese açık, admin'e özel sekmeler sayfa içinde filtreleniyor.
  { id: "ayarlar", label: "Ayarlar", icon: SettingsIcon, href: "/ayarlar" },
];

/**
 * Rol/izin filtresi — href'li bir öğe izinsizse gizlenir; çocuklarından en az
 * biri izinliyse ebeveyn kalır ama kendi href'i düşer (inert grup başlığına
 * döner, AppSidebarNavItem zaten href yoksa buton render ediyor).
 */
export function filterNavByIzinler(
  sections: NavSectionConfig[],
  izinler: readonly IzinKodu[]
): NavSectionConfig[] {
  const has = new Set(izinler);
  const izinliMi = (izin?: IzinKodu) => !izin || has.has(izin);

  return sections
    .filter((section) => izinliMi(section.sectionIzin))
    .map((section) => ({
      ...section,
      items: filterNavItems(section.items, izinliMi),
    }));
}

export function filterFooterNavByIzinler(
  items: SidebarNavLeaf[],
  izinler: readonly IzinKodu[]
): SidebarNavLeaf[] {
  const has = new Set(izinler);
  return items.filter((item) => !item.izin || has.has(item.izin));
}

function filterNavItems(
  items: SidebarNavItem[],
  izinliMi: (izin?: IzinKodu) => boolean
): SidebarNavItem[] {
  const result: SidebarNavItem[] = [];
  for (const item of items) {
    const children = item.children?.filter((c) => izinliMi(c.izin));
    const ownVisible = izinliMi(item.izin);
    const hasVisibleChildren = (children?.length ?? 0) > 0;
    if (!ownVisible && !hasVisibleChildren) continue;
    result.push({
      ...item,
      href: ownVisible ? item.href : undefined,
      children,
    });
  }
  return result;
}

/** @deprecated NAV_SECTIONS kullanın — geriye dönük düz liste. */
export const MAIN_NAV: SidebarNavItem[] = NAV_SECTIONS.filter(
  (s) => s.id !== "konusmalar"
).flatMap((s) => s.items);

/** @deprecated NAV_SECTIONS.konusmalar — liste KonusmalarNav'da. */
export const TOOLS_NAV: SidebarNavLeaf[] = [];

export function isNavItemActive(
  pathname: string | null,
  href: string | undefined
): boolean {
  if (!pathname || !href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

