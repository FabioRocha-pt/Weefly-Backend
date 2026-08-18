-- WeeFly · Price Checker — o fluxo público P1→P9 e a validação de pagamento
--
-- Três coisas que faltavam para o Price Checker deixar de ser um protótipo em
-- localStorage e passar a viver na base de dados:
--
--   1. O PEDIDO tal como o formulário o recolhe. As tabelas de 0002 nasceram
--      para um formulário mais simples: um só trecho, bebés numa coluna só e
--      três classes de cabine. O Price Checker pede multi-city até 3 voos,
--      distingue bebé com assento de bebé no colo, e oferece premium economy.
--
--   2. A PROVA DE PAGAMENTO. O cliente carrega um PDF ou uma foto do
--      comprovativo; o back-office abre-o, compara o valor e só então marca o
--      pagamento como recebido. O ficheiro vive no Storage (privado); aqui fica
--      o registo e o veredicto de quem o viu.
--
--   3. O RELÓGIO DA VALIDAÇÃO. Enquanto ninguém confirma, o link de pagamento
--      não pode ficar aberto para sempre: o preço que o cliente viu tem prazo.
--      Passadas 48h sobre o comprovativo sem confirmação, o pagamento expira e
--      o caso volta à fila. O prazo é estendível — a decisão de dar mais tempo
--      é de quem atende, não do relógio.
--
-- Nada aqui apaga nem reescreve o que já existe. As colunas antigas
-- (`infants`, `origin`, `destination`, `depart_date`) continuam a ser
-- preenchidas, para o back-office e os emails que já as leem não partirem.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · O pedido do Price Checker
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.trip_requests
  -- Moeda e idioma vêm no link que o vendedor partilhou (?currency= &lang=).
  -- Guardados no pedido e não só no lead porque é o pedido que é cotado: dois
  -- pedidos do mesmo cliente podem ser em moedas diferentes.
  add column if not exists currency         char(3) not null default 'EUR',
  -- ?agent=nelida — quem partilhou o link. É o que permite à fila do
  -- back-office distinguir "novo sem dono" de "novo do Jair".
  add column if not exists agent_slug       text,
  -- Bebé com assento paga tarifa de criança e ocupa lugar; bebé no colo não.
  -- São dois produtos diferentes e o formulário sempre os separou — era a base
  -- de dados que os somava numa coluna só. `infants` continua a ser escrita
  -- com a soma dos dois, para quem já a lê.
  add column if not exists infants_in_seat  integer not null default 0,
  add column if not exists infants_on_lap   integer not null default 0,
  -- O ecrã de consentimento do P2 promete guardar data, hora, IP e
  -- dispositivo. Sem estas colunas a promessa era mentira.
  add column if not exists consent_ip       text,
  add column if not exists consent_agent    text,
  -- O canal de entrada: 'price_checker' distingue-o do formulário /concierge e
  -- do chat, que escrevem na mesma tabela.
  add column if not exists intake           text not null default 'concierge';

-- Premium economy existia no formulário e não no check. Um pedido em premium
-- era rejeitado pela base de dados com um erro que não dizia isso a ninguém.
alter table public.trip_requests
  drop constraint if exists trip_requests_cabin_class_check;
alter table public.trip_requests
  add constraint trip_requests_cabin_class_check
  check (cabin_class in ('economy', 'premium_economy', 'business', 'first'));

-- Multi-city: 2 a 3 voos, cada um com a sua data.
-- As colunas origin/destination/depart_date do pedido continuam a valer — são
-- preenchidas com o primeiro e o último trecho, para que uma listagem que não
-- saiba de legs continue a mostrar a rota certa.
create table if not exists public.trip_request_legs (
  id              uuid primary key default gen_random_uuid(),
  trip_request_id uuid not null references public.trip_requests (id) on delete cascade,
  position        smallint not null check (position between 1 and 3),
  origin          text not null,
  destination     text not null check (destination <> origin),
  depart_date     date not null,
  created_at      timestamptz not null default now(),
  unique (trip_request_id, position)
);

create index if not exists trip_request_legs_request_idx
  on public.trip_request_legs (trip_request_id, position);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · Passageiros, à letra do passaporte
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.case_passengers
  -- Mr/Mrs/Ms. Obrigatório para adultos na emissão, ausente na tabela.
  add column if not exists title            text,
  -- O país que emitiu o passaporte não é sempre a nacionalidade, e é o que a
  -- companhia pede.
  add column if not exists issuing_country  text,
  -- O bilhete emitido, por passageiro. O P9 mostra-o e o mockup do back-office
  -- tem um campo por passageiro na aba Emissão.
  add column if not exists ticket_number    text,
  add column if not exists seat_outbound    text,
  add column if not exists seat_inbound     text;

alter table public.case_passengers
  drop constraint if exists case_passengers_title_check;
alter table public.case_passengers
  add constraint case_passengers_title_check
  check (title is null or title in ('mr', 'mrs', 'ms'));

-- 'infant' deixa de bastar: um bebé com assento entra no PNR como criança com
-- lugar e um bebé no colo não. Quem já tem 'infant' fica como está.
alter table public.case_passengers
  drop constraint if exists case_passengers_passenger_type_check;
alter table public.case_passengers
  add constraint case_passengers_passenger_type_check
  check (passenger_type in ('adult', 'child', 'infant', 'infant_seat', 'infant_lap'));

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 · Pagamento: prova, confirmação e prazo
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.case_payments
  -- Prazo para o CLIENTE pagar. É o contador que ele vê no ecrã de pagamento;
  -- nasce da escolha da opção.
  add column if not exists expires_at            timestamptz,
  -- Prazo para NÓS confirmarmos, contado do comprovativo. Duas datas porque
  -- são duas esperas diferentes e falham de maneiras diferentes: a primeira
  -- esgota-se sem o cliente fazer nada, a segunda esgota-se por nossa inércia.
  -- Confundi-las era esconder qual das duas correu mal.
  add column if not exists review_deadline_at    timestamptz,
  add column if not exists extended_at           timestamptz,
  add column if not exists extended_by           uuid references auth.users (id) on delete set null,
  add column if not exists extension_count       smallint not null default 0,
  -- A caixa que o admin marca. Guardada como coluna própria e não inferida de
  -- `status = 'COMPLETED'` porque a pergunta que ela responde é outra: não é
  -- "o pagamento está fechado" mas "alguém olhou para o comprovativo e assumiu
  -- que o dinheiro entrou". É esse nome que fica no registo.
  add column if not exists admin_confirmed       boolean not null default false,
  add column if not exists admin_confirmed_at    timestamptz,
  add column if not exists admin_confirmed_by    uuid references auth.users (id) on delete set null,
  -- O que o extrato diz, que não é forçosamente o que pedimos. A diferença
  -- entre os dois é o que o back-office mostra antes de deixar confirmar.
  add column if not exists received_amount       bigint,
  add column if not exists bank_reference        text,
  add column if not exists value_date            date,
  -- O provedor escolhido dentro do método: Revolut dentro de 'link', Wave
  -- dentro de 'momo'. `method` já existe (0006) e guarda a família.
  add column if not exists pay_provider          text,
  -- Estado da prova, separado do estado do pagamento: um comprovativo pode ser
  -- rejeitado sem que o pagamento morra — o cliente envia outro.
  add column if not exists proof_status          text not null default 'nenhum',
  add column if not exists proof_rejected_reason text;

alter table public.case_payments
  drop constraint if exists case_payments_proof_status_check;
alter table public.case_payments
  add constraint case_payments_proof_status_check
  check (proof_status in ('nenhum', 'recebido', 'validado', 'rejeitado'));

-- Cada ficheiro que o cliente enviou, com o veredicto de quem o abriu.
-- Uma tabela e não uma coluna: o cliente engana-se, envia o recibo errado, e
-- volta a enviar. O histórico das tentativas é o que explica um pagamento que
-- demorou três dias a ser confirmado.
create table if not exists public.case_payment_proofs (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.case_payments (id) on delete cascade,
  case_id       uuid not null references public.booking_cases (id) on delete cascade,
  -- Caminho no bucket privado `payment-proofs`. Nunca um URL: os URLs deste
  -- bucket são assinados e expiram, e guardar um assinado seria guardar uma
  -- chave que amanhã não abre nada.
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    integer not null check (size_bytes > 0),
  status        text not null default 'recebido'
                  check (status in ('recebido', 'validado', 'rejeitado')),
  review_note   text,
  reviewed_at   timestamptz,
  reviewed_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists case_payment_proofs_payment_idx
  on public.case_payment_proofs (payment_id, created_at desc);
create index if not exists case_payment_proofs_case_idx
  on public.case_payment_proofs (case_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 · O registo do caso
-- ═══════════════════════════════════════════════════════════════════════════

-- A aba "Registo" do back-office mostra o histórico completo do caso, e a
-- confirmação de um pagamento tem de deixar rasto com nome e hora. Até aqui o
-- único registo era `trip_request_notes`, que é outra coisa: notas escritas à
-- mão. Isto é o que o sistema observou.
create table if not exists public.case_events (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.booking_cases (id) on delete cascade,
  -- Vocabulário aberto de propósito. Um check aqui obrigaria a uma migração por
  -- cada novo acontecimento que se queira registar, e o custo de um valor mal
  -- escrito é uma linha feia no histórico — não um caso partido.
  kind        text not null,
  title       text not null,
  detail      text,
  -- Quem. Nulo quando foi o cliente ou o sistema; o email fica desnormalizado
  -- porque o histórico tem de continuar legível depois de a conta sair.
  actor_id    uuid references auth.users (id) on delete set null,
  actor_email text,
  actor_kind  text not null default 'system'
                check (actor_kind in ('client', 'staff', 'system')),
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists case_events_case_idx
  on public.case_events (case_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4b · A emissão
-- ═══════════════════════════════════════════════════════════════════════════

-- O bilhete emitido não tinha onde viver. A aba "Emissão" do back-office pede
-- PNR, companhia emissora, consolidador, custo real e os campos do documento; o
-- P9 do cliente mostra o PNR e um bilhete por passageiro (esse já em
-- `case_passengers.ticket_number`, acima).
alter table public.booking_cases
  add column if not exists pnr              text,
  add column if not exists issued_at        timestamptz,
  add column if not exists issued_by        uuid references auth.users (id) on delete set null,
  add column if not exists issuing_carrier  text,
  add column if not exists consolidator     text,
  -- O que a emissão custou de facto, que raramente é o que a proposta estimou.
  -- É a diferença entre este valor e o total cobrado que dá a margem real.
  add column if not exists cost_real        bigint,
  add column if not exists fare_basis       text,
  add column if not exists nvb              text,
  add column if not exists nva              text,
  add column if not exists endorsements     text;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 5 · Acesso ao back-office restrito a contas nomeadas
-- ═══════════════════════════════════════════════════════════════════════════

-- O acesso ao back-office já era pertença explícita (`platform_staff`), mas
-- nada distinguia quem pode abrir o Price Checker. Esta lista é o convite: uma
-- linha por email autorizado, escrita antes de a conta existir. O script
-- scripts/seed-bo-users.mjs cria as contas e liga-as a `platform_staff`.
--
-- Guardar o email e não o user_id é deliberado: a autorização é dada à pessoa,
-- e tem de valer antes de haver utilizador em auth.users.
create table if not exists public.bo_allowlist (
  email      text primary key,
  label      text,
  role       text not null default 'admin' check (role in ('admin', 'manager')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.bo_allowlist (email, label, role) values
  ('fapi.rocha@gmail.com', 'Fábio Rocha',  'admin'),
  ('gocgo2008@gmail.com',  'WeeFly Admin', 'admin')
on conflict (email) do update set active = true, role = excluded.role;

-- Verdadeiro quando a sessão atual é de uma conta convidada E ainda ativa.
-- `is_platform_staff()` continua a ser a porta do resto do back-office; esta
-- função é a porta do Price Checker, e é mais estreita.
create or replace function public.is_bo_allowed()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.bo_allowlist a
      join auth.users u on lower(u.email) = lower(a.email)
     where u.id = auth.uid()
       and a.active
  );
$$;

alter table public.bo_allowlist enable row level security;

drop policy if exists "bo_allowlist_select_staff" on public.bo_allowlist;
create policy "bo_allowlist_select_staff"
  on public.bo_allowlist for select
  to authenticated
  using (public.is_platform_staff());

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 6 · RLS das tabelas novas
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.trip_request_legs    enable row level security;
alter table public.case_payment_proofs  enable row level security;
alter table public.case_events          enable row level security;

drop policy if exists "trip_request_legs_staff_read" on public.trip_request_legs;
create policy "trip_request_legs_staff_read"
  on public.trip_request_legs for select
  to authenticated using (public.is_platform_staff());

drop policy if exists "case_payment_proofs_staff_read" on public.case_payment_proofs;
create policy "case_payment_proofs_staff_read"
  on public.case_payment_proofs for select
  to authenticated using (public.is_platform_staff());

drop policy if exists "case_payment_proofs_staff_write" on public.case_payment_proofs;
create policy "case_payment_proofs_staff_write"
  on public.case_payment_proofs for update
  to authenticated using (public.is_platform_staff())
  with check (public.is_platform_staff());

drop policy if exists "case_events_staff_read" on public.case_events;
create policy "case_events_staff_read"
  on public.case_events for select
  to authenticated using (public.is_platform_staff());

-- O fluxo público escreve tudo pela service role (o cliente não tem sessão),
-- por isso não há política de insert para `authenticated` nem para `anon`: sem
-- política, ninguém sem a chave de serviço escreve aqui.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 7 · Bucket dos comprovativos
-- ═══════════════════════════════════════════════════════════════════════════

-- Privado. O cliente escreve pela service role (não tem sessão) e o
-- back-office lê por URL assinado, gerado no servidor a cada abertura. Um
-- comprovativo de pagamento tem nome, IBAN e montante: não é um ficheiro para
-- viver num URL público adivinhável.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs', 'payment-proofs', false, 8388608,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = 8388608,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

drop policy if exists "payment_proofs_staff_read" on storage.objects;
create policy "payment_proofs_staff_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'payment-proofs' and public.is_platform_staff());

notify pgrst, 'reload schema';
