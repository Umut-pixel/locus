/**
 * Kaydırılabilir bir listenin altına konan soluklaşma şeridi —
 * `useScrollBottomFade` ile birlikte kullanılır. O hook'un `wrapperRef`'ini
 * taşıyan `relative` atanın İÇİNDE, kardeş eleman olarak render edilmeli;
 * opacity'sini o atanın üzerine yazılan `--sb-fade-opaklik` CSS
 * değişkeninden okur (prop DEĞİL — React state'e hiç uğramadan, scroll'da
 * yeniden render tetiklemeden günceller). `pointer-events-none` olduğu için
 * altındaki satırların tıklama/hover'ını engellemez.
 *
 * `backdrop-filter: blur()` DEĞİL — düz arka plan rengine gradyan. Blur her
 * karede altındaki içeriği yeniden bulanıklaştırıp compositor'ı zorluyor;
 * özellikle StokTable'daki büyük, sürekli kayan tabloda gözle görülür lag
 * yaratıyordu. Gradyan tek katmanlık alfa geçişi — aynı "arkaya karışıyor"
 * hissini neredeyse bedavaya veriyor.
 */
export function ScrollBottomFade() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent transition-opacity duration-300 ease-out"
      style={{ opacity: "var(--sb-fade-opaklik, 0)" }}
    />
  );
}
