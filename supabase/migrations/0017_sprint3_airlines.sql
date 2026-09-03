-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly Concierge · Sprint 3 — C-10 · as companhias como dados
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "As companhias ficam guardadas como dados, acrescentáveis sem um deploy."
--
-- Estavam num objecto no código (`CARRIERS` em lib/pc/catalog.ts), com dez
-- entradas. Acrescentar a décima primeira era editar TypeScript e publicar —
-- que é exactamente o que este critério recusa.
--
-- Passa a ser uma tabela. O código continua a ter a lista como recurso para
-- quando a tabela não responde (ver `lib/airlines-catalog.ts`), pela mesma
-- razão que a `bo_allowlist` o faz: uma leitura que falha não pode deixar o
-- compositor sem companhias nenhumas.
--
-- `prefix` e `hub` não vêm para aqui. São dados de emissão que só dez
-- companhias têm preenchidos, e inventá-los para as outras vinte e uma seria
-- gravar números de bilhete que ninguém confirmou. Continuam no código, para as
-- que os têm.
--
-- Os logos são ficheiros e não linhas: vivem em `public/airlines/{iata}.png`,
-- nomeados pelo código IATA em minúsculas. Uma companhia acrescentada por
-- `insert` sem ficheiro mostra a sigla — é o critério "um logótipo em falta
-- cai para a sigla, nunca um espaço vazio".
--
-- Idempotente. Pode correr duas vezes.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0017_sprint3_airlines.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.airlines (
  iata     text        primary key check (char_length(iata) = 2),
  name     text        not null,
  /* A ordem em que aparecem no seletor. O backlog dá-a por escrito, em três
     grupos: as que a WeeFly vende todos os dias, as grandes, e as regionais. */
  priority integer     not null default 9,
  active   boolean     not null default true,
  created_at timestamptz not null default now()
);

comment on table public.airlines is
  'C-10 · as companhias do seletor. Acrescentar uma é um insert, não um deploy.';

create index if not exists airlines_active_idx
  on public.airlines (priority, name) where active;

/*
 * As 31 do backlog, com a prioridade que ele lhes dá.
 *
 * `do update` no nome e na prioridade, e **não** no `active`: se alguém
 * desactivou uma companhia à mão, correr esta migração outra vez não a
 * ressuscita.
 */
insert into public.airlines (iata, name, priority) values
  ('VR', 'Cabo Verde Airlines', 1),
  ('TP', 'TAP Air Portugal', 1),
  ('AT', 'Royal Air Maroc', 1),
  ('SN', 'Brussels Airlines', 1),
  ('AF', 'Air France', 1),
  ('KL', 'KLM', 1),
  ('IB', 'Iberia', 1),
  ('LH', 'Lufthansa', 1),
  ('DL', 'Delta Air Lines', 2),
  ('UA', 'United Airlines', 2),
  ('AA', 'American Airlines', 2),
  ('BA', 'British Airways', 2),
  ('LX', 'Swiss International Air Lines', 2),
  ('SK', 'SAS', 2),
  ('FR', 'Ryanair', 2),
  ('U2', 'easyJet', 2),
  ('VY', 'Vueling', 2),
  ('TK', 'Turkish Airlines', 2),
  ('EK', 'Emirates', 2),
  ('QR', 'Qatar Airways', 2),
  ('HC', 'Air Senegal', 3),
  ('ET', 'Ethiopian Airlines', 3),
  ('DT', 'TAAG Angola Airlines', 3),
  ('KQ', 'Kenya Airways', 3),
  ('AW', 'Africa World Airlines', 3),
  ('G3', 'GOL Linhas Aéreas', 3),
  ('AD', 'Azul Brazilian Airlines', 3),
  ('LA', 'LATAM Airlines', 3),
  ('MS', 'EgyptAir', 3),
  ('AH', 'Air Algérie', 3),
  ('TU', 'Tunisair', 3)
on conflict (iata) do update
  set name     = excluded.name,
      priority = excluded.priority;

-- Leitura para todos os autenticados; escrita só por quem administra a base.
alter table public.airlines enable row level security;

drop policy if exists "airlines_read" on public.airlines;
create policy "airlines_read"
  on public.airlines for select
  to authenticated
  using (active);

commit;

notify pgrst, 'reload schema';
