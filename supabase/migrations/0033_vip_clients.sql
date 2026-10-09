-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · B2G v2 — os clientes VIP de cada empresa (B2G-22, B2G-21, B2G-03)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- B2G-22 · "No menu VIP, o agente cria um cliente: nome, telefone, email. O
-- cliente recebe um link pessoal, opaco e permanente, com a marca da empresa.
-- O agente pode desativar um VIP; o link deixa de funcionar e o histórico
-- fica. O master vê os VIP de todas as empresas no Admin." (decisão D-9: é o
-- parceiro que os cria, não o Admin.)
--
--   · `vip_clients` · um cliente VIP, de uma empresa. O link é o `link_token`
--     (192 bits, como o do /pc e o do ministério), e não muda: "permanente".
--     Desactivar não apaga — o link morre e os pedidos ficam.
--   · `booking_cases.vip_client_id` · o caso que entrou pelo link de um VIP.
--     A chave composta `(vip_client_id, partner_id)` garante que o VIP é da
--     empresa do caso, como `booking_cases_organisation_fk` faz para o
--     ministério.
--   · O canal do caso (0032) passa a ser decidido também pelo VIP: com VIP é
--     `vip`, sem VIP nunca o é. Uma restrição diz o mesmo, por baixo do
--     gatilho, e recusa um caso com ministério e VIP ao mesmo tempo.
--
-- Leitura pelo RLS (`can_see_partner`, e só contas que entram no back-office:
-- a secretária não). Escrita só pela service role, depois de a server action
-- verificar a sessão e o canal — não há política de escrita.
--
-- Depende da 0020, 0026 e 0032. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0033_vip_clients.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── B2G-22 · o cliente VIP ──────────────────────────────────────────────────

create table if not exists public.vip_clients (
  id                    uuid primary key default gen_random_uuid(),
  partner_id            uuid not null references public.partners (id) on delete restrict,
  name                  text not null,
  email                 text,
  phone                 text,
  -- Decisão 10 · o nível é texto livre ("Ouro", "Embaixada", …).
  level                 text,
  -- 24 bytes em base64url = 32 caracteres. Nada sequencial, nada com nome.
  link_token            text not null,
  active                boolean not null default true,
  deactivated_at        timestamptz,
  deactivated_by_email  text,
  created_by_email      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint vip_clients_name_check   check (char_length(btrim(name)) between 2 and 160),
  constraint vip_clients_email_check  check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint vip_clients_phone_check  check (phone is null or char_length(phone) <= 40),
  constraint vip_clients_level_check  check (level is null or char_length(level) <= 60),
  constraint vip_clients_token_check  check (link_token ~ '^[A-Za-z0-9_-]{32,64}$'),
  constraint vip_clients_active_check check (active = (deactivated_at is null))
);

create unique index if not exists vip_clients_link_token_key on public.vip_clients (link_token);
-- A chave composta que `booking_cases` referencia.
create unique index if not exists vip_clients_id_partner_key on public.vip_clients (id, partner_id);
create index if not exists vip_clients_partner_idx on public.vip_clients (partner_id, created_at desc);

comment on table public.vip_clients is
  'B2G-22 · clientes VIP de uma empresa, com link pessoal permanente (/vip/<link_token>). Desactivar mata o link e guarda o histórico.';

/*
 * O que não muda depois de criado: a empresa (os casos apontam para o par
 * `(id, partner_id)`) e o link ("permanente"). O `updated_at` acompanha.
 */
create or replace function public.vip_clients_guard()
returns trigger
language plpgsql
as $$
begin
  if new.partner_id <> old.partner_id then
    raise exception 'um cliente VIP não muda de empresa' using errcode = 'check_violation';
  end if;
  if new.link_token <> old.link_token then
    raise exception 'o link de um cliente VIP é permanente' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vip_clients_guard on public.vip_clients;
create trigger vip_clients_guard
  before update on public.vip_clients
  for each row execute function public.vip_clients_guard();

alter table public.vip_clients enable row level security;

drop policy if exists vip_clients_select on public.vip_clients;
create policy vip_clients_select on public.vip_clients
  for select to authenticated
  using (public.can_see_partner(partner_id) and public.is_bo_allowed());

-- Sem políticas de escrita: cria-se, edita-se e desactiva-se pela service role.
revoke insert, update, delete on public.vip_clients from anon, authenticated;

-- ── B2G-21 · o caso que veio por um VIP ─────────────────────────────────────

alter table public.booking_cases
  add column if not exists vip_client_id uuid;

alter table public.booking_cases
  drop constraint if exists booking_cases_vip_client_fk;
alter table public.booking_cases
  add constraint booking_cases_vip_client_fk
    foreign key (vip_client_id, partner_id)
    references public.vip_clients (id, partner_id)
    on delete restrict;

create index if not exists booking_cases_vip_client_idx
  on public.booking_cases (vip_client_id) where vip_client_id is not null;

/*
 * O canal do caso, agora completo (substitui o da 0032):
 *   com ministério → `ministerio`; com VIP → `vip`; sem nenhum → nem um nem
 *   outro (o que vier, ou `publico`).
 * Com os dois ao mesmo tempo, o gatilho escolhe `ministerio` e a restrição
 * abaixo recusa a linha.
 */
create or replace function public.booking_cases_force_channel()
returns trigger
language plpgsql
as $$
begin
  if new.organisation_id is not null then
    new.channel := 'ministerio';
  elsif new.vip_client_id is not null then
    new.channel := 'vip';
  elsif new.channel in ('ministerio', 'vip') then
    new.channel := 'publico';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_cases_force_channel on public.booking_cases;
create trigger booking_cases_force_channel
  before insert or update of organisation_id, vip_client_id, channel on public.booking_cases
  for each row execute function public.booking_cases_force_channel();

-- Os casos `vip` sem cliente VIP (a 0032 deixava-os ficar) voltam a público.
update public.booking_cases
   set channel = 'publico'
 where channel = 'vip'
   and vip_client_id is null;

alter table public.booking_cases
  drop constraint if exists booking_cases_vip_channel_check;
alter table public.booking_cases
  add constraint booking_cases_vip_channel_check
  check ((channel = 'vip') = (vip_client_id is not null));

commit;

notify pgrst, 'reload schema';
