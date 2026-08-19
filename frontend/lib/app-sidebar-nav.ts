import {
  BanknoteIcon,
  BarChart3Icon,
  BoxesIcon,
  EyeOffIcon,
  MapIcon,
  RefreshCwIcon,
  RouteIcon,
  SettingsIcon,
  SparklesIcon,
  StarIcon,
  TruckIcon,
  UploadIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export interface SidebarNavLeaf {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Gerçek route'u olan öğeler Link olarak render edilir; yoksa yer tutucu buton. */
  href?: string;
  /** Operasyonel canlı nokta (ör. Panorama transform bekliyor). */
  liveKey?: "panorama";
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
        id: "harita",
        label: "Harita",
        icon: MapIcon,
        href: "/",
        children: [
          { id: "harita-musteri", label: "Müşteri Haritası", icon: UsersIcon },
          {
            id: "harita-potansiyel",
            label: "Potansiyel Müşteriler",
            icon: SparklesIcon,
          },
        ],
      },
      { id: "rotalar", label: "Rotalar", icon: RouteIcon },
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
        children: [
          {
            id: "raporlar-musteri",
            label: "Müşteri Raporlama",
            icon: UsersIcon,
            href: "/raporlar",
          },
          {
            id: "raporlar-finansal",
            label: "Finansal Raporlar",
            icon: BanknoteIcon,
            href: "/raporlar/finansal",
          },
          {
            id: "raporlar-sevkiyat",
            label: "Sevkiyat Raporları",
            icon: TruckIcon,
            href: "/raporlar/sevkiyat",
          },
          {
            id: "raporlar-stok",
            label: "Stok Raporları",
            icon: BoxesIcon,
            href: "/raporlar/stok",
          },
        ],
      },
    ],
  },
  {
    id: "araclar",
    label: "Araçlar",
    collapsible: true,
    defaultCollapsed: false,
    items: [
      { id: "veri-yukle", label: "Veri Yükle", icon: UploadIcon },
      { id: "favoriler", label: "Favoriler", icon: StarIcon },
      { id: "gizlenenler", label: "Gizlenenler", icon: EyeOffIcon },
      {
        id: "panorama-senkron",
        label: "Panorama Senkron",
        icon: RefreshCwIcon,
        liveKey: "panorama",
      },
    ],
  },
];

export const FOOTER_NAV: SidebarNavLeaf[] = [
  { id: "ayarlar", label: "Ayarlar", icon: SettingsIcon },
];

/** @deprecated NAV_SECTIONS kullanın — geriye dönük düz liste. */
export const MAIN_NAV: SidebarNavItem[] = NAV_SECTIONS.filter(
  (s) => s.id !== "araclar"
).flatMap((s) => s.items);

/** @deprecated NAV_SECTIONS.araclar */
export const TOOLS_NAV: SidebarNavLeaf[] = NAV_SECTIONS.find(
  (s) => s.id === "araclar"
)!.items;

export function isNavItemActive(
  pathname: string | null,
  href: string | undefined
): boolean {
  if (!pathname || !href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** README.md geocode kapsam özeti — statik. */
export const HARITA_KAPSAMI = {
  konumlanan: 1203,
  toplam: 1292,
} as const;
