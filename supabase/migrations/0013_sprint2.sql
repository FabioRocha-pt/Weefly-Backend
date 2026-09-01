-- WeeFly Concierge · Sprint 2 (revisto, v3.1) — fechar o ciclo comercial
--
-- O sprint tem um trabalho só: pedido → proposta → escolha → pagamento →
-- bilhete emitido, com o PDF no link do cliente. Esta migração é a parte disso
-- que a base de dados tem de saber, e nada mais.
--
-- Sete coisas:
--
--   1. NT-06 · o registo de entrega. Um envio que ninguém regista é um envio
--      que ninguém sabe se chegou — e é essa a diferença entre uma notificação
--      e uma esperança.
--   2. FE-05 · os pedidos especiais. O texto livre onde cabe "não chegar de
--      noite" e "viajo com a minha mãe em cadeira de rodas". Nenhum formulário
--      estruturado o apanha, e é ele que faz a cotação certa à primeira.
--   3. BO-14 · o vendedor do caso, lido de quem existe no sistema.
--   4. BO-13 · o serviço WeeFly, por reserva, pré-preenchido a 20.
--   5. EM-01 · o lugar de cada passageiro em cada voo.
--   6. EM-02/03 · o documento do bilhete, gerado uma vez e reenviável sem ser
--      regenerado — mesmo número de documento.
--   7. LNK-08 · o link do cliente pode ser revogado e nascer outro, sem que o
--      caso ou o histórico se percam.
--
-- Nada aqui apaga nem reescreve o que já existe.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · NT-06 · o registo de entrega
-- ═══════════════════════════════════════════════════════════════════════════

-- Uma linha por envio, com o estado que o fornecedor devolveu.
--
-- Não é `case_events`: aquilo é o que o sistema observou, escrito para ser lido
-- por uma pessoa. Isto é o estado de uma coisa que está a acontecer fora de
-- nós, e que muda depois de a termos escrito — `queued` hoje, `delivered`
-- daqui a três segundos, `bounced` daqui a uma hora. Um histórico não se
-- atualiza; uma entrega sim.
create table if not exists public.case_notifications (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.booking_cases (id) on delete cascade,

  -- Por onde saiu. A falha de um canal não é a falha do outro (NT-02).
  channel       text not null check (channel in ('email', 'whatsapp')),
  -- O acontecimento que provocou o envio: 'request_received',
  -- 'proposal_published', 'payment_confirmed', 'tickets_issued', 'manual'…
  -- Vocabulário aberto, pela mesma razão que `case_events.kind`: um check aqui
  -- obrigaria a uma migração por cada aviso novo.
  kind          text not null,
  -- Para quem. Decide o modelo e a língua: a equipa lê em português, o cliente
  -- lê na língua dele, e o agente dono do caso é um terceiro destinatário com
  -- outro assunto (NT-05).
  audience      text not null check (audience in ('client', 'team', 'agent')),
  recipient     text not null,
  locale        text,
  subject       text,
  /* NT-07 · o que o agente escreveu, quando foi ele a escrever. Nos avisos
     automáticos fica nulo: o corpo é o modelo, e guardar uma cópia do HTML de
     cada email era guardar o mesmo texto mil vezes. */
  body          text,

  -- queued  · aceite por nós, ainda não entregue ao fornecedor
  -- sent    · o fornecedor aceitou-o
  -- delivered · o servidor do destinatário aceitou-o
  -- bounced · foi recusado de forma permanente
  -- failed  · não conseguimos sequer entregá-lo ao fornecedor
  -- skipped · não havia por onde enviar (canal sem configuração, sem número)
  status        text not null default 'queued'
                  check (status in ('queued', 'sent', 'delivered', 'bounced',
                                    'failed', 'skipped')),
  attempts      smallint not null default 0,
  provider      text,
  -- O id do fornecedor. É por ele que o webhook encontra esta linha.
  provider_message_id text,
  last_error    text,

  /*
   * NT-04 · "sem notificação duplicada para o mesmo acontecimento".
   *
   * A chave é composta por quem a escreve — `proposal_published:r2`,
   * `payment_confirmed` — e o índice único abaixo faz o resto. Nula quando o
   * aviso é legitimamente repetível: um reenvio manual pedido pelo agente, ou
   * um "avisar cliente" escrito duas vezes de propósito.
   */
  dedupe_key    text,

  /* NT-07 · "aparece no link do cliente como um alerta sobre a viagem". */
  client_visible boolean not null default false,

  actor_id      uuid references auth.users (id) on delete set null,
  actor_email   text,

  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  delivered_at  timestamptz,
  failed_at     timestamptz
);

create index if not exists case_notifications_case_idx
  on public.case_notifications (case_id, created_at desc);

create index if not exists case_notifications_provider_idx
  on public.case_notifications (provider_message_id)
  where provider_message_id is not null;

-- O que impede a segunda notificação do mesmo acontecimento.
create unique index if not exists case_notifications_dedupe_idx
  on public.case_notifications (case_id, channel, audience, dedupe_key)
  where dedupe_key is not null;

-- Os alertas que o cliente vê no link dele, por ordem de chegada.
create index if not exists case_notifications_visible_idx
  on public.case_notifications (case_id, created_at desc)
  where client_visible;

drop trigger if exists case_notifications_touch on public.case_notifications;

/*
 * NT-06 · "uma falha permanente levanta uma bandeira visível no caso".
 *
 * A bandeira vive no caso e não na notificação porque é o caso que alguém abre.
 * Uma coluna e não uma leitura derivada: a fila do back-office tem de a poder
 * ordenar sem ir buscar as notificações de cada linha.
 */
alter table public.booking_cases
  add column if not exists notify_alert_at     timestamptz,
  add column if not exists notify_alert_reason text;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · FE-05 · os pedidos especiais
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.trip_requests
  /*
   * O campo livre do ecrã de revisão, antes de submeter.
   *
   * Aparece na coluna esquerda da ficha do caso, debaixo do resumo do pedido —
   * que é onde quem cota olha antes de escrever a proposta. Sem limite de
   * comprimento na base; o formulário corta aos 1000 caracteres, que é o
   * tamanho de um parágrafo escrito com vontade.
   */
  add column if not exists special_requests text;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 · BO-14 · o vendedor, dos utilizadores que existem
-- ═══════════════════════════════════════════════════════════════════════════

/*
 * O email e não o `user_id`.
 *
 * `created_by` referencia `auth.users` e continua a ser quem reclamou o caso.
 * O vendedor é outra coisa: é a pessoa a quem a venda pertence, e tem de poder
 * ser atribuída a alguém que ainda não fez login uma única vez. A lista de onde
 * ela sai — `bo_allowlist` — é exactamente uma lista de emails escritos antes
 * de a conta existir, pela mesma razão.
 */
alter table public.booking_cases
  add column if not exists seller_email text,
  add column if not exists seller_label text,
  add column if not exists seller_set_at timestamptz,
  add column if not exists seller_set_by uuid references auth.users (id) on delete set null;

-- O único vendedor de que o backlog fala, por agora. A gestão de perfis é do
-- Sprint 3; até lá, acrescentar uma linha aqui faz aparecer um nome no seletor
-- sem nenhum deploy — que é o que o BO-14 pede.
insert into public.bo_allowlist (email, label, role) values
  ('dominik@weefly.africa', 'Dominik', 'manager')
on conflict (email) do update set active = true, label = excluded.label;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 · BO-13 · o preço reduzido a duas linhas
-- ═══════════════════════════════════════════════════════════════════════════

/*
 * O serviço WeeFly passa a nascer preenchido a 20 na moeda do caso.
 *
 * É por reserva e não por passageiro — já era, `service_fee` sempre foi um
 * total — e o que muda é a omissão: uma oferta nova nascia a zero e alguém
 * tinha de se lembrar. Vinte é o valor que o backlog fixa, e continua editável.
 */
alter table public.case_offers
  alter column service_fee set default 2000;

/*
 * NENHUM BACKFILL de `taxes_total`, e a razão merece ser escrita.
 *
 * O backlog tira a linha de taxas de aeroporto do formulário: o preço por
 * passageiro passa a ser "o preço final da companhia, taxas já incluídas". Uma
 * oferta nova escreve zero em `taxes_total` porque o campo deixa de existir no
 * ecrã.
 *
 * As ofertas que já existem têm taxas escritas à parte, e dobrá-las no preço
 * por passageiro exigiria dividi-las pelo número de passageiros — um número que
 * não vive na oferta. Seria inventar um preço unitário que ninguém escreveu.
 *
 * Por isso a coluna fica e continua a contar para o total. O que o cliente lê
 * são duas linhas: "Preço" (a tarifa toda, taxas incluídas) e "Serviço WeeFly".
 * Para uma oferta nova a primeira linha é preço × passageiros; para uma antiga
 * é preço × passageiros + taxas. O total não muda em nenhum dos casos, e é isso
 * que importa: uma proposta já publicada continua a dizer ao cliente o mesmo
 * que lhe dizia ontem.
 */

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 5 · EM-01 · o lugar de cada passageiro em cada voo
-- ═══════════════════════════════════════════════════════════════════════════

/*
 * `case_passengers.seat_outbound` e `seat_inbound` chegavam para uma viagem
 * direta e mentiam em tudo o resto: numa ida com escala há dois voos, e o lugar
 * do segundo não é o do primeiro. O bilhete repete a etiqueta do passageiro
 * dentro de cada voo, com o lugar desse voo — é o próprio EM-02 que o exige.
 *
 * As duas colunas ficam. São a única cópia dos lugares já emitidos, e a
 * aplicação passa a escrever aqui.
 */
create table if not exists public.case_passenger_seats (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.booking_cases (id) on delete cascade,
  passenger_id uuid not null references public.case_passengers (id) on delete cascade,
  segment_id   uuid not null references public.case_offer_segments (id) on delete cascade,
  seat         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (passenger_id, segment_id)
);

create index if not exists case_passenger_seats_case_idx
  on public.case_passenger_seats (case_id);

drop trigger if exists case_passenger_seats_touch on public.case_passenger_seats;
create trigger case_passenger_seats_touch before update on public.case_passenger_seats
  for each row execute function public.touch_updated_at();

/*
 * EM-01 · os campos da emissão que ainda não tinham coluna.
 *
 * `fare_basis`, `nvb`, `nva`, `issuing_carrier`, `consolidator` e `cost_real`
 * vieram na 0009. Falta o número do documento, que é o que identifica o PDF
 * emitido e o que permite reenviá-lo sem o regenerar (EM-03).
 */
alter table public.booking_cases
  add column if not exists ticket_document_number text;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 6 · EM-02/03 · o documento do bilhete
-- ═══════════════════════════════════════════════════════════════════════════

/*
 * O PDF gerado, guardado uma vez.
 *
 * "Reenviável a partir do back-office **sem regenerar**, mantendo o mesmo
 * número de documento" — é essa frase que faz disto uma tabela e não uma
 * função que corre a cada pedido. Um bilhete reenviado tem de ser byte a byte
 * o mesmo que o cliente já tem: se o segundo PDF trouxer uma hora diferente ou
 * um logótipo novo, deixou de ser prova de nada.
 *
 * `passenger_id` nulo é o documento combinado, o de todos os passageiros. Com
 * passageiro é o individual, que o FE-07 pede ao lado do combinado.
 */
create table if not exists public.case_ticket_documents (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.booking_cases (id) on delete cascade,
  passenger_id    uuid references public.case_passengers (id) on delete cascade,
  -- WF-TKT-{PNR}-{REFERENCIA}. Único: dois documentos com o mesmo número seriam
  -- dois bilhetes a dizer que são o mesmo.
  document_number text not null,
  -- Caminho no bucket privado `tickets`. Nunca um URL — ver a mesma decisão em
  -- `case_payment_proofs.storage_path`.
  storage_path    text not null unique,
  file_name       text not null,
  size_bytes      integer not null check (size_bytes > 0),
  -- Impressão digital do conteúdo, para se saber se um reenvio é mesmo o mesmo
  -- ficheiro.
  content_hash    text,
  pnr             text,
  generated_at    timestamptz not null default now(),
  generated_by    uuid references auth.users (id) on delete set null,
  unique (case_id, passenger_id)
);

create index if not exists case_ticket_documents_case_idx
  on public.case_ticket_documents (case_id, generated_at desc);

-- Privado, como os comprovativos: um bilhete tem nome, passaporte e PNR, e o
-- PNR é a chave que abre a reserva na companhia.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tickets', 'tickets', false, 10485760,
  array['application/pdf']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = 10485760,
      allowed_mime_types = array['application/pdf'];

drop policy if exists "tickets_staff_read" on storage.objects;
create policy "tickets_staff_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'tickets' and public.is_platform_staff());

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 7 · LNK-08 · revogar e voltar a emitir o link do cliente
-- ═══════════════════════════════════════════════════════════════════════════

/*
 * "Um administrador pode revogá-lo e voltar a gerá-lo, mantendo o caso e o
 * histórico."
 *
 * O token novo é escrito em `booking_cases.token`, que já é único. O que faltava
 * era o rasto: sem isto, um link revogado desaparece sem deixar dizer que
 * existiu — e a pergunta que se faz a seguir a uma revogação é sempre "desde
 * quando é que o antigo deixou de servir?".
 *
 * O token antigo fica guardado. Não abre nada: nenhuma leitura o procura.
 */
create table if not exists public.case_token_history (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.booking_cases (id) on delete cascade,
  old_token   text not null,
  reason      text,
  revoked_at  timestamptz not null default now(),
  revoked_by  uuid references auth.users (id) on delete set null,
  revoked_by_email text
);

create index if not exists case_token_history_case_idx
  on public.case_token_history (case_id, revoked_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 8 · RLS das tabelas novas
-- ═══════════════════════════════════════════════════════════════════════════

-- Como nas restantes tabelas do caso: o fluxo público escreve pela service
-- role (o cliente não tem sessão), e por isso não há política nenhuma para
-- `anon`. Sem política, ninguém sem a chave de serviço lê ou escreve aqui.

alter table public.case_notifications     enable row level security;
alter table public.case_passenger_seats   enable row level security;
alter table public.case_ticket_documents  enable row level security;
alter table public.case_token_history     enable row level security;

drop policy if exists "case_notifications_staff_read" on public.case_notifications;
create policy "case_notifications_staff_read"
  on public.case_notifications for select
  to authenticated using (public.is_platform_staff());

drop policy if exists "case_passenger_seats_staff" on public.case_passenger_seats;
create policy "case_passenger_seats_staff"
  on public.case_passenger_seats for all
  to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

drop policy if exists "case_ticket_documents_staff_read" on public.case_ticket_documents;
create policy "case_ticket_documents_staff_read"
  on public.case_ticket_documents for select
  to authenticated using (public.is_platform_staff());

drop policy if exists "case_token_history_staff_read" on public.case_token_history;
create policy "case_token_history_staff_read"
  on public.case_token_history for select
  to authenticated using (public.is_platform_staff());

notify pgrst, 'reload schema';
