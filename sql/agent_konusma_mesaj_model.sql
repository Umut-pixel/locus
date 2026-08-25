-- assistant hover meta: hangi model yanıtladı
alter table public.agent_konusma_mesajlari
  add column if not exists model text;

alter table public.agent_konusma_mesajlari
  drop constraint if exists agent_konusma_mesajlari_model_len;

alter table public.agent_konusma_mesajlari
  add constraint agent_konusma_mesajlari_model_len
  check (model is null or char_length(model) between 1 and 80);
