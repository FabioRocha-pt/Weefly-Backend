-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · I18N-03 — a língua por defeito do back-office de cada empresa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do Ivandro (Novembro): cada empresa abre o back-office na língua do
-- seu país (9 em francês, 6 em inglês, 5 em português). O master define-a no
-- Admin; cada pessoa pode depois escolher a sua nas Definições, e essa escolha
-- ganha. Só acrescenta uma coluna com valor por omissão: nada do que existe
-- muda, e as empresas actuais ficam em português.
--
-- Não toca na língua do cliente: essa continua a ser a do caso.

alter table public.partners
  add column if not exists default_locale text not null default 'pt';

alter table public.partners
  drop constraint if exists partners_default_locale_check;
alter table public.partners
  add constraint partners_default_locale_check check (default_locale in ('pt', 'en', 'fr'));
