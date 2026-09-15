import crypto from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { IZIN_KODLARI, type IzinKodu } from "./permissions";
import { IZINLER_TABLE, ROL_IZINLERI_TABLE, ROLLER_TABLE } from "./supabase-admin";

/** Paylaşılan — API route'ları VE frontend/scripts/seed-kullanicilar.ts kullanır. */

/**
 * Basit geçici şifre — WhatsApp/telefonla iletilecek, karışan karakter yok
 * (0/O, 1/I/L elendi), sembol yok, tek parça büyük harf+rakam. Self-servis
 * şifre değiştirme akışı olmadığı için bu şifreler fiilen kalıcı — yine de
 * kullanıcı isteği üzerine güç yerine okunabilirlik/basitlik önceliklendi.
 */
const BASIT_SIFRE_ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BASIT_SIFRE_UZUNLUK = 8;

export function gucluGeciciSifre(): string {
  const bytes = crypto.randomBytes(BASIT_SIFRE_UZUNLUK);
  let sifre = "";
  for (let i = 0; i < BASIT_SIFRE_UZUNLUK; i++) {
    sifre += BASIT_SIFRE_ALFABE[bytes[i]! % BASIT_SIFRE_ALFABE.length];
  }
  return sifre;
}

export interface RolBilgisi {
  id: number;
  kod: string;
  ad: string;
  izinler: IzinKodu[];
}

/** Rol koduna göre id + o rolün taşıdığı izin kodları (rol_izinleri join). */
export async function rolBilgisiGetir(
  admin: SupabaseClient,
  rolKod: string
): Promise<RolBilgisi | null> {
  const { data: rol, error: rolError } = await admin
    .from(ROLLER_TABLE)
    .select("id, kod, ad")
    .eq("kod", rolKod)
    .maybeSingle();
  if (rolError || !rol) return null;

  const { data: mapRows, error: mapError } = await admin
    .from(ROL_IZINLERI_TABLE)
    .select("izin_id")
    .eq("rol_id", rol.id as number);
  if (mapError) return null;

  const izinIds = (mapRows ?? []).map((r) => r.izin_id as number);
  if (izinIds.length === 0) {
    return { id: rol.id as number, kod: rol.kod as string, ad: rol.ad as string, izinler: [] };
  }

  const { data: izinRows, error: izinError } = await admin
    .from(IZINLER_TABLE)
    .select("kod")
    .in("id", izinIds);
  if (izinError) return null;

  const izinler = (izinRows ?? [])
    .map((r) => r.kod as string)
    .filter((k): k is IzinKodu => (IZIN_KODLARI as readonly string[]).includes(k));

  return { id: rol.id as number, kod: rol.kod as string, ad: rol.ad as string, izinler };
}

/** Kullanıcı adını Supabase Auth email'iyle aynı normalize kurala tabi tutar. */
export function normalizeKullaniciAdi(raw: string): string {
  return raw.trim().toLocaleLowerCase("tr-TR");
}
