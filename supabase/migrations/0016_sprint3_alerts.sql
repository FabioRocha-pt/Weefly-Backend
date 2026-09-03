-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly Concierge · Sprint 3 — C-14 · a campainha que conta a sério
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A campainha do topbar era um `<button>` com um ícone e mais nada: sem
-- contador, sem `onClick`, sem lista. Um botão que não faz nada ensina o
-- utilizador a não confiar na interface — é a frase do C-13, e vale aqui.
--
-- O que a campainha conta são os **acontecimentos do lado do cliente**: ele
-- escolheu uma opção, submeteu passaportes, escolheu um método, enviou
-- comprovativo, cancelou. Já ficam todos em `case_events`; o que não existia
-- era saber quais deles **esta pessoa** já viu.
--
-- Por linha e não por marca de água: "os estados de lido e não lido persistem
-- por utilizador". Uma marca de água ("vi tudo até às 14:03") marcaria como
-- lido o que ficou entre dois alertas abertos, e o que se perde assim é
-- exactamente o aviso do meio — o que ninguém leu porque foi tapado por um
-- mais recente.
--
-- Idempotente. Pode correr duas vezes.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0016_sprint3_alerts.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.bo_alert_reads (
  user_id  uuid        not null references auth.users (id) on delete cascade,
  event_id uuid        not null references public.case_events (id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (user_id, event_id)
);

comment on table public.bo_alert_reads is
  'C-14 · que alerta cada pessoa do back-office já viu. Uma linha por par.';

-- A pergunta que a campainha faz a cada render: "os meus não-lidos".
create index if not exists bo_alert_reads_user_idx
  on public.bo_alert_reads (user_id, read_at desc);

/*
 * RLS: cada um vê e escreve as suas marcas, e as de mais ninguém.
 *
 * A leitura da campainha corre pela service role (como o resto da fila, ver
 * `lib/pc/bo-queue.ts`), mas a política existe porque a tabela tem a coluna
 * `user_id` e uma tabela com dono que não a verifica é uma tabela à espera de
 * ser lida de lado.
 */
alter table public.bo_alert_reads enable row level security;

drop policy if exists "bo_alert_reads_own" on public.bo_alert_reads;
create policy "bo_alert_reads_own"
  on public.bo_alert_reads for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- C-31 · uma nota pode ser escondida, e o esconder fica registado
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "As mensagens são imutáveis para o cliente e para o agente. Um administrador
-- pode esconder uma mensagem; o esconder fica registado, o conteúdo é
-- preservado."
--
-- Daí serem três colunas e não um `delete`: o conteúdo fica, e quem o escondeu
-- e quando ficam ao lado dele. Uma nota escondida sai do que o cliente vê e
-- continua a existir para quem tem de responder por ela.
--
-- `client_visible` separa a nota interna da que o cliente pode ler — o outro
-- critério do C-31. Por omissão **falso**: uma nota escrita no back-office é
-- interna até alguém decidir o contrário, e o erro de a mostrar por omissão é
-- pior do que o de a esconder.

alter table public.trip_request_notes
  add column if not exists client_visible boolean not null default false,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references auth.users (id),
  add column if not exists hidden_by_email text;

comment on column public.trip_request_notes.client_visible is
  'C-31 · a nota é visível ao cliente? Interna por omissão.';
comment on column public.trip_request_notes.hidden_at is
  'C-31 · escondida por um administrador. O conteúdo é preservado.';

commit;

notify pgrst, 'reload schema';
