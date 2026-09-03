-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly Concierge · Sprint 3 — C-33 · a aba Pagamento por método
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A premissa mudou, e está nas decisões confirmadas do backlog v3.2:
--
--   "O pagamento acontece **fora** da plataforma, a validação **dentro** dela."
--
-- O cliente já não paga dentro do link. Escolhe uma via, a escolha chega ao
-- back-office, e é o agente que fornece o link ou a referência. A plataforma
-- não gera nada — guarda o que o agente lhe dá. É para isso que estas colunas
-- existem.
--
-- `pay_link` e `pay_reference` separados, e não um campo só: o Vinti4/24 pode
-- levar os dois (uma referência para pagar no 24, ou um endereço), e juntá-los
-- numa coluna obrigaria cada leitor a adivinhar qual dos dois lá está.
--
-- Nenhum destes valores é gerado por nós. `payment_url` — a coluna que já
-- existia — era o link que a WeePay devolvia, e por isso continua a existir e
-- fica intacta: são coisas diferentes, e sobrepor-lhe o que um agente cola à
-- mão apagaria o rasto de um pagamento que a plataforma processou de facto.
--
-- Idempotente. Pode correr duas vezes.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0015_sprint3_payment_methods.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.case_payments
  add column if not exists pay_link text,
  add column if not exists pay_reference text,
  add column if not exists pay_instructions_sent_at timestamptz,
  add column if not exists pay_instructions_sent_by_email text,
  /* O prazo para pagar, escrito pelo agente. Distinto de `expires_at`, que é o
     prazo do link: este é o que vai na mensagem ao cliente. */
  add column if not exists pay_due_at timestamptz;

comment on column public.case_payments.pay_link is
  'C-33 · o endereço de pagamento que o AGENTE forneceu. A plataforma não o gera.';
comment on column public.case_payments.pay_reference is
  'C-33 · a referência que o agente forneceu (SISP, Instapay).';
comment on column public.case_payments.pay_instructions_sent_at is
  'C-33 · quando as instruções foram enviadas ao cliente.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Os métodos antigos não são migrados
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `case_payments.method` tem, nos casos que já existem, valores da taxonomia
-- anterior: transfer · link · card · momo · local · cash. Nenhum deles é um dos
-- cinco novos (stripe · vinti4 · revolut · instapay · paypal), e reescrevê-los
-- para o mais parecido seria gravar no histórico um método que aquele cliente
-- nunca escolheu — `transfer` em particular, que é a via que esta fase remove.
--
-- Ficam como estão, e o código sabe lê-los: ver `LEGACY_METHOD_LABEL_PT` e
-- `methodLabelPt()` em lib/pc/catalog.ts. É por isso que **não** há aqui um
-- CHECK constraint na coluna: ele tornaria os doze casos antigos ilegais.

commit;

notify pgrst, 'reload schema';
