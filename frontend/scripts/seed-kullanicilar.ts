/**
 * Tek-kullanıcı env-tabanlı auth'tan (AUTH_USERNAME/AUTH_PASSWORD) çok-kullanıcı
 * Supabase Auth'a geçiş — bir kerelik provisioning.
 *
 * - Mevcut admin: AUTH_USERNAME/AUTH_PASSWORD'u .env.local'den okuyup AYNI
 *   kullanıcı adı/şifreyle Supabase Auth'a taşır (plaintext hiçbir yere
 *   yazılmaz/loglanmaz — yalnızca bu process'in belleğinde anlık kullanılır).
 * - Yeni kullanıcılar (Kenan + 4 satış temsilcisi): güçlü rastgele geçici
 *   şifre üretir, konsola BİR KEZ yazar.
 * - İdempotent — `kullanici_adi` zaten `public.kullanicilar`'da varsa atlanır,
 *   script güvenle tekrar çalıştırılabilir.
 *
 * ÇALIŞTIRMADAN ÖNCE: aşağıdaki YENI_KULLANICILAR dizisindeki soyad/kullanıcı
 * adı alanlarını gerçek değerlerle doldurun (bu görevde yalnızca ad verildi).
 *
 *   npm run seed:kullanicilar
 */
import { createSupabaseAdmin, KULLANICILAR_TABLE } from "../lib/supabase-admin";
import { usernameToEmail } from "../lib/kullanici-email";
import {
  gucluGeciciSifre,
  normalizeKullaniciAdi,
  rolBilgisiGetir,
} from "../lib/kullanici-provisioning";

interface YeniKullaniciTanimi {
  kullaniciAdi: string;
  adSoyad: string;
  rolKod: "admin" | "satis_temsilcisi";
}

// TODO: soyad/kullanıcı adlarını netleştirip güncelleyin.
const YENI_KULLANICILAR: YeniKullaniciTanimi[] = [
  { kullaniciAdi: "kenan.sarimehmet", adSoyad: "Kenan Sarımehmet", rolKod: "admin" },
  { kullaniciAdi: "samet", adSoyad: "Samet", rolKod: "satis_temsilcisi" },
  { kullaniciAdi: "gamze", adSoyad: "Gamze", rolKod: "satis_temsilcisi" },
  { kullaniciAdi: "derya", adSoyad: "Derya", rolKod: "satis_temsilcisi" },
  { kullaniciAdi: "anil", adSoyad: "Anıl", rolKod: "satis_temsilcisi" },
];

/** CLAUDE.md: müşteri kontağı Melih Sarıcaoğulu — mevcut admin hesabının sahibi. */
const MEVCUT_ADMIN_AD_SOYAD = "Melih Sarıcaoğulu";

const admin = createSupabaseAdmin();

interface SonucSatiri {
  kullaniciAdi: string;
  rol: string;
  durum: "oluşturuldu" | "zaten vardı, atlandı" | "HATA";
  geciciSifre?: string;
  detay?: string;
}

async function zatenVarMi(kullaniciAdi: string): Promise<boolean> {
  const { data } = await admin
    .from(KULLANICILAR_TABLE)
    .select("id")
    .eq("kullanici_adi", kullaniciAdi)
    .maybeSingle();
  return Boolean(data);
}

async function kullaniciOlustur(
  kullaniciAdiHam: string,
  adSoyad: string,
  rolKod: string,
  sabitSifre: string | null
): Promise<SonucSatiri> {
  const kullaniciAdi = normalizeKullaniciAdi(kullaniciAdiHam);
  const rolAdiEtiket = rolKod;

  if (await zatenVarMi(kullaniciAdi)) {
    return { kullaniciAdi, rol: rolAdiEtiket, durum: "zaten vardı, atlandı" };
  }

  const rol = await rolBilgisiGetir(admin, rolKod);
  if (!rol) {
    return {
      kullaniciAdi,
      rol: rolAdiEtiket,
      durum: "HATA",
      detay: `Rol bulunamadı: ${rolKod} (önce sql/roller_izinler_sema.sql uygulanmalı)`,
    };
  }

  const sifre = sabitSifre ?? gucluGeciciSifre();
  const email = usernameToEmail(kullaniciAdi);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: sifre,
    email_confirm: true,
    app_metadata: {
      rol: rol.kod,
      rol_adi: rol.ad,
      kullanici_adi: kullaniciAdi,
      ad_soyad: adSoyad,
      izinler: rol.izinler,
    },
  });

  if (createError || !created.user) {
    return {
      kullaniciAdi,
      rol: rolAdiEtiket,
      durum: "HATA",
      detay: createError?.message ?? "auth.admin.createUser başarısız",
    };
  }

  const { error: insertError } = await admin.from(KULLANICILAR_TABLE).insert({
    id: created.user.id,
    ad_soyad: adSoyad,
    kullanici_adi: kullaniciAdi,
    rol_id: rol.id,
    aktif: true,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return {
      kullaniciAdi,
      rol: rolAdiEtiket,
      durum: "HATA",
      detay: `kullanicilar insert: ${insertError.message}`,
    };
  }

  return {
    kullaniciAdi,
    rol: rolAdiEtiket,
    durum: "oluşturuldu",
    geciciSifre: sabitSifre ? undefined : sifre,
  };
}

async function main() {
  const sonuclar: SonucSatiri[] = [];

  const mevcutUsername = process.env.AUTH_USERNAME?.trim();
  const mevcutPassword = process.env.AUTH_PASSWORD?.trim();
  if (!mevcutUsername || !mevcutPassword) {
    console.error(
      "AUTH_USERNAME / AUTH_PASSWORD .env.local içinde tanımlı değil — mevcut admin taşınamıyor."
    );
    process.exit(1);
  }

  sonuclar.push(
    await kullaniciOlustur(
      mevcutUsername,
      MEVCUT_ADMIN_AD_SOYAD,
      "admin",
      mevcutPassword
    )
  );

  for (const yeni of YENI_KULLANICILAR) {
    sonuclar.push(
      await kullaniciOlustur(yeni.kullaniciAdi, yeni.adSoyad, yeni.rolKod, null)
    );
  }

  console.log("\n── Kullanıcı sağlama sonucu ──────────────────────────────\n");
  for (const s of sonuclar) {
    if (s.durum === "oluşturuldu") {
      const sifreMetni = s.geciciSifre
        ? `geçici şifre: ${s.geciciSifre}`
        : "mevcut şifresiyle taşındı";
      console.log(`✓ ${s.kullaniciAdi.padEnd(24)} ${s.rol.padEnd(18)} oluşturuldu — ${sifreMetni}`);
    } else if (s.durum === "zaten vardı, atlandı") {
      console.log(`· ${s.kullaniciAdi.padEnd(24)} ${s.rol.padEnd(18)} zaten vardı, atlandı`);
    } else {
      console.error(`✗ ${s.kullaniciAdi.padEnd(24)} ${s.rol.padEnd(18)} HATA: ${s.detay}`);
    }
  }
  console.log(
    "\nGeçici şifreler yalnızca burada, bir kez gösterildi — güvenli şekilde iletin.\n"
  );

  if (sonuclar.some((s) => s.durum === "HATA")) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
