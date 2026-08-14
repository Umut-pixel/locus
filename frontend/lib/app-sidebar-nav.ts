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
}

export interface SidebarNavItem extends SidebarNavLeaf {
  children?: SidebarNavLeaf[];
}

/**
 * Uygulama içi sayfa navigasyonu. `href`'i olanlar gerçek route — aktiflik
 * usePathname ile hesaplanır (bkz. AppSidebarNavItem). Diğerleri ileride
 * bağlanacak yer tutuculardır.
 */
export const MAIN_NAV: SidebarNavItem[] = [
  {
    id: "harita",
    label: "Harita",
    icon: MapIcon,
    href: "/",
    children: [
      { id: "harita-musteri", label: "Müşteri Haritası", icon: UsersIcon },
      { id: "harita-potansiyel", label: "Potansiyel Müşteriler", icon: SparklesIcon },
    ],
  },
  { id: "rotalar", label: "Rotalar", icon: RouteIcon },
  {
    id: "raporlar",
    label: "Raporlar",
    icon: BarChart3Icon,
    href: "/raporlar",
    children: [
      { id: "raporlar-musteri", label: "Müşteri Raporlama", icon: UsersIcon, href: "/raporlar" },
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
  { id: "ayarlar", label: "Ayarlar", icon: SettingsIcon },
];

/** Sık kullanılan araçlar — mevcut harita sayfasındaki gerçek özelliklerin karşılığı. */
export const TOOLS_NAV: SidebarNavLeaf[] = [
  { id: "veri-yukle", label: "Veri Yükle", icon: UploadIcon },
  { id: "favoriler", label: "Favoriler", icon: StarIcon },
  { id: "gizlenenler", label: "Gizlenenler", icon: EyeOffIcon },
  { id: "panorama-senkron", label: "Panorama Senkron", icon: RefreshCwIcon },
];

/** README.md geocode kapsam özeti — statik. Gerçek sayı için musteriler_harita'ya bağlanabilir. */
export const HARITA_KAPSAMI = {
  konumlanan: 1203,
  toplam: 1292,
} as const;
