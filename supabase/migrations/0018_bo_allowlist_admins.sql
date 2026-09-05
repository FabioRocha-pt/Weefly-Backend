-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly Concierge · duas contas de administração para a allowlist
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Duas linhas, por duas razões diferentes.
--
-- `ivandrodebarros@gmail.com` é uma conta nova. O `auth.users` e o
-- `platform_staff` dela nascem em scripts/seed-bo-users.mjs, que é onde vive a
-- password; aqui fica só o convite. A ordem não importa — a allowlist guarda o
-- email e não o `user_id` precisamente para poder ser escrita antes de a conta
-- existir (ver o comentário da tabela na 0009).
--
-- `fapirocha@gmail.com` (sem ponto) é o oposto: existe desde 2026-07-15, já é
-- `platform_staff` e é a conta em uso diário — mas nunca esteve na allowlist, o
-- que lhe dava o ecrã "Sem acesso ao Price Checker" e se lia como credencial
-- recusada. É fácil de perceber porquê: `fapi.rocha@gmail.com`, com ponto, é
-- outra conta e essa estava na lista desde a 0009. Ficam as duas.
--
-- `role = 'admin'` nas duas: é o que distingue quem pode reabrir um caso
-- fechado (actions/bo-price-checker.ts) e revogar um link. O efeito lateral é
-- não aparecerem no seletor de vendedor, que filtra por `role = 'manager'`
-- (C-21, migração 0014) — um administrador entra em todo o lado mas não é
-- atribuível como vendedor. Se alguma delas tiver de receber casos, muda-se a
-- coluna, não esta migração.
--
-- Idempotente. Pode correr duas vezes.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0018_bo_allowlist_admins.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

insert into public.bo_allowlist (email, label, role, active) values
  ('ivandrodebarros@gmail.com', 'Ivandro de Barros', 'admin', true),
  ('fapirocha@gmail.com',       'Fábio Rocha',       'admin', true)
on conflict (email) do update
  set label  = excluded.label,
      role   = excluded.role,
      active = true;

commit;

notify pgrst, 'reload schema';
