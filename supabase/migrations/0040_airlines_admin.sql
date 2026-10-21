-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · Admin — as companhias aéreas parametrizáveis
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do Ivandro (21 Out): no Admin, acrescentar companhias com nome e
-- logótipo, sem deploy. A tabela `airlines` já existe desde a 0017 (as 31 do
-- backlog); esta migração só lhe acrescenta o que o ecrã novo escreve.
--
--   · `logo_url`      · o logótipo carregado no Admin (bucket público `brand`,
--                       pasta `airlines/`). Nulo: o ficheiro de
--                       `public/airlines/{iata}.png`, se existir; senão a sigla.
--   · `ticket_prefix` · os três dígitos do número de bilhete (código IATA de
--                       contabilidade). Nulo: a emissão não o verifica.
--
-- A escrita continua só pela service role, depois de a server action
-- confirmar que é o Admin WeeFly. Nenhuma política nova.

alter table public.airlines
  add column if not exists logo_url         text,
  add column if not exists ticket_prefix    text,
  add column if not exists updated_at       timestamptz not null default now(),
  add column if not exists changed_by_email text;

alter table public.airlines drop constraint if exists airlines_ticket_prefix_check;
alter table public.airlines
  add constraint airlines_ticket_prefix_check check (ticket_prefix is null or ticket_prefix ~ '^[0-9]{3}$');

notify pgrst, 'reload schema';
