-- =============================================================================
-- agent_konusmalar.sira_no — sohbet URL'i için insan-okunur numara
-- =============================================================================
-- Sohbet /home?k=<uuid> yerine kendi route'una taşındı:
--   /sohbet/{baslik-slug}-{sira_no}
-- Başlıklar tekrar ediyor (aynı soru birden çok kez soruluyor), o yüzden
-- slug tek başına ayırt edici değil. Çözüm anahtarı sira_no; slug kozmetik —
-- başlık sonradan değişirse route kanonik href'e redirect eder.
-- =============================================================================

alter table public.agent_konusmalar
  add column if not exists sira_no bigint;

-- Mevcut satırlar: oluşturulma sırasına göre 1..N
with sirali as (
  select id, row_number() over (order by olusturulma asc, id asc) as n
  from public.agent_konusmalar
)
update public.agent_konusmalar k
   set sira_no = s.n
  from sirali s
 where s.id = k.id
   and k.sira_no is null;

create sequence if not exists public.agent_konusmalar_sira_no_seq
  owned by public.agent_konusmalar.sira_no;

select setval(
  'public.agent_konusmalar_sira_no_seq',
  coalesce((select max(sira_no) from public.agent_konusmalar), 0) + 1,
  false
);

alter table public.agent_konusmalar
  alter column sira_no set default nextval('public.agent_konusmalar_sira_no_seq');

alter table public.agent_konusmalar
  alter column sira_no set not null;

create unique index if not exists agent_konusmalar_sira_no_key
  on public.agent_konusmalar (sira_no);

comment on column public.agent_konusmalar.sira_no is
  'Sohbet URL numarası — /sohbet/{baslik-slug}-{sira_no}. Slug kozmetik, çözüm bu kolondan yapılır.';

-- Grant kalıbı agent_konusmalar.sql ile aynı: yazma yalnız service_role,
-- okuma agent'ın salt-okunur rolüne. Kolon eklemek grant'ları değiştirmez,
-- yine de açıkça tekrarlanıyor.
revoke all on public.agent_konusmalar from anon, authenticated;
grant select on public.agent_konusmalar to locus_agent_ro;
