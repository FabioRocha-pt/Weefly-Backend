-- WeeFly Concierge — propostas compostas à mão (mockup A4) e o link 2 do cliente
--
-- O vendedor não pesquisa tarifas na plataforma: liga à companhia ou ao
-- consolidador e escreve aqui o que lhe disseram. Por isso não há nada vindo de
-- um GDS nestas tabelas — todos os campos são de preenchimento manual.
--
-- Uma proposta por caso. Cada proposta tem N ofertas (as opções que o cliente
-- vai comparar) e cada oferta tem N trechos, divididos entre ida e volta.
--
-- O link 2 (/p/{token}/proposta) deixa de nascer aberto: passa a abrir no clique
-- em "Publicar e avisar cliente", que é o único momento em que existe de facto
-- alguma coisa para o cliente ver. Isto reverte a 0004 para a etapa 2; a etapa 3
-- continua a nascer aberta, como lá ficou decidido.

-- Propostas -------------------------------------------------------------------

create table if not exists public.case_proposals (
  id              uuid primary key default gen_random_uuid(),
  -- Uma só por caso: as revisões são um contador, não linhas novas.
  case_id         uuid not null unique
                    references public.booking_cases (id) on delete cascade,
  /* R1, R2, R3… Publicar tranca a edição; "Nova revisão" incrementa isto e
     devolve o estado a 'rascunho'. Enquanto uma revisão está aberta o cliente vê
     "a proposta está a ser atualizada" em vez de preços a meio de serem
     mexidos. */
  revision        smallint not null default 1 check (revision > 0),
  status          text not null default 'rascunho'
                    check (status in ('rascunho', 'publicada')),
  -- Moeda de todo o caso. Os montantes das ofertas são nesta moeda.
  currency        char(3) not null default 'CVE',
  -- Texto livre que abre o email e a página do cliente.
  opening_message text,
  published_at    timestamptz,
  published_by    uuid references auth.users (id) on delete set null,
  -- Preenchido quando o cliente carrega em "Escolher esta opção".
  selected_offer_id uuid,
  selected_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Ofertas ---------------------------------------------------------------------
-- Dinheiro em UNIDADES MENORES (bigint), como em case_payments.amount, para o
-- total escolhido passar para o pagamento sem uma etapa de arredondamento.

create table if not exists public.case_offers (
  id               uuid primary key default gen_random_uuid(),
  proposal_id      uuid not null
                     references public.case_proposals (id) on delete cascade,
  -- Ordem em que o cliente as vê. Reordenável por arrasto no compositor.
  position         smallint not null default 0,
  name             text not null default '',
  /* As caixas do painel "Publicar proposta". Uma oferta pode ficar composta e
     não sair — a comparação com o consolidador que se fez e não se quer
     mostrar, ou a alternativa que ficou pior depois de escrita. Desmarcar é
     mais barato do que apagar e voltar a escrever. */
  include_in_proposal boolean not null default true,

  -- Etiquetas. Independentes de propósito: a mais barata pode ser a
  -- recomendada, e nada obriga a que exista uma de cada.
  is_recommended   boolean not null default false,
  is_cheapest      boolean not null default false,
  is_fastest       boolean not null default false,

  -- Condições da tarifa, todas texto livre: o que a companhia responde não cabe
  -- num enum, e uma lista fechada obrigaria o vendedor a mentir por aproximação.
  fare_name        text,
  baggage_cabin    text,
  baggage_hold     text,
  change_policy    text,
  refund_policy    text,
  seat_policy      text,
  documents        text,

  -- Preço, unitário por tipo de passageiro
  price_adult      bigint not null default 0 check (price_adult  >= 0),
  price_child      bigint not null default 0 check (price_child  >= 0),
  price_infant     bigint not null default 0 check (price_infant >= 0),
  -- Totais, não unitários
  taxes_total      bigint not null default 0 check (taxes_total >= 0),
  service_fee      bigint not null default 0 check (service_fee >= 0),
  lock_fee         bigint not null default 0 check (lock_fee    >= 0),
  lock_fee_enabled boolean not null default false,
  /* Custo no consolidador. Nunca sai do back-office: nenhuma leitura pública
     seleciona esta coluna. Serve só para a margem que o vendedor vê. */
  cost_total       bigint not null default 0 check (cost_total >= 0),

  /* Depois disto o preço tem de ser reconfirmado com a companhia. Sem fuso,
     como as horas dos trechos: o vendedor escreve "6 set, 18:00" a pensar na
     hora de Cabo Verde e é essa que o cliente lê. Cabo Verde não tem horário de
     verão, por isso o relógio do lado do cliente converte com um offset fixo. */
  valid_until      timestamp,
  agent_note       text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists case_offers_proposal_idx
  on public.case_offers (proposal_id, position);

alter table public.case_proposals
  drop constraint if exists case_proposals_selected_offer_fkey;
alter table public.case_proposals
  add constraint case_proposals_selected_offer_fkey
  foreign key (selected_offer_id)
  references public.case_offers (id) on delete set null;

-- Trechos ---------------------------------------------------------------------

create table if not exists public.case_offer_segments (
  id             uuid primary key default gen_random_uuid(),
  offer_id       uuid not null
                   references public.case_offers (id) on delete cascade,
  direction      text not null check (direction in ('ida', 'volta')),
  position       smallint not null default 0,

  carrier_code   text,
  flight_number  text,
  equipment      text,
  booking_class  text,
  cabin          text not null default 'economy'
                   check (cabin in ('economy', 'premium_economy', 'business', 'first')),

  origin         text,
  destination    text,
  /* HORA LOCAL DO AEROPORTO, sem fuso de propósito. `timestamptz` seria errado
     aqui: 08:40 na Praia e 08:40 em Boston não são o mesmo instante, e ninguém
     transcreve um itinerário com offsets. A duração de cada trecho é a única
     coisa que sofre com isto, e é por isso que o compositor a mostra calculada
     das horas introduzidas em vez de a guardar. */
  depart_at      timestamp,
  arrive_at      timestamp,
  terminal_from  text,
  terminal_to    text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists case_offer_segments_offer_idx
  on public.case_offer_segments (offer_id, direction, position);

-- Estados novos ---------------------------------------------------------------
-- E2 "opções enviadas" e E3 "escolheu, falta preencher" não existiam porque
-- antes da proposta não havia nada entre "pedido recebido" e "à espera de
-- dados". `detalhes_pendentes` fica no check para não invalidar casos antigos.

alter table public.booking_cases
  drop constraint if exists booking_cases_stage_check;
alter table public.booking_cases
  add constraint booking_cases_stage_check check (stage in (
    'novo',
    'pedido_recebido',
    'proposta_enviada',
    'opcao_escolhida',
    'detalhes_pendentes',
    'detalhes_recebidos',
    'pagamento_pendente',
    'pago',
    'emitido',
    'cancelado'
  ));

-- A etapa 2 volta a nascer fechada ------------------------------------------
-- Ao contrário do que a 0004 descreve, a etapa 2 já não é um beco sem saída
-- quando está fechada: publicar destranca-a e envia o email no mesmo gesto.

create or replace function public.seed_case_links()
returns trigger
language plpgsql
as $$
begin
  insert into public.case_links (case_id, stage, status, unlocked_at)
  values
    (new.id, 1, 'ativo',      now()),
    (new.id, 2, 'bloqueado',  null),
    (new.id, 3, 'ativo',      now());
  return new;
end;
$$;

-- Casos que já existem --------------------------------------------------------
-- Só fecha a etapa 2 de quem não tem nada publicado nem preenchido. Um cliente
-- que já submeteu passaportes, ou que está a meio disso num caso mais avançado,
-- não pode ver a porta a fechar-se atrás de si.

update public.case_links l
   set status = 'bloqueado',
       unlocked_at = null
  from public.booking_cases c
 where l.case_id = c.id
   and l.stage = 2
   and l.status = 'ativo'
   and l.submitted_at is null
   and l.first_opened_at is null
   and c.stage in ('novo', 'pedido_recebido', 'detalhes_pendentes');

-- A 0004 empurrou para 'detalhes_pendentes' casos que só lá estavam porque a
-- etapa 2 tinha sido aberta à força. Sem proposta publicada, o sítio honesto
-- desses casos é "pedido recebido, à espera de cotação".
update public.booking_cases c
   set stage = 'pedido_recebido'
 where c.stage = 'detalhes_pendentes'
   and c.trip_request_id is not null
   and not exists (
     select 1 from public.case_proposals p
      where p.case_id = c.id and p.status = 'publicada'
   )
   and not exists (
     select 1 from public.case_passengers x where x.case_id = c.id
   );

-- updated_at ------------------------------------------------------------------

drop trigger if exists case_proposals_touch on public.case_proposals;
create trigger case_proposals_touch before update on public.case_proposals
  for each row execute function public.touch_updated_at();

drop trigger if exists case_offers_touch on public.case_offers;
create trigger case_offers_touch before update on public.case_offers
  for each row execute function public.touch_updated_at();

drop trigger if exists case_offer_segments_touch on public.case_offer_segments;
create trigger case_offer_segments_touch before update on public.case_offer_segments
  for each row execute function public.touch_updated_at();

-- Row Level Security ----------------------------------------------------------
-- Como nas restantes tabelas do caso: o cliente não tem sessão, chega pelo
-- service role, e por isso não há política anon nenhuma. Estas só servem staff.

alter table public.case_proposals      enable row level security;
alter table public.case_offers         enable row level security;
alter table public.case_offer_segments enable row level security;

drop policy if exists "Staff read proposals" on public.case_proposals;
create policy "Staff read proposals" on public.case_proposals
  for select to authenticated using (public.is_platform_staff());
drop policy if exists "Staff write proposals" on public.case_proposals;
create policy "Staff write proposals" on public.case_proposals
  for all to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

drop policy if exists "Staff read offers" on public.case_offers;
create policy "Staff read offers" on public.case_offers
  for select to authenticated using (public.is_platform_staff());
drop policy if exists "Staff write offers" on public.case_offers;
create policy "Staff write offers" on public.case_offers
  for all to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

drop policy if exists "Staff read segments" on public.case_offer_segments;
create policy "Staff read segments" on public.case_offer_segments
  for select to authenticated using (public.is_platform_staff());
drop policy if exists "Staff write segments" on public.case_offer_segments;
create policy "Staff write segments" on public.case_offer_segments
  for all to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

notify pgrst, 'reload schema';
