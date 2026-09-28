-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly Concierge · PRO-10 · arquivar um caso que se resolveu fora
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Casos que se resolveram por telefone, ao balcão, ou em que o cliente desistiu
-- sem dizer. Até aqui só se fechava um caso depois de emitido (C-04); o resto
-- ficava nas filas para sempre.
--
-- Arquivar é fechar com motivo: usa o mesmo `closed_at` da 0014 — e por isso o
-- caso sai das filas e aparece no filtro de fechados do T-21 sem mais nada —
-- e acrescenta o porquê. Reabrir continua a ser de administrador, e fica no
-- registo (`case_events`).
--
-- Depende só da 0014. Não usa nada da 0020: pode ir para produção com o MVP 1.
-- Sem esta migração o código continua a funcionar; só o "Arquivar" responde
-- que a migração falta.
--
-- Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0023_pro10_archive.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.booking_cases
  add column if not exists closed_reason text,
  add column if not exists closed_note   text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'booking_cases_closed_reason_known'
  ) then
    alter table public.booking_cases
      add constraint booking_cases_closed_reason_known
      check (closed_reason is null or closed_reason in (
        'emitido',                  -- C-04: fechado depois de emitido
        'fechado_fora_plataforma',  -- PRO-10: o motivo que o critério nomeia
        'cliente_desistiu',
        'sem_resposta',
        'duplicado',
        'outro'
      ));
  end if;

  -- "Outro" sem explicação não é um motivo.
  if not exists (
    select 1 from pg_constraint where conname = 'booking_cases_closed_other_has_note'
  ) then
    alter table public.booking_cases
      add constraint booking_cases_closed_other_has_note
      check (closed_reason is distinct from 'outro'
             or length(trim(coalesce(closed_note, ''))) > 0);
  end if;
end $$;

comment on column public.booking_cases.closed_reason is
  'PRO-10 · porque é que o caso foi fechado/arquivado. Nulo nos fechados antes da 0023.';
comment on column public.booking_cases.closed_note is
  'PRO-10 · a explicação de quem arquivou.';

-- Os que já estão fechados foram-no pelo C-04, depois de emitidos.
update public.booking_cases
   set closed_reason = 'emitido'
 where closed_at is not null
   and closed_reason is null;

commit;

notify pgrst, 'reload schema';
