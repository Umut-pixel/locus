/**
 * Login formu "Kullanıcı adı" alır — Supabase Auth email zorunlu kılıyor.
 * Bu dönüşüm login route'u, provisioning script'i ve Kullanıcılar API'si
 * arasında TUTARLI olmalı — biri farklı normalize ederse aynı kullanıcı
 * farklı email'lere düşer.
 */
const EMAIL_DOMAIN = "locus.internal";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLocaleLowerCase("tr-TR")}@${EMAIL_DOMAIN}`;
}
