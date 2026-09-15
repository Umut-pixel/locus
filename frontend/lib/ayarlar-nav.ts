import {
  BellIcon,
  BrainCircuitIcon,
  DatabaseIcon,
  MapPinnedIcon,
  UserCircleIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import type { IzinKodu } from "@/lib/permissions";

export type AyarlarTabId =
  | "hesabim"
  | "veri"
  | "analyst"
  | "harita"
  | "bildirimler"
  | "kullanicilar";

export interface AyarlarTabConfig {
  id: AyarlarTabId;
  label: string;
  icon: LucideIcon;
  /** Sekmeyi görmek için gereken ek izin — yoksa `/ayarlar`'a erişen HERKESE
   *  açık (route'un kendisi artık izin gerektirmiyor, bkz. permissions.ts). */
  izin?: IzinKodu;
}

export const AYARLAR_TABS: AyarlarTabConfig[] = [
  { id: "hesabim", label: "Hesabım", icon: UserCircleIcon },
  { id: "veri", label: "Veri", icon: DatabaseIcon, izin: "ayarlar" },
  { id: "analyst", label: "Analyst", icon: BrainCircuitIcon, izin: "ayarlar" },
  // MapIcon değil, bilerek — bu /harita sayfası değil, kapsam/geocode durumu.
  { id: "harita", label: "Harita", icon: MapPinnedIcon, izin: "ayarlar" },
  { id: "bildirimler", label: "Bildirimler", icon: BellIcon, izin: "ayarlar" },
  {
    id: "kullanicilar",
    label: "Kullanıcılar",
    icon: UsersIcon,
    izin: "kullanici_yonetimi",
  },
];
