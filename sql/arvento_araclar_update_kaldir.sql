-- FAZ 5. Gerçek güvenlik açığı — herhangi bir authenticated kullanıcı
-- arvento_araclar'daki HERHANGİ bir satırı sınırsız güncelleyebiliyordu
-- (using(true) with_check(true)). frontend/app/api/filo/route.ts doğrulandı:
-- yalnız araclar/soforler'a yazıyor, arvento_araclar'a hiç dokunmuyor — n8n
-- zaten service-role ile yazıyor. Bu politika browser'dan hiç kullanılmıyor,
-- kaldırılması güvenli.

drop policy if exists "arvento_araclar_update_authenticated" on public.arvento_araclar;
