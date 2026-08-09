import {
  BarChart3Icon,
  EyeOffIcon,
  MapIcon,
  PinIcon,
  RefreshCwIcon,
  RouteIcon,
  SettingsIcon,
  SparklesIcon,
  StarIcon,
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
  { id: "raporlar", label: "Raporlar", icon: BarChart3Icon, href: "/raporlar" },
  { id: "ayarlar", label: "Ayarlar", icon: SettingsIcon },
];

/** Sık kullanılan araçlar — mevcut harita sayfasındaki gerçek özelliklerin karşılığı. */
export const TOOLS_NAV: SidebarNavLeaf[] = [
  { id: "veri-yukle", label: "Veri Yükle", icon: UploadIcon },
  { id: "favoriler", label: "Favoriler", icon: StarIcon },
  { id: "gizlenenler", label: "Gizlenenler", icon: EyeOffIcon },
  { id: "panorama-senkron", label: "Panorama Senkron", icon: RefreshCwIcon },
];

export interface SidebarListRow {
  id: string;
  label: string;
  icon?: LucideIcon;
}

/** Statik/mock içerik — backend entegrasyonu sonraki aşamada yapılacak. */
export const PINNED_ITEMS: SidebarListRow[] = [
  { id: "pinned-1", label: "İzmir — riskli müşteriler", icon: PinIcon },
  { id: "pinned-2", label: "Bu haftaki teslimat rotası", icon: PinIcon },
];

/** ORB asistanının (bkz. AgentAssistant) ileride kalıcı geçmişi olursa buraya bağlanır. */
export const RECENT_ITEMS: SidebarListRow[] = [
  { id: "recent-1", label: "İzmir'de kaç riskli müşteri var?" },
  { id: "recent-2", label: "Bu ay en çok sipariş veren müşteri" },
  { id: "recent-3", label: "Balıkesir rotasındaki müşteriler" },
];

/** README.md geocode kapsam özeti — statik. Gerçek sayı için musteriler_harita'ya bağlanabilir. */
export const HARITA_KAPSAMI = {
  konumlanan: 1203,
  toplam: 1292,
} as const;
