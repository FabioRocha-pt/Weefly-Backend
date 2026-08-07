-- WeeFly Concierge — a conversa como porta de entrada
--
-- O chatbot da Fase 2 vivia todo no browser: o histórico era `useState` e
-- morria num refresh. Isso chegava enquanto ele só fazia perguntas e mostrava
-- resultados do Amadeus, mas deixa de chegar no momento em que a resposta ao
-- cliente passa a ser escrita à mão por um agente, horas depois. Para o agente
-- poder responder para dentro da conversa, a conversa tem de existir num sítio
-- que os dois alcancem.
--
-- Relação com o resto do sistema: uma conversa acaba por produzir um
-- `booking_case`, e a partir daí é o mesmo caso que o back-office já conhece —
-- as mesmas ofertas, o mesmo compositor, os mesmos links. O chat é um canal de
-- entrada, não um sistema paralelo.

-- Conversas -------------------------------------------------------------------

create table if not exists public.chat_conversations (
  id          uuid primary key default gen_random_uuid(),
  /* O segredo que identifica a conversa no browser e no endereço /c/{token}.
     É próprio e não o do caso porque a conversa nasce antes do caso — ver o
     comentário de `case_id` abaixo. */
  token       text not null unique,

  channel     text not null default 'web'
                check (channel in ('web', 'whatsapp')),
  /* No WhatsApp, o número E.164 de quem escreve. Na web fica null: o token
     basta, porque não há identidade nenhuma para lá dele. */
  external_id text,

  /* Só é preenchido quando o pedido fica completo.
     Deliberadamente tardio: se o caso nascesse à primeira mensagem, cada
     visitante curioso que escrevesse "olá" criaria uma linha na fila de
     trabalho do vendedor. Uma conversa abandonada não custa nada a ninguém;
     um caso vazio custa a atenção de quem trabalha a lista. */
  case_id     uuid unique references public.booking_cases (id) on delete set null,

  /* O que o bot já percebeu, turno a turno: rota, datas, passageiros, contacto.
     Guardado para a conversa poder ser retomada dias depois sem repetir
     perguntas, e para o back-office ver o que falta a um pedido incompleto. */
  draft       jsonb not null default '{}'::jsonb,

  status      text not null default 'a_recolher'
                check (status in ('a_recolher', 'entregue', 'fechada')),

  last_client_message_at timestamptz,
  /* Última vez que o cliente esteve com a conversa aberta. Serve para decidir
     se uma proposta publicada precisa de um empurrão por email ou se ele está
     mesmo ali a olhar. */
  last_seen_at           timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

/* Um número de WhatsApp tem uma conversa aberta de cada vez. Índice parcial
   porque na web `external_id` é null e nulls não colidem entre si. */
create unique index if not exists chat_conversations_external_idx
  on public.chat_conversations (channel, external_id)
  where external_id is not null;

create index if not exists chat_conversations_recent_idx
  on public.chat_conversations (updated_at desc);

-- Mensagens -------------------------------------------------------------------

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
                    references public.chat_conversations (id) on delete cascade,

  /* Três autores, não dois. A distinção entre 'bot' e 'agent' é o coração
     desta funcionalidade: o cliente tem direito a saber quando está a falar
     com o assistente e quando está a falar com uma pessoa. */
  author  text not null check (author in ('client', 'bot', 'agent')),

  /* 'text'     — uma mensagem normal
     'proposal' — as ofertas publicadas; payload traz o id da proposta
     'link'     — um endereço para o cliente seguir (passaportes, pagamento)
     'system'   — marcos do caso, renderizados em tom discreto */
  kind    text not null default 'text'
            check (kind in ('text', 'proposal', 'link', 'system')),

  body    text,
  payload jsonb,

  /* Quem escreveu, quando é um agente. Null para o bot e para o cliente. */
  author_user_id uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at);

-- updated_at ------------------------------------------------------------------

drop trigger if exists chat_conversations_touch on public.chat_conversations;
create trigger chat_conversations_touch before update on public.chat_conversations
  for each row execute function public.touch_updated_at();

-- Row Level Security ----------------------------------------------------------
-- Como nas restantes tabelas do fluxo do cliente: quem conversa não tem sessão
-- e chega pelo service role, com o token a fazer de credencial. Estas políticas
-- só servem o back-office.

alter table public.chat_conversations enable row level security;
alter table public.chat_messages      enable row level security;

drop policy if exists "Staff read conversations" on public.chat_conversations;
create policy "Staff read conversations" on public.chat_conversations
  for select to authenticated using (public.is_platform_staff());
drop policy if exists "Staff write conversations" on public.chat_conversations;
create policy "Staff write conversations" on public.chat_conversations
  for all to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

drop policy if exists "Staff read messages" on public.chat_messages;
create policy "Staff read messages" on public.chat_messages
  for select to authenticated using (public.is_platform_staff());
drop policy if exists "Staff write messages" on public.chat_messages;
create policy "Staff write messages" on public.chat_messages
  for all to authenticated
  using (public.is_platform_staff()) with check (public.is_platform_staff());

notify pgrst, 'reload schema';
