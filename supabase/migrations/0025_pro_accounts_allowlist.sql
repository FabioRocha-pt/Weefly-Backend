-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly Pro · quem já está na allowlist não espera por aprovação
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A 0022 aprovou as contas que já existiam e fez do Dominik a conta master —
-- mas só se a conta dele já existisse. Não existia: `dominik@weefly.africa`
-- está na `bo_allowlist` e nunca se registou. Ao registar-se nasceria
-- pendente, e a única conta que aprova é a master, que é ele. Ninguém o
-- desbloqueava.
--
-- A regra que resolve isto e que faz sentido por si: um email que a equipa já
-- pôs na allowlist activa foi validado por alguém. Ao registar-se entra
-- aprovado, na empresa dessa linha. E o Dominik entra como master.
--
-- Depende da 0020 e da 0022. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0025_pro_accounts_allowlist.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.create_pro_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(coalesce(new.email, ''));
  v_partner uuid;
  v_master  boolean;
begin
  select a.partner_id into v_partner
    from public.bo_allowlist a
   where lower(a.email) = v_email
     and a.active;

  -- PRO-02 · a conta master. O único email escrito numa regra, como na 0022,
  -- e só vale dentro do operador (o trigger `guard_pro_master` confirma).
  v_master := v_partner is not null
          and v_email = 'dominik@weefly.africa'
          and exists (select 1 from public.partners where id = v_partner and is_operator);

  insert into public.pro_accounts
    (user_id, email, company_hint, status, partner_id, is_master, decided_at)
  values (
    new.id,
    v_email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'company', '')), ''),
    case when v_partner is not null then 'approved' else 'pending' end,
    v_partner,
    v_master,
    case when v_partner is not null then now() end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Quem se registou entre a 0022 e esta migração com um email da allowlist
-- ficou pendente sem razão: aprova-se agora.
update public.pro_accounts p
   set status = 'approved',
       partner_id = a.partner_id,
       decided_at = now()
  from public.bo_allowlist a
 where lower(a.email) = p.email
   and a.active
   and p.status = 'pending';

update public.pro_accounts p
   set is_master = true
  from public.partners w
 where p.email = 'dominik@weefly.africa'
   and p.status = 'approved'
   and p.partner_id = w.id
   and w.is_operator
   and not p.is_master;

commit;

notify pgrst, 'reload schema';
