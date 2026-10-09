-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · B2G v2 — os canais de cada empresa (B2G-02, B2G-21)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- B2G-02 · "No Admin, o master liga a ferramenta Viagens e escolhe os canais
-- de cada empresa: Público, VIP, Ministérios." Os três vivem em
-- `partners.channels`, que já existia (0020) com B2C e B2G:
--
--   B2C · Público       (o link público do price checker)
--   VIP · VIP           (clientes VIP com link pessoal — bloco 2)
--   B2G · Ministérios   (ministérios, secretárias, pedidos B2G)
--
-- Ligar ou desligar é um `update` na linha da empresa: não exige versão nova.
--
-- O caso passa a dizer por que canal entrou (`booking_cases.channel`), para que
-- cada menu do terminal de vendas tenha a sua fila (B2G-21). Um caso com
-- ministério é sempre `ministerio`: o gatilho impõe-no, em vez de confiar em
-- quem escreve.
--
-- E ainda:
--   · `concierge` entra nos subdomínios reservados (a mesma lista que
--     `src/lib/subdomain.ts`), `not valid` como as outras regras do slug;
--   · as acções novas do registo de acessos de que os blocos seguintes
--     precisam (VIP, secretárias, pedidos de ministério, reclamar/libertar).
--
-- Depende da 0020, 0026, 0028 e 0031. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0032_b2g_v2_channels.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── B2G-02 · os três canais ─────────────────────────────────────────────────

alter table public.partners drop constraint if exists partners_channels_check;
alter table public.partners add constraint partners_channels_check
  check (channels <@ array['B2C', 'VIP', 'B2G']::text[]);

alter table public.product_sellers drop constraint if exists product_sellers_channels_check;
alter table public.product_sellers add constraint product_sellers_channels_check
  check (channels <@ array['B2C', 'VIP', 'B2G']::text[]);

comment on column public.partners.channels is
  'B2G-02 · os canais ligados: B2C (Público), VIP, B2G (Ministérios). Cada um é um menu no terminal de vendas.';

/*
 * A empresa tem este canal ligado? Security definer para que uma política ou
 * uma função de outra tabela a possa perguntar sem depender do RLS de
 * `partners`. Só diz sim ou não: não expõe nada da linha.
 */
create or replace function public.partner_has_channel(p_partner uuid, p_channel text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p_channel = any (channels) from public.partners where id = p_partner),
    false);
$$;

revoke all on function public.partner_has_channel(uuid, text) from public;
grant execute on function public.partner_has_channel(uuid, text) to anon, authenticated, service_role;

-- ── B2G-21 · o canal do caso ────────────────────────────────────────────────

alter table public.booking_cases
  add column if not exists channel text not null default 'publico';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'booking_cases_channel_check') then
    alter table public.booking_cases
      add constraint booking_cases_channel_check
      check (channel in ('publico', 'vip', 'ministerio'));
  end if;
end $$;

-- Os casos que já têm ministério vieram pelo canal Ministérios.
update public.booking_cases
   set channel = 'ministerio'
 where organisation_id is not null
   and channel <> 'ministerio';

/*
 * Um caso com ministério é `ministerio`; um sem ministério não o pode ser.
 * `vip` decide-se no bloco 2 (pelo cliente VIP do caso); até lá, o que vier
 * escrito fica.
 */
create or replace function public.booking_cases_force_channel()
returns trigger
language plpgsql
as $$
begin
  if new.organisation_id is not null then
    new.channel := 'ministerio';
  elsif new.channel = 'ministerio' then
    new.channel := 'publico';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_cases_force_channel on public.booking_cases;
create trigger booking_cases_force_channel
  before insert or update of organisation_id, channel on public.booking_cases
  for each row execute function public.booking_cases_force_channel();

create index if not exists booking_cases_partner_channel_idx
  on public.booking_cases (partner_id, channel);

-- ── OCT-12 · `concierge` reservado ──────────────────────────────────────────
--
-- O endereço antigo do backoffice convive com o pro (decisão Q3). A mesma
-- lista que `src/lib/subdomain.ts`. `not valid`, como na 0031: vale para o que
-- se escrever daqui em diante.

alter table public.partners drop constraint if exists partners_slug_not_reserved;
alter table public.partners
  add constraint partners_slug_not_reserved
  check (slug not in ('pro', 'www', 'admin', 'api', 'mail', 'dev', 'app', 'pc', 'static', 'assets', 'concierge')) not valid;

-- ── O registo de acessos: as acções dos blocos seguintes ────────────────────
--
-- Tudo o que a 0028 aceitava, mais VIP (B2G-22), secretárias e PIN (B2G-06),
-- pedidos de ministério (B2G-23), e reclamar/libertar, urgência e revisão
-- (B2G-11, B2G-13, B2G-15).

alter table public.access_audit drop constraint if exists access_audit_action_check;
alter table public.access_audit add constraint access_audit_action_check check (action in (
  'user_created', 'user_updated', 'user_suspended', 'user_reactivated',
  'partner_created', 'partner_updated', 'partner_suspended', 'partner_reactivated',
  'organisation_created', 'organisation_updated', 'organisation_link_rotated',
  'budget_adjusted', 'admin_intervention',
  -- B2G-22 · clientes VIP
  'vip_created', 'vip_updated', 'vip_deactivated', 'vip_reactivated',
  -- B2G-06 · B2G-07 · secretárias e PIN
  'secretary_created', 'secretary_updated', 'secretary_pin_generated',
  'secretary_pin_locked', 'secretary_deactivated', 'secretary_reactivated',
  -- B2G-23 · pedir um ministério
  'ministry_requested', 'ministry_request_approved', 'ministry_request_rejected',
  -- B2G-11 · B2G-13 · B2G-15 · tratamento
  'case_claimed', 'case_released', 'urgency_changed', 'proposal_review_requested'));

commit;

notify pgrst, 'reload schema';
