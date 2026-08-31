import "server-only";

import {
  AGENT_KONUSMALAR_TABLE,
  createSupabaseAdmin,
} from "@/lib/supabase-admin";

/** Sohbet route'unun ihtiyaç duyduğu asgari kimlik. */
export type KonusmaKimlik = {
  id: string;
  siraNo: number;
  baslik: string;
};

const KIMLIK_SELECT = "id,sira_no,baslik";

function asKimlik(raw: Record<string, unknown> | null): KonusmaKimlik | null {
  if (!raw) return null;
  const id = raw.id != null ? String(raw.id) : "";
  const siraNo = Number(raw.sira_no ?? 0);
  if (!id || !Number.isSafeInteger(siraNo) || siraNo <= 0) return null;
  return {
    id,
    siraNo,
    baslik: typeof raw.baslik === "string" ? raw.baslik : "Yeni konuşma",
  };
}

/** /sohbet/{slug}-{no} çözümü — anahtar sira_no, slug kozmetik. */
export async function konusmaBySiraNo(
  siraNo: number
): Promise<KonusmaKimlik | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from(AGENT_KONUSMALAR_TABLE)
    .select(KIMLIK_SELECT)
    .eq("sira_no", siraNo)
    .maybeSingle();
  if (error) return null;
  return asKimlik(data as Record<string, unknown> | null);
}

/** Eski /home?k=<uuid> yer imlerini kanonik sohbet URL'ine taşımak için. */
export async function konusmaById(id: string): Promise<KonusmaKimlik | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from(AGENT_KONUSMALAR_TABLE)
    .select(KIMLIK_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return asKimlik(data as Record<string, unknown> | null);
}
