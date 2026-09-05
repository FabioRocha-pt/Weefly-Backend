-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly Concierge · Sprint 3 — correcções dos testes (v3.3)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O que esta migração serve, item a item do documento de testes:
--
--   T-22 · um acontecimento que só acontece uma vez só se escreve uma vez.
--          `case_events.dedupe_key` mais um índice único parcial: a decisão
--          passa a ser da base de dados e não de uma leitura anterior, que é o
--          único sítio onde duas passagens simultâneas do cron não se
--          atropelam.
--
--   T-04 · a emissão passa a ter um bloco por voo. Os campos do documento
--          — base tarifária, NVB, NVA, cupão, aeronave, cabina, terminais —
--          deixam de ser um só para a viagem inteira e passam a viver por
--          trecho, em `case_segment_issuance`.
--
--   T-10 / TK-03 · as condições de bagagem por voo. Uma tarifa que deixa levar
--          duas malas à ida e nenhuma à volta não cabe num número só.
--
--   T-21 · o filtro de casos fechados usa `booking_cases.closed_at`, que já
--          existe desde a 0014 — aqui só se acrescenta o índice que o torna
--          barato.
--
-- Idempotente. Pode correr duas vezes.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0019_sprint3_results.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · T-22 · um acontecimento, uma linha
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O sintoma foi `O prazo de pagamento expirou ×22` numa lista de notificações.
-- Um prazo expira uma vez; vinte e duas linhas são vinte e duas passagens de um
-- trabalho agendado a reescrever o mesmo facto.
--
-- A campainha já colapsava a repetição na leitura (ver `lib/bo-alerts.ts`), o
-- que resolvia o ecrã e não o problema: as linhas continuavam a nascer, e
-- qualquer canal que as lesse — um email, um WhatsApp — voltaria a entregá-las.
--
-- `dedupe_key` é nulo por omissão, e por isso nada do que já existe muda: um
-- evento sem chave continua a poder repetir-se, porque há acontecimentos que
-- legitimamente se repetem (uma nota, um reenvio, uma segunda proposta de
-- datas). A chave só se escreve onde a repetição é um defeito.

alter table public.case_events
  add column if not exists dedupe_key text;

comment on column public.case_events.dedupe_key is
  'T-22 · marca um acontecimento que só pode existir uma vez neste caso. Nulo = pode repetir-se.';

create unique index if not exists case_events_once_idx
  on public.case_events (case_id, dedupe_key)
  where dedupe_key is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · T-04 · a emissão, um bloco por voo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "O ecrã de emissão só permite introduzir a ida. Um bilhete de volta não pode
-- ser emitido — o ciclo não fecha numa ida e volta."
--
-- A causa é a forma dos dados: `booking_cases` tem **um** `fare_basis`, **um**
-- `nvb`, **um** `nva`. Um documento de ida e volta tem um cupão por voo, e cada
-- cupão tem a sua base tarifária e as suas datas de validade. Com uma coluna só
-- não há onde escrever a segunda.
--
-- As colunas de `booking_cases` ficam onde estão: são o valor da viagem toda
-- quando ele é mesmo um só, e é o que os casos já emitidos têm gravado. O que
-- nasce aqui é o detalhe por trecho, que ganha quando existe.
--
-- A chave estrangeira aponta para `case_offer_segments` — o trecho da oferta
-- que o cliente escolheu (migração 0005). É esse o "voo" de que o documento
-- fala, e é dele que vêm a origem, o destino e as horas.

create table if not exists public.case_segment_issuance (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.booking_cases (id) on delete cascade,
  segment_id    uuid not null references public.case_offer_segments (id) on delete cascade,

  /* O que o cupão diz deste voo. */
  fare_basis    text,
  nvb           text,
  nva           text,
  coupon_number text,

  /* O que as duas referências (Trip.com e o voucher WeeFly) mostram por trecho
     e o nosso documento não mostrava. */
  aircraft      text,
  cabin         text,
  booking_class text,
  terminal_from text,
  terminal_to   text,
  /* TK-05 · o localizador **da companhia**, que é diferente do nosso e pode ser
     diferente entre trechos quando as companhias são diferentes. */
  airline_pnr   text,
  /* TK-06 · `Confirmed`, `Waitlist`, `Cancelled` — o estado do cupão. */
  segment_status text not null default 'confirmed',
  /* TK-04 · a bagagem segue para o destino final, ou tem de ser levantada? */
  baggage_through boolean,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (case_id, segment_id)
);

create index if not exists case_segment_issuance_case_idx
  on public.case_segment_issuance (case_id);

drop trigger if exists case_segment_issuance_touch on public.case_segment_issuance;
create trigger case_segment_issuance_touch
  before update on public.case_segment_issuance
  for each row execute function public.touch_updated_at();

comment on table public.case_segment_issuance is
  'T-04 · os campos do documento por voo. Um cupão por trecho, e não um por viagem.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 · T-10 e TK-03 · a bagagem por voo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "As condições da tarifa diferem por voo. Um cliente pode deliberadamente ir
-- com mais bagagem e voltar com menos para reduzir o custo. Um valor para a
-- viagem toda não sabe dizer isso."
--
-- Duas tabelas e não uma, porque são dois momentos:
--
--   · `case_offer_segment_baggage` é a **promessa** — o que a proposta diz que
--     aquele voo inclui. Nasce no compositor, antes de haver passageiros.
--   · `case_passenger_baggage` é o **facto** — o que ficou no bilhete daquele
--     passageiro naquele voo. Nasce na emissão.
--
-- Juntá-las obrigaria a inventar um passageiro para guardar a promessa, ou a
-- perder a diferença entre o que foi prometido e o que foi emitido — que é
-- exactamente a diferença que se vai procurar quando o cliente reclama.

create table if not exists public.case_offer_segment_baggage (
  id              uuid primary key default gen_random_uuid(),
  segment_id      uuid not null references public.case_offer_segments (id) on delete cascade,

  /* Em peças e quilos, porque é assim que a companhia o escreve e é assim que o
     balcão o verifica. `personal_item` é a mochila debaixo do banco. */
  personal_item   boolean not null default true,
  cabin_pieces    smallint not null default 1,
  cabin_kg        numeric(5,1),
  checked_pieces  smallint not null default 0,
  checked_kg      numeric(5,1),
  /* TK-03 · "dimensões máximas" — o que a Trip.com mostra e nós não. */
  cabin_dimensions   text,
  checked_dimensions text,
  /* A letra pequena da tarifa daquele voo. */
  fare_conditions text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (segment_id)
);

drop trigger if exists case_offer_segment_baggage_touch on public.case_offer_segment_baggage;
create trigger case_offer_segment_baggage_touch
  before update on public.case_offer_segment_baggage
  for each row execute function public.touch_updated_at();

comment on table public.case_offer_segment_baggage is
  'T-10 · a bagagem prometida por voo, na proposta. Uma linha por trecho.';

create table if not exists public.case_passenger_baggage (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references public.booking_cases (id) on delete cascade,
  passenger_id   uuid not null references public.case_passengers (id) on delete cascade,
  segment_id     uuid not null references public.case_offer_segments (id) on delete cascade,

  checked_pieces smallint not null default 0,
  checked_kg     numeric(5,1),
  cabin_pieces   smallint not null default 1,
  cabin_kg       numeric(5,1),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (passenger_id, segment_id)
);

create index if not exists case_passenger_baggage_case_idx
  on public.case_passenger_baggage (case_id);

drop trigger if exists case_passenger_baggage_touch on public.case_passenger_baggage;
create trigger case_passenger_baggage_touch
  before update on public.case_passenger_baggage
  for each row execute function public.touch_updated_at();

comment on table public.case_passenger_baggage is
  'T-04 · a bagagem emitida, por passageiro e por voo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 · quem lê o quê
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O mesmo desenho das tabelas do caso: RLS ligada, e a leitura reservada a quem
-- está na lista do back-office. O cliente nunca chega aqui por sessão — o que
-- ele vê passa pela service role, que ignora RLS por definição.

alter table public.case_segment_issuance      enable row level security;
alter table public.case_offer_segment_baggage enable row level security;
alter table public.case_passenger_baggage     enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'case_segment_issuance'
      and policyname = 'case_segment_issuance_staff'
  ) then
    create policy case_segment_issuance_staff on public.case_segment_issuance
      for all to authenticated
      using (public.is_bo_allowed()) with check (public.is_bo_allowed());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'case_offer_segment_baggage'
      and policyname = 'case_offer_segment_baggage_staff'
  ) then
    create policy case_offer_segment_baggage_staff on public.case_offer_segment_baggage
      for all to authenticated
      using (public.is_bo_allowed()) with check (public.is_bo_allowed());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'case_passenger_baggage'
      and policyname = 'case_passenger_baggage_staff'
  ) then
    create policy case_passenger_baggage_staff on public.case_passenger_baggage
      for all to authenticated
      using (public.is_bo_allowed()) with check (public.is_bo_allowed());
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 5 · T-21 · a fila sem os casos fechados
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `closed_at` chegou com a 0014 e a fila passou a filtrar por ela em todas as
-- leituras. Um índice parcial sobre os casos **abertos** é o que essa leitura
-- faz mil vezes por dia; o filtro dos fechados é o gesto raro.

create index if not exists booking_cases_open_idx
  on public.booking_cases (updated_at desc)
  where closed_at is null;

create index if not exists booking_cases_closed_idx
  on public.booking_cases (closed_at desc)
  where closed_at is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 6 · T-03 · o back-office reage sem F5
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A publicação já foi criada na 0010. Repete-se aqui a garantia porque uma base
-- restaurada de uma cópia anterior a essa migração fica com a publicação vazia,
-- e o sintoma disso é exactamente o que o T-03 descreve: nada se mexe até
-- alguém recarregar. Correr isto é barato e não estraga nada.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'booking_cases',
    'trip_requests',
    'case_payments',
    'case_payment_proofs',
    'case_passengers',
    'case_proposals',
    'case_events',
    'case_notifications'
  ]
  loop
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
