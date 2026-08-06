import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MusteriGizlenen, PotansiyelGizlenen, RiskDurumu } from "@/lib/types";

export const APP_STATE_BUCKET = "app-state";
export const MUSTERI_GIZLE_OBJECT = "musteri_gizlenenler.json";
export const POTANSIYEL_GIZLE_OBJECT = "potansiyel_gizlenenler.json";

const RISK_SET = new Set<RiskDurumu>([
  "saglikli",
  "izlenmeli",
  "riskli",
  "hic_teslimat_yok",
]);

type StoredMusteriGizle = {
  gizle_id: string;
  musteri_kodu: string;
  olusturulma: string;
};

type StoredPotansiyelGizle = {
  gizle_id: string;
  potansiyel_id: string;
  olusturulma: string;
};

async function downloadJson<T>(
  admin: SupabaseClient,
  path: string
): Promise<T[]> {
  const { data, error } = await admin.storage
    .from(APP_STATE_BUCKET)
    .download(path);
  if (error) {
    // Dosya yoksa boş liste
    if (
      error.message?.includes("not found") ||
      error.message?.includes("Object not found")
    ) {
      return [];
    }
    throw new Error(error.message);
  }
  const text = await data.text();
  if (!text.trim()) return [];
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

async function uploadJson(
  admin: SupabaseClient,
  path: string,
  rows: unknown[]
): Promise<void> {
  const body = JSON.stringify(rows);
  const { error } = await admin.storage
    .from(APP_STATE_BUCKET)
    .upload(path, body, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(error.message);
}

function asRisk(raw: unknown): RiskDurumu | null {
  const s = raw != null ? String(raw) : null;
  return s && RISK_SET.has(s as RiskDurumu) ? (s as RiskDurumu) : null;
}

export async function listMusteriGizlenenStorage(
  admin: SupabaseClient
): Promise<MusteriGizlenen[]> {
  const stored = await downloadJson<StoredMusteriGizle>(
    admin,
    MUSTERI_GIZLE_OBJECT
  );
  if (stored.length === 0) return [];

  const codes = [...new Set(stored.map((s) => s.musteri_kodu))];
  const { data, error } = await admin
    .from("musteriler_harita")
    .select(
      "musteri_kodu,unvan,adres,sehir,ilce,lat,lon,risk_durumu"
    )
    .in("musteri_kodu", codes);

  if (error) throw new Error(error.message);

  const byKod = new Map<string, Record<string, unknown>>();
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    byKod.set(String(r.musteri_kodu), r);
  }

  const out: MusteriGizlenen[] = [];
  for (const s of stored) {
    const m = byKod.get(s.musteri_kodu);
    if (!m) continue;
    const lat = Number(m.lat);
    const lon = Number(m.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      gizle_id: s.gizle_id,
      olusturulma: s.olusturulma,
      musteri_kodu: s.musteri_kodu,
      unvan: String(m.unvan ?? s.musteri_kodu),
      adres: (m.adres as string | null) ?? null,
      sehir: (m.sehir as string | null) ?? null,
      ilce: (m.ilce as string | null) ?? null,
      lat,
      lon,
      risk_durumu: asRisk(m.risk_durumu),
    });
  }
  out.sort((a, b) => b.olusturulma.localeCompare(a.olusturulma));
  return out;
}

export async function toggleMusteriGizleStorage(
  admin: SupabaseClient,
  musteriKodu: string
): Promise<{ gizle: boolean }> {
  const stored = await downloadJson<StoredMusteriGizle>(
    admin,
    MUSTERI_GIZLE_OBJECT
  );
  const idx = stored.findIndex((s) => s.musteri_kodu === musteriKodu);
  if (idx >= 0) {
    stored.splice(idx, 1);
    await uploadJson(admin, MUSTERI_GIZLE_OBJECT, stored);
    return { gizle: false };
  }

  const check = await admin
    .from("musteriler")
    .select("musteri_kodu")
    .eq("musteri_kodu", musteriKodu)
    .maybeSingle();
  if (check.error) throw new Error(check.error.message);
  if (!check.data) throw new Error("Müşteri bulunamadı");

  stored.unshift({
    gizle_id: randomUUID(),
    musteri_kodu: musteriKodu,
    olusturulma: new Date().toISOString(),
  });
  await uploadJson(admin, MUSTERI_GIZLE_OBJECT, stored);
  return { gizle: true };
}

export async function listPotansiyelGizlenenStorage(
  admin: SupabaseClient
): Promise<PotansiyelGizlenen[]> {
  const stored = await downloadJson<StoredPotansiyelGizle>(
    admin,
    POTANSIYEL_GIZLE_OBJECT
  );
  if (stored.length === 0) return [];

  const ids = [...new Set(stored.map((s) => s.potansiyel_id))];
  const { data, error } = await admin
    .from("potansiyel_musteriler")
    .select(
      "id,kaynak_id,isim,adres,il,ilce,lat,lon,primary_type,google_types,kalite_bayragi,tarandigi_tarih"
    )
    .in("id", ids)
    .eq("eslesme_durumu", "yeni");

  if (error) throw new Error(error.message);

  const byId = new Map<string, Record<string, unknown>>();
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    byId.set(String(r.id), r);
  }

  const out: PotansiyelGizlenen[] = [];
  for (const s of stored) {
    const p = byId.get(s.potansiyel_id);
    if (!p) continue;
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      gizle_id: s.gizle_id,
      olusturulma: s.olusturulma,
      id: s.potansiyel_id,
      kaynak_id: (p.kaynak_id as string | null) ?? null,
      isim: (p.isim as string | null) ?? null,
      adres: (p.adres as string | null) ?? null,
      il: (p.il as string | null) ?? null,
      ilce: (p.ilce as string | null) ?? null,
      lat,
      lon,
      primary_type: (p.primary_type as string | null) ?? null,
      google_types: Array.isArray(p.google_types)
        ? (p.google_types as string[])
        : null,
      kalite_bayragi: (p.kalite_bayragi as string | null) ?? null,
      tarandigi_tarih: (p.tarandigi_tarih as string | null) ?? null,
    });
  }
  out.sort((a, b) => b.olusturulma.localeCompare(a.olusturulma));
  return out;
}

export async function togglePotansiyelGizleStorage(
  admin: SupabaseClient,
  potansiyelId: string
): Promise<{ gizle: boolean }> {
  const stored = await downloadJson<StoredPotansiyelGizle>(
    admin,
    POTANSIYEL_GIZLE_OBJECT
  );
  const idx = stored.findIndex((s) => s.potansiyel_id === potansiyelId);
  if (idx >= 0) {
    stored.splice(idx, 1);
    await uploadJson(admin, POTANSIYEL_GIZLE_OBJECT, stored);
    return { gizle: false };
  }

  const check = await admin
    .from("potansiyel_musteriler")
    .select("id")
    .eq("id", potansiyelId)
    .eq("eslesme_durumu", "yeni")
    .maybeSingle();
  if (check.error) throw new Error(check.error.message);
  if (!check.data) throw new Error("Potansiyel bulunamadı");

  stored.unshift({
    gizle_id: randomUUID(),
    potansiyel_id: potansiyelId,
    olusturulma: new Date().toISOString(),
  });
  await uploadJson(admin, POTANSIYEL_GIZLE_OBJECT, stored);
  return { gizle: true };
}

/** Tablo varsa view’dan oku; yoksa Storage JSON. */
export async function listMusteriGizlenen(
  admin: SupabaseClient
): Promise<MusteriGizlenen[]> {
  const { data, error } = await admin
    .from("musteri_gizlenenler_liste")
    .select(
      "gizle_id,olusturulma,musteri_kodu,unvan,adres,sehir,ilce,lat,lon,risk_durumu"
    )
    .order("olusturulma", { ascending: false });

  if (!error && data) {
    const out: MusteriGizlenen[] = [];
    for (const row of data) {
      const r = row as Record<string, unknown>;
      const lat = Number(r.lat);
      const lon = Number(r.lon);
      const kod = r.musteri_kodu != null ? String(r.musteri_kodu) : "";
      const gizleId = r.gizle_id != null ? String(r.gizle_id) : "";
      if (!kod || !gizleId || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }
      out.push({
        gizle_id: gizleId,
        olusturulma: String(r.olusturulma ?? ""),
        musteri_kodu: kod,
        unvan: String(r.unvan ?? kod),
        adres: (r.adres as string | null) ?? null,
        sehir: (r.sehir as string | null) ?? null,
        ilce: (r.ilce as string | null) ?? null,
        lat,
        lon,
        risk_durumu: asRisk(r.risk_durumu),
      });
    }
    return out;
  }

  return listMusteriGizlenenStorage(admin);
}

export async function toggleMusteriGizle(
  admin: SupabaseClient,
  musteriKodu: string
): Promise<{ gizle: boolean }> {
  const existing = await admin
    .from("musteri_gizlenenler")
    .select("id")
    .eq("musteri_kodu", musteriKodu)
    .maybeSingle();

  if (!existing.error) {
    if (existing.data) {
      const { error } = await admin
        .from("musteri_gizlenenler")
        .delete()
        .eq("musteri_kodu", musteriKodu);
      if (error) throw new Error(error.message);
      return { gizle: false };
    }
    const check = await admin
      .from("musteriler")
      .select("musteri_kodu")
      .eq("musteri_kodu", musteriKodu)
      .maybeSingle();
    if (check.error) throw new Error(check.error.message);
    if (!check.data) throw new Error("Müşteri bulunamadı");
    const { error } = await admin
      .from("musteri_gizlenenler")
      .insert({ musteri_kodu: musteriKodu });
    if (error) throw new Error(error.message);
    return { gizle: true };
  }

  return toggleMusteriGizleStorage(admin, musteriKodu);
}

export async function listPotansiyelGizlenen(
  admin: SupabaseClient
): Promise<PotansiyelGizlenen[]> {
  const { data, error } = await admin
    .from("potansiyel_gizlenenler_liste")
    .select(
      "gizle_id,olusturulma,id,kaynak_id,isim,adres,il,ilce,lat,lon,primary_type,google_types,kalite_bayragi,tarandigi_tarih"
    )
    .order("olusturulma", { ascending: false });

  if (!error && data) {
    const out: PotansiyelGizlenen[] = [];
    for (const row of data) {
      const r = row as Record<string, unknown>;
      const lat = Number(r.lat);
      const lon = Number(r.lon);
      const id = r.id != null ? String(r.id) : "";
      const gizleId = r.gizle_id != null ? String(r.gizle_id) : "";
      if (!id || !gizleId || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }
      out.push({
        gizle_id: gizleId,
        olusturulma: String(r.olusturulma ?? ""),
        id,
        kaynak_id: (r.kaynak_id as string | null) ?? null,
        isim: (r.isim as string | null) ?? null,
        adres: (r.adres as string | null) ?? null,
        il: (r.il as string | null) ?? null,
        ilce: (r.ilce as string | null) ?? null,
        lat,
        lon,
        primary_type: (r.primary_type as string | null) ?? null,
        google_types: Array.isArray(r.google_types)
          ? (r.google_types as string[])
          : null,
        kalite_bayragi: (r.kalite_bayragi as string | null) ?? null,
        tarandigi_tarih: (r.tarandigi_tarih as string | null) ?? null,
      });
    }
    return out;
  }

  return listPotansiyelGizlenenStorage(admin);
}

export async function togglePotansiyelGizle(
  admin: SupabaseClient,
  potansiyelId: string
): Promise<{ gizle: boolean }> {
  const existing = await admin
    .from("potansiyel_gizlenenler")
    .select("id")
    .eq("potansiyel_id", potansiyelId)
    .maybeSingle();

  if (!existing.error) {
    if (existing.data) {
      const { error } = await admin
        .from("potansiyel_gizlenenler")
        .delete()
        .eq("potansiyel_id", potansiyelId);
      if (error) throw new Error(error.message);
      return { gizle: false };
    }
    const check = await admin
      .from("potansiyel_musteriler")
      .select("id")
      .eq("id", potansiyelId)
      .eq("eslesme_durumu", "yeni")
      .maybeSingle();
    if (check.error) throw new Error(check.error.message);
    if (!check.data) throw new Error("Potansiyel bulunamadı");
    const { error } = await admin
      .from("potansiyel_gizlenenler")
      .insert({ potansiyel_id: potansiyelId });
    if (error) throw new Error(error.message);
    return { gizle: true };
  }

  return togglePotansiyelGizleStorage(admin, potansiyelId);
}
