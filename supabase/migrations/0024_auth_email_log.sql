-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · PRO-08 · os emails de conta, com estado de entrega
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "O email de confirmação do registo não chega." Saía pelo mailer do próprio
-- Supabase, que não deixa rasto nenhum do nosso lado: não se sabia se tinha
-- saído, se tinha sido devolvido, nem para onde. E o remetente não era o dos
-- outros emails — foi um remetente com dois endereços que devolveu tudo em
-- setembro.
--
-- Com o hook "Send Email" do Supabase (Auth → Hooks), o GoTrue deixa de enviar
-- e chama `/api/auth/send-email`; essa rota envia pelo Resend, com o mesmo
-- remetente de tudo o resto, e escreve aqui. O webhook do Resend actualiza o
-- estado desta linha (entregue / devolvido), tal como já faz com os avisos dos
-- casos.
--
-- Só o servidor lê e escreve (service role). Sem políticas: com o RLS ligado,
-- ninguém pelo browser vê o que está aqui.
--
-- Idempotente. Independente da 0020/0022.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0024_auth_email_log.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.auth_email_log (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) on delete set null,
  email               text not null,
  -- signup · recovery · magiclink · invite · email_change · …
  action_type         text not null,
  status              text not null default 'queued'
                        check (status in ('queued', 'sent', 'delivered', 'bounced', 'failed')),
  provider_message_id text,
  last_error          text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  failed_at           timestamptz
);

create index if not exists auth_email_log_user_idx
  on public.auth_email_log (user_id, created_at desc);
create index if not exists auth_email_log_provider_idx
  on public.auth_email_log (provider_message_id)
  where provider_message_id is not null;

alter table public.auth_email_log enable row level security;

comment on table public.auth_email_log is
  'PRO-08 · cada email de conta (registo, recuperação…) enviado pelo hook Send Email, e o que lhe aconteceu.';

commit;

notify pgrst, 'reload schema';
