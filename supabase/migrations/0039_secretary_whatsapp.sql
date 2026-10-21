-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · B2G — o WhatsApp da secretária
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do Ivandro (21 Out): ao criar a secretária, guardar também o número
-- de WhatsApp, à parte do telefone, para a equipa a contactar depressa. Só
-- acrescenta uma coluna opcional; nada do que existe muda.

alter table public.ministry_secretaries
  add column if not exists whatsapp text;

alter table public.ministry_secretaries
  drop constraint if exists ministry_secretaries_whatsapp_check;
alter table public.ministry_secretaries
  add constraint ministry_secretaries_whatsapp_check check (whatsapp is null or char_length(whatsapp) <= 40);
