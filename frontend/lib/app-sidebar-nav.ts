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
        id: "analyst",
        label: "Analyst",
        icon: BrainCircuitIcon,
        href: "/home",
      },
      {
        id: "harita",
        label: "Harita",
        icon: MapIcon,
        href: "/harita",
        children: [
          { id: "harita-musteri", label: "Müşteri Haritası", icon: UsersIcon },
          {
            id: "harita-potansiyel",
            label: "Potansiyel Müşteriler",
            icon: SparklesIcon,
          },
        ],
      },
      { id: "rotalar", label: "Rotalar", icon: RouteIcon, href: "/rotalar" },
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
            id: "raporlar-tahsilat",
            label: "Tahsilat",
            icon: WalletIcon,
            href: "/raporlar/tahsilat",
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
    id: "konusmalar",
    label: "Konuşmalar",
    collapsible: true,
    defaultCollapsed: false,
    items: [],
  },
];

export const FOOTER_NAV: SidebarNavLeaf[] = [
  { id: "ayarlar", label: "Ayarlar", icon: SettingsIcon, href: "/ayarlar" },
];

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

