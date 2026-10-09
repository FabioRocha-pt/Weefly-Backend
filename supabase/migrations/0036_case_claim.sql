-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · B2G v2 — reclamar, libertar e a urgência do caso
-- (B2G-13, B2G-11, B2G-14 · D-12 · decisão 2)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- B2G-13 · "Reclamar regista e bloqueia." Reclamar era um `update` da service
--   role na server action, depois de `caseInScope`. Passa a ser uma função da
--   base de dados, chamada **pela sessão** (`auth.uid()`), que faz as três
--   perguntas no mesmo sítio e na mesma transacção:
--     · quem pergunta entra no back-office (`is_bo_allowed`) e vê o caso
--       (`can_see_case`: a empresa da sessão, ou qualquer uma para o master —
--       D-12, decisão 2);
--     · o caso ainda não tem dono — `update … where created_by is null`, que é
--       o que decide entre dois cliques simultâneos;
--     · e regista: `claimed_at`, `claimed_by_email`, o `case_events` e o
--       `access_audit` (`case_claimed`). Para o master num caso de outra
--       empresa, esse registo **é** a intervenção (decisão 2).
--   Quem perde fica a saber quem ganhou (email e nome), e só quem vê o caso:
--   um caso de outra empresa responde `not_found`, como o 404 do TEN-03.
--
--   White label: o master que reclama um caso de uma empresa que não é o
--   operador **não** passa a ser o vendedor (`seller_*`) — o vendedor aparece
--   ao cliente, e o cliente da Alô não pode ver a WeeFly. Fica dono do caso
--   (`created_by`), que é interno.
--
-- B2G-13 · "Um administrador pode libertar o pedido; fica registado."
--   `release_case`: só um perfil que supervisiona casos (`supervises_cases`:
--   Admin do parceiro, Admin WeeFly) e que vê o caso; motivo obrigatório.
--   `case_released` no `case_events` e no `access_audit`.
--
-- B2G-11 · D-6 · "O agente pode alterar a urgência; fica registado."
--   `set_case_urgency`: qualquer conta do back-office que vê o caso, só em
--   casos de ministério. `urgency_changed` nos dois registos.
--
-- As três são SECURITY DEFINER com `search_path` fixo, sem nada para `anon`.
-- A service role não tem `auth.uid()`: para ela respondem `not_found`.
--
-- Depende da 0009, 0014, 0020, 0026, 0032 e 0035. Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0036_case_claim.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- "3h 05m" — o mesmo texto que `elapsedSince` (lib/case-status.ts) escreve.
create or replace function public.case_elapsed_label(p_from timestamptz, p_to timestamptz default now())
returns text
language sql
immutable
set search_path = public
as $$
  with m as (select greatest(0, floor(extract(epoch from (p_to - p_from)) / 60))::bigint as mins)
  select case
    when mins < 60 then mins || 'm'
    when mins < 1440 then (mins / 60) || 'h ' || lpad((mins % 60)::text, 2, '0') || 'm'
    when mins < 10080 then (mins / 1440) || 'd ' || lpad(((mins / 60) % 24)::text, 2, '0') || 'h'
    else (mins / 1440) || 'd'
  end
  from m;
$$;

-- Quem é a sessão, para os registos: email e o nome da allowlist.
create or replace function public.case_actor()
returns table (user_id uuid, email text, label text, cross_partner boolean, supervises boolean)
language sql
security definer
stable
set search_path = public
as $$
  select u.id,
         lower(u.email),
         coalesce(nullif(trim(a.label), ''), lower(u.email)),
         coalesce(a.cross_partner, false),
         coalesce(r.supervises_cases, false)
    from auth.users u
    join public.bo_allowlist a on lower(a.email) = lower(u.email) and a.active
    left join public.access_roles r on r.id = a.role_id
   where u.id = auth.uid();
$$;

revoke execute on function public.case_actor() from public, anon, authenticated;

-- O nome de quem tem o caso, para "reclamado por …".
create or replace function public.case_owner_label(p_email text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select nullif(trim(a.label), '') from public.bo_allowlist a where lower(a.email) = lower(p_email)),
    p_email);
$$;

revoke execute on function public.case_owner_label(text) from public, anon, authenticated;

-- ── B2G-13 · reclamar ───────────────────────────────────────────────────────

create or replace function public.claim_case(p_case uuid)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  me        record;
  c         record;
  v_now     timestamptz := now();
  v_keep    boolean;
  v_waited  text;
  v_won     uuid;
  w         record;
begin
  select * into me from public.case_actor();
  if me.user_id is null or not public.is_bo_allowed() then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select bc.id, bc.partner_id, bc.created_by, bc.created_at, bc.trip_request_id,
         bc.claimed_by_email, bc.claimed_at, p.is_operator
    into c
    from public.booking_cases bc
    join public.partners p on p.id = bc.partner_id
   where bc.id = p_case;

  -- O mesmo "não existe" para um caso que não há e um caso de outra empresa.
  if c.id is null or not public.can_see_case(p_case) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if c.created_by = me.user_id then
    return jsonb_build_object('outcome', 'already_yours',
      'claimed_by_email', coalesce(c.claimed_by_email, me.email),
      'claimed_by_label', me.label,
      'claimed_at', c.claimed_at);
  end if;

  if c.created_by is null then
    -- White label: o master num caso de outra empresa não passa a vendedor.
    v_keep := public.is_cross_partner() and not c.is_operator;

    update public.booking_cases
       set created_by       = me.user_id,
           claimed_at       = v_now,
           claimed_by_email = me.email,
           seller_email     = case when v_keep then seller_email  else me.email   end,
           seller_label     = case when v_keep then seller_label  else me.label   end,
           seller_set_at    = case when v_keep then seller_set_at else v_now      end,
           seller_set_by    = case when v_keep then seller_set_by else me.user_id end
     where id = p_case
       -- A corrida decide-se aqui, e não na leitura de cima.
       and created_by is null
    returning id into v_won;
  end if;

  if v_won is null then
    select bc.created_by, bc.claimed_by_email, bc.claimed_at, bc.seller_email
      into w
      from public.booking_cases bc where bc.id = p_case;
    if w.created_by = me.user_id then
      return jsonb_build_object('outcome', 'already_yours',
        'claimed_by_email', me.email, 'claimed_by_label', me.label, 'claimed_at', w.claimed_at);
    end if;
    return jsonb_build_object('outcome', 'taken',
      'claimed_by_email', w.claimed_by_email,
      'claimed_by_label', case when w.claimed_by_email is null then null
                               else public.case_owner_label(w.claimed_by_email) end,
      'claimed_at', w.claimed_at);
  end if;

  if c.trip_request_id is not null then
    update public.trip_requests
       set status = 'em_tratamento'
     where id = c.trip_request_id and status = 'novo';
  end if;

  v_waited := public.case_elapsed_label(c.created_at, v_now);

  insert into public.case_events (case_id, kind, title, detail, actor_id, actor_email, actor_kind, payload)
  values (p_case, 'case_claimed', 'Caso reclamado',
          me.label || ' · esteve ' || v_waited || ' sem dono',
          me.user_id, me.email, 'staff',
          jsonb_build_object('claimedAt', v_now, 'unclaimedFor', v_waited,
                             'crossPartner', me.cross_partner, 'sellerKept', v_keep));

  insert into public.access_audit (actor_user_id, actor_email, action, partner_id, target, before, after, reason)
  values (me.user_id, me.email, 'case_claimed', c.partner_id, p_case::text, null,
          jsonb_build_object('claimed_at', v_now, 'claimed_by_email', me.email,
                             'cross_partner', me.cross_partner, 'seller_kept', v_keep),
          null);

  return jsonb_build_object('outcome', 'claimed',
    'claimed_by_email', me.email,
    'claimed_by_label', me.label,
    'claimed_at', v_now,
    'unclaimed_for', v_waited,
    'seller_kept', v_keep);
end;
$$;

-- ── B2G-13 · libertar ───────────────────────────────────────────────────────

create or replace function public.release_case(p_case uuid, p_reason text)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  me       record;
  c        record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into me from public.case_actor();
  if me.user_id is null or not public.is_bo_allowed() then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select bc.id, bc.partner_id, bc.created_by, bc.claimed_by_email, bc.claimed_at
    into c
    from public.booking_cases bc
   where bc.id = p_case;

  if c.id is null or not public.can_see_case(p_case) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- Admin do parceiro (do parceiro do caso: `can_see_case`) ou Admin WeeFly.
  if not (me.supervises or me.cross_partner) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if v_reason is null or length(v_reason) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;
  v_reason := left(v_reason, 500);

  if c.created_by is null then
    return jsonb_build_object('outcome', 'not_claimed');
  end if;

  update public.booking_cases
     set created_by       = null,
         claimed_at       = null,
         claimed_by_email = null
   where id = p_case
     and created_by = c.created_by;
  if not found then
    -- Mudou de mãos entre a leitura e o update: quem chama volta a olhar.
    return jsonb_build_object('outcome', 'changed');
  end if;

  insert into public.case_events (case_id, kind, title, detail, actor_id, actor_email, actor_kind, payload)
  values (p_case, 'case_released', 'Caso libertado',
          me.label || ' · era de ' || coalesce(public.case_owner_label(c.claimed_by_email), '—') || ' · ' || v_reason,
          me.user_id, me.email, 'staff',
          jsonb_build_object('previousOwnerEmail', c.claimed_by_email,
                             'previousClaimedAt', c.claimed_at,
                             'reason', v_reason));

  insert into public.access_audit (actor_user_id, actor_email, action, partner_id, target, before, after, reason)
  values (me.user_id, me.email, 'case_released', c.partner_id, p_case::text,
          jsonb_build_object('claimed_by_email', c.claimed_by_email, 'claimed_at', c.claimed_at),
          null, v_reason);

  return jsonb_build_object('outcome', 'released',
    'previous_owner_email', c.claimed_by_email);
end;
$$;

-- ── B2G-11 · a urgência, alterada pelo agente ───────────────────────────────

create or replace function public.set_case_urgency(p_case uuid, p_urgency smallint)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  me record;
  c  record;
begin
  select * into me from public.case_actor();
  if me.user_id is null or not public.is_bo_allowed() then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select bc.id, bc.partner_id, bc.channel, bc.urgency
    into c
    from public.booking_cases bc
   where bc.id = p_case;

  if c.id is null or not public.can_see_case(p_case) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if p_urgency is null or p_urgency not between 0 and 2 then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  -- D-6 · a urgência é do pedido do ministério.
  if c.channel <> 'ministerio' then
    return jsonb_build_object('outcome', 'not_ministry');
  end if;

  if c.urgency = p_urgency then
    return jsonb_build_object('outcome', 'unchanged', 'urgency', p_urgency);
  end if;

  update public.booking_cases
     set urgency                  = p_urgency,
         urgency_changed_at       = now(),
         urgency_changed_by_email = me.email
   where id = p_case;

  insert into public.case_events (case_id, kind, title, detail, actor_id, actor_email, actor_kind, payload)
  values (p_case, 'urgency_changed', 'Urgência alterada',
          me.label || ' · ' || c.urgency || ' → ' || p_urgency,
          me.user_id, me.email, 'staff',
          jsonb_build_object('from', c.urgency, 'to', p_urgency));

  insert into public.access_audit (actor_user_id, actor_email, action, partner_id, target, before, after, reason)
  values (me.user_id, me.email, 'urgency_changed', c.partner_id, p_case::text,
          jsonb_build_object('urgency', c.urgency),
          jsonb_build_object('urgency', p_urgency), null);

  return jsonb_build_object('outcome', 'changed', 'urgency', p_urgency, 'previous', c.urgency);
end;
$$;

-- Só sessões do back-office. Nada para `anon`; a service role não precisa.
revoke execute on function public.claim_case(uuid) from public, anon;
revoke execute on function public.release_case(uuid, text) from public, anon;
revoke execute on function public.set_case_urgency(uuid, smallint) from public, anon;
grant execute on function public.claim_case(uuid) to authenticated;
grant execute on function public.release_case(uuid, text) to authenticated;
grant execute on function public.set_case_urgency(uuid, smallint) to authenticated;

commit;

notify pgrst, 'reload schema';
