-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · Fechar o VIP · secção 8 — a limpeza do teste de 19 de novembro
-- ═══════════════════════════════════════════════════════════════════════════
--
--   ☐ Desativar o TESTE VIP. A desativação não chegou a concluir.
--   ☐ Marcar WF-2611-0094 e WF-2611-0095 como teste. O 0094 está como
--     "comprovativo por validar" por causa do E2, sem ninguém ter pago.
--
-- O que este script faz, e só isto:
--   1. desfaz no pagamento do 0094 a declaração que ninguém fez (o botão das
--      instruções do Stripe chamava a declaração — o E2): volta a "à espera
--      de pagamento". Só se não houver comprovativo nem confirmação;
--   2. arquiva os dois casos como teste (motivo "outro", com a nota), como o
--      botão Arquivar do back-office faria, e regista-o no histórico de cada um;
--   3. desativa o cliente "TESTE VIP" da WeeFly: o link deixa de abrir, e o
--      histórico fica.
--
-- Nada é apagado. Idempotente: correr duas vezes não faz nada na segunda.
-- Depende da 0043 (o acontecimento do registo não precisa dela; a correção do
-- pagamento também não).
--
--   psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f scripts/cleanup/vip-teste-2026-11-19.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create temp table vip_teste_casos on commit drop as
select c.id, t.reference
  from public.booking_cases c
  join public.trip_requests t on t.id = c.trip_request_id
 where t.reference in ('WF-2611-0094', 'WF-2611-0095');

-- 1 · o pagamento do 0094: a declaração que o E2 inventou.
with fixed as (
  update public.case_payments p
     set proof_status = 'nenhum',
         client_declared_paid_at = null,
         review_deadline_at = null
    from vip_teste_casos c
   where p.case_id = c.id
     and c.reference = 'WF-2611-0094'
     and p.proof_status = 'recebido'
     and coalesce(p.admin_confirmed, false) = false
     and p.status <> 'COMPLETED'
     and not exists (select 1 from public.case_payment_proofs f where f.payment_id = p.id)
  returning p.case_id
)
insert into public.case_events (case_id, kind, title, detail, actor_kind, payload)
select case_id,
       'payment_declaration_voided',
       'Declaração de pagamento anulada',
       'E2 · o pedido das instruções do Stripe foi registado como declaração de pagamento, sem ninguém ter pago. Corrigido na limpeza do teste de 19 de novembro.',
       'system',
       jsonb_build_object('ticket', 'E2')
  from fixed;

-- 2 · os dois casos, arquivados como teste.
with archived as (
  update public.booking_cases b
     set closed_at = now(),
         closed_by_email = 'limpeza do teste (script)',
         closed_reason = 'outro',
         closed_note = 'Teste do VIP de 19 de novembro'
    from vip_teste_casos c
   where b.id = c.id
     and b.closed_at is null
  returning b.id
)
insert into public.case_events (case_id, kind, title, detail, actor_email, actor_kind, payload)
select id,
       'case_archived',
       'Caso arquivado',
       'Outro motivo · Teste do VIP de 19 de novembro · limpeza do teste',
       'limpeza do teste (script)',
       'staff',
       jsonb_build_object('reason', 'outro')
  from archived;

-- 3 · o cliente TESTE VIP, desativado.
update public.vip_clients v
   set active = false,
       deactivated_at = now(),
       deactivated_by_email = 'limpeza do teste (script)'
  from public.partners p
 where p.id = v.partner_id
   and p.is_operator
   and v.name = 'TESTE VIP'
   and v.active;

-- O que ficou.
select t.reference, c.stage, c.closed_at is not null as arquivado, c.closed_note,
       p.proof_status, p.client_declared_paid_at
  from public.booking_cases c
  join public.trip_requests t on t.id = c.trip_request_id
  left join public.case_payments p on p.case_id = c.id
 where t.reference in ('WF-2611-0094', 'WF-2611-0095')
 order by t.reference;

select name, active, deactivated_at from public.vip_clients where name = 'TESTE VIP';

commit;
