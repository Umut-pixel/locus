function trKucuk(s: string): string {
  return s.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR");
}

/** Unvan zaten "(EDREMİT)" taşıyorsa ilçeyi bir daha yazma. */
export function unvanIlceIceriyor(unvan: string | null, ilce: string | null): boolean {
  if (!unvan || !ilce) return false;
  return trKucuk(unvan).includes(trKucuk(ilce.trim()));
}

/**
 * Unvandaki sondaki "(İLÇE)"yi ayır — dar sütunda ad kısalsın, ilçe
 * ayrı tutulabilsin. Eşleşmezse unvan olduğu gibi kalır.
 */
export function unvandanIlceAyir(
  unvan: string | null,
  ilce: string | null
): { ad: string; ilce: string | null } {
  const ham = (unvan ?? "").trim();
  const kayit = ilce?.trim() || null;
  if (!ham) return { ad: "", ilce: kayit };
  const son = /\s*\(([^)]+)\)\s*$/.exec(ham);
  if (son && kayit && trKucuk(son[1]) === trKucuk(kayit)) {
    return { ad: ham.slice(0, son.index).trim(), ilce: kayit };
  }
  return { ad: ham, ilce: kayit };
}
