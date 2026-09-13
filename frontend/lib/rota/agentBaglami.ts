/**
 * AI orb'unun (`RotaHaritaAiBubble`) her mesajda göreceği sayfa-durumu metni.
 *
 * Saf fonksiyon, ağ çağrısı YOK — girdinin tamamı zaten `harita/page.tsx` ve
 * `RotaPlaniProvider`'da client-side hesaplanmış durumdan geliyor (PlanMetrigi,
 * Kriter[] zaten ücretsiz). Amaç: modele ham durak satırları değil, ekranda
 * insanın zaten gördüğü ÖZETİ vermek — hem token maliyetini düşük tutar hem de
 * modelin gördüğü ile kullanıcının gördüğünü aynı kaynaktan besler.
 *
 * `RotaHaritaEylemBaglami.ts` ile aynı ilke: model asla dahili kod (aracKod,
 * bolgeKod, musteriKodu) görmez, yalnız ekranda görünen adları.
 */

import type { PlanMetrigi } from "./planla";
import type { Kriter } from "./kriter";

export interface RotaAgentOdakliArac {
  ad: string;
  duraklar: { unvan: string; ilce: string | null }[];
}

export interface RotaAgentBaglamGirdisi {
  /** Geçmiş/kayıtlı (dondurulmuş, salt-okunur) mod mu, yoksa canlı taslak mı. */
  gecmisMod: boolean;
  /** Geçmiş moddaysa görüntülenen tarihin biçimlendirilmiş hâli (`tarihMetni`). */
  gecmisTarihMetni: string | null;

  /** Yüklü araçların adları — yalnız isim listesi, ucuz. `harita_eylemi`
   * (`araci_filtrele`) ve `rota_onerisi` (`hedefArac`) bu isimlerden birini
   * seçebilmek için buna muhtaç; olmasaydı model hiçbir aracı adıyla
   * öneremezdi. */
  aracAdlari: string[];
  /** Tanımlı bölgelerin adları — aynı gerekçeyle (`bolgeyi_filtrele`). */
  bolgeAdlari: string[];

  /** Geçerli seçimin insan-okur açıklaması (ör. "Isuzu 3D aracı"). null = seçim yok. */
  secimAciklamasi: string | null;
  /** Haritada/panelde açık durak kartının adı (varsa). */
  seciliDurakAdi: string | null;

  /** Yalnız bir araca odaklanıldığında dolu — o aracın sıralı durak listesi. */
  odakliArac: RotaAgentOdakliArac | null;

  /** Zaten ücretsiz hesaplanmış plan özeti (`planMetrigi`). */
  metrik: PlanMetrigi;
  /** Plan karnesi satırları (`kriterleriHesapla`) — boş dizi de olabilir. */
  kriterler: Kriter[];

  havuzSayisi: number;
  atananSayisi: number;

  /** Son başarılı otomatik-kayıt anı (`Date.now()`) — yalnız canlı modda anlamlı. */
  sonKayitZamani: number | null;
  taslakKaydediliyor: boolean;
}

function saniyeOnceMetni(zamanMs: number): string {
  const saniye = Math.max(0, Math.round((Date.now() - zamanMs) / 1000));
  if (saniye < 5) return "az önce";
  if (saniye < 60) return `${saniye}sn önce`;
  const dakika = Math.round(saniye / 60);
  return `${dakika}dk önce`;
}

/**
 * Yalnız "dikkat"/"sorun" durumundaki kriterler tam açıklamayla gelir; "iyi"
 * olanlar tek satırlık kısa haliyle kalır — token bütçesi ilgi/sinyal
 * oranıyla orantılı olsun diye.
 */
function kriterSatiri(k: Kriter): string {
  const kisa = `${k.ad}: ${k.deger} (${k.durum})`;
  return k.durum === "iyi" ? kisa : `${kisa} — ${k.aciklama}`;
}

export function rotaAgentBaglamiUret(g: RotaAgentBaglamGirdisi): string {
  const satirlar: string[] = [];

  if (g.gecmisMod) {
    satirlar.push(
      `Görüntülenen: ${g.gecmisTarihMetni ?? "geçmiş"} tarihli KAYITLI plan — salt okunur, canlı taslakla bağlantısı yok.`
    );
  } else if (g.taslakKaydediliyor) {
    satirlar.push("Taslak: kaydediliyor…");
  } else if (g.sonKayitZamani != null) {
    satirlar.push(
      `Taslak: otomatik kaydediliyor (~1,5sn gecikmeyle), son yazım ${saniyeOnceMetni(g.sonKayitZamani)}.`
    );
  } else {
    satirlar.push("Taslak: henüz hiç kaydedilmedi.");
  }

  if (!g.gecmisMod && (g.aracAdlari.length > 0 || g.bolgeAdlari.length > 0)) {
    const parcalar: string[] = [];
    if (g.aracAdlari.length > 0) parcalar.push(`araçlar: ${g.aracAdlari.join(", ")}`);
    if (g.bolgeAdlari.length > 0) parcalar.push(`bölgeler: ${g.bolgeAdlari.join(", ")}`);
    satirlar.push(`${parcalar.join(" · ")}.`);
  }

  satirlar.push(
    g.secimAciklamasi ? `Seçili: ${g.secimAciklamasi}.` : "Seçili: yok (tüm plan görünüyor)."
  );
  if (g.seciliDurakAdi) satirlar.push(`Açık durak kartı: ${g.seciliDurakAdi}.`);

  if (!g.gecmisMod) {
    const m = g.metrik;
    const ozetParcalari = [
      `${m.aracSayisi} araç`,
      `${m.yerlesenDurak} durak yerleşti`,
      `${g.havuzSayisi} durak havuzda`,
      `ort. doluluk %${Math.round(m.ortDoluluk)}`,
      `toplam ${Math.round(m.toplamKm)} km`,
    ];
    if (m.bolunmusBolge > 0) ozetParcalari.push(`${m.bolunmusBolge} bölge bölünmüş`);
    satirlar.push(`Plan özeti: ${ozetParcalari.join(", ")}.`);

    if (g.kriterler.length > 0) {
      satirlar.push(`Karne — ${g.kriterler.map(kriterSatiri).join(" · ")}`);
    }

    if (g.odakliArac) {
      if (g.odakliArac.duraklar.length === 0) {
        satirlar.push(`${g.odakliArac.ad} henüz boş.`);
      } else {
        const liste = g.odakliArac.duraklar
          .map((d, i) => `${i + 1}. ${d.unvan}${d.ilce ? ` (${d.ilce})` : ""}`)
          .join(", ");
        satirlar.push(`${g.odakliArac.ad} durakları sırayla: ${liste}.`);
      }
    }
  }

  return `[Rota haritası ekranı — ${satirlar.join(" ")}]`;
}
