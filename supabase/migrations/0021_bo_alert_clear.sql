-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly Concierge · PRO-11 / PRO-12 · avisos lidos um a um, e limpos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A 0016 já guardava o lido por linha (pessoa × acontecimento). O defeito do
-- PRO-11 estava no código — abrir a campainha marcava tudo. O que falta na base
-- é o "Limpar" do PRO-12: tirar do painel os avisos **já lidos**, sem apagar a
-- marca de leitura (apagá-la faria o aviso voltar como novo).
--
-- Depende só da 0016. Não usa nada da 0020, que ainda não está aplicada.
-- Sem esta migração o código continua a funcionar; só o botão "Limpar" responde
-- que a migração falta.
--
-- Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0021_bo_alert_clear.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.bo_alert_reads
  add column if not exists cleared_at timestamptz;

comment on column public.bo_alert_reads.cleared_at is
  'PRO-12 · o aviso foi lido e depois limpo do painel por esta pessoa.';

commit;

notify pgrst, 'reload schema';
