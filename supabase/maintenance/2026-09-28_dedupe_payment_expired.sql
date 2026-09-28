-- ═══════════════════════════════════════════════════════════════════════════
-- MIG-04 / T-22 · limpar os `payment_expired` repetidos que já estão na base
-- ═══════════════════════════════════════════════════════════════════════════
--
-- NÃO é uma migração: apaga dados, e por isso corre-se à mão, depois de ver a
-- pré-visualização. O código já não cria repetições (chave `dedupe_key` da
-- 0019, e a passagem STARTED → EXPIRED do MIG-04); isto só limpa o passado —
-- o caso com 292 linhas, e os outros com ×22 na campainha.
--
-- O que fica: por caso, a linha `payment_expired` mais antiga **sem chave**,
-- e todas as que têm chave (essas são únicas por construção). As linhas sem
-- chave nasceram antes da 0019 e eram o cron a reescrever o mesmo facto.
--
-- 1 · Pré-visualizar (não apaga nada):
--
--   psql "$DATABASE_URL" -v apply=0 -f supabase/maintenance/2026-09-28_dedupe_payment_expired.sql
--
-- 2 · Apagar:
--
--   psql "$DATABASE_URL" -v apply=1 -f supabase/maintenance/2026-09-28_dedupe_payment_expired.sql
-- ═══════════════════════════════════════════════════════════════════════════

\if :{?apply}
\else
  \set apply 0
\endif

begin;

create temporary table _dupes on commit drop as
select e.id, e.case_id, e.created_at
  from public.case_events e
 where e.kind = 'payment_expired'
   and e.dedupe_key is null
   and exists (
     select 1
       from public.case_events o
      where o.case_id = e.case_id
        and o.kind = 'payment_expired'
        and (o.created_at, o.id) < (e.created_at, e.id)
   );

\echo '· casos afectados e linhas a apagar:'
select case_id, count(*) as a_apagar
  from _dupes
 group by case_id
 order by a_apagar desc;

select count(*) as total_a_apagar from _dupes;

-- As marcas de leitura da campainha (0016) apontam para estes eventos; saem
-- com eles para não ficarem órfãs.
\if :apply
  delete from public.bo_alert_reads where event_id in (select id from _dupes);
  delete from public.case_events where id in (select id from _dupes);
  \echo '· apagado.'
  commit;
\else
  \echo '· pré-visualização apenas — nada foi apagado. Correr com -v apply=1.'
  rollback;
\endif
