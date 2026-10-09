-- P-01 · Seleção do que sai na limpeza (só leitura).
-- Corre: psql "$SUPABASE_DB_URL" -X -f scripts/cleanup/p01-selecao.sql
-- Os casos "em dúvida" ficam até o Ivandro confirmar.

create temp table p01_duvida(ref text primary key);
insert into p01_duvida values
  ('WF-2608-0011'),('WF-2608-0014'),('WF-2608-0051'),('WF-2609-0068'),
  ('WF-2609-0069'),('WF-2609-0070'),('WF-2609-0071'),('WF-2609-0072'),
  ('WF-2610-0074'),('WF-2610-0075');

create temp table p01_casos as
select c.id, c.trip_request_id, c.lead_id, t.reference
from booking_cases c left join trip_requests t on t.id = c.trip_request_id
where t.reference is null or t.reference not in (select ref from p01_duvida);

select 'booking_cases' tabela, count(*) from p01_casos
union all select 'case_events',            count(*) from case_events            where case_id in (select id from p01_casos)
union all select 'case_notifications',     count(*) from case_notifications     where case_id in (select id from p01_casos)
union all select 'case_proposals',         count(*) from case_proposals         where case_id in (select id from p01_casos)
union all select 'case_offers',            count(*) from case_offers o join case_proposals p on p.id=o.proposal_id where p.case_id in (select id from p01_casos)
union all select 'case_passengers',        count(*) from case_passengers        where case_id in (select id from p01_casos)
union all select 'case_payments',          count(*) from case_payments          where case_id in (select id from p01_casos)
union all select 'case_payment_proofs',    count(*) from case_payment_proofs    where case_id in (select id from p01_casos)
union all select 'case_segment_issuance',  count(*) from case_segment_issuance  where case_id in (select id from p01_casos)
union all select 'case_ticket_documents',  count(*) from case_ticket_documents  where case_id in (select id from p01_casos)
union all select 'case_links',             count(*) from case_links             where case_id in (select id from p01_casos)
union all select 'case_token_history',     count(*) from case_token_history     where case_id in (select id from p01_casos)
union all select 'case_external_payments', count(*) from case_external_payments where case_id in (select id from p01_casos)
union all select 'budget_movements',       count(*) from budget_movements       where case_id in (select id from p01_casos)
union all select 'admin_interventions',    count(*) from admin_interventions    where case_id in (select id from p01_casos)
union all select 'trip_requests',          count(*) from trip_requests          where id in (select trip_request_id from p01_casos)
union all select 'leads (sem outros casos)', count(*) from leads l where l.id in (select lead_id from p01_casos)
   and not exists (select 1 from booking_cases c where c.lead_id=l.id and c.id not in (select id from p01_casos))
union all select 'chat_conversations (desligadas)', count(*) from chat_conversations where case_id in (select id from p01_casos)
union all select 'bo_alert_reads', count(*) from bo_alert_reads;
