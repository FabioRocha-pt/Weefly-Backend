-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly Concierge · Sprint 3 — correcções do backlog v3.2
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O Sprint 3 corrige o que o teste de 3 de Setembro encontrou. Não traz features
-- novas, e por isso esta migração é curta: quase tudo o que falha falha em
-- código. O que precisa de colunas é o que precisa de ficar registado — quem
-- reclamou, quem fechou, quem autorizou uma data diferente.
--
-- Idempotente. Pode correr duas vezes.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0014_sprint3_corrections.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · C-24 · uma data diferente deixa de travar a venda
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O item mais grave da lista, e o backlog di-lo por escrito: "não se pode
-- oferecer uma opção mais barata ou melhor por causa de uma validação."
--
-- O que acontecia: `offerBlockers` recusava publicar qualquer oferta cuja ida
-- não partisse exactamente no dia pedido (`blockers.departureMismatch`). A
-- única saída era "Propor novas datas", que reescreve o pedido do cliente,
-- exige motivo, e manda uma proposta publicada de volta a rascunho com revisão
-- nova — a armadilha que o C-30 manda remover. O agente ficava com os campos
-- preenchidos e o sistema a recusar de qualquer maneira.
--
-- O que passa a acontecer: a alteração de data vive na **oferta**, não numa
-- reescrita do pedido. Uma data diferente continua a travar — mas travar deixa
-- de ser definitivo: um gesto explícito ("Confirmar alteração de data"), com
-- motivo, autor e hora, desbloqueia o passo e o caso segue.
--
-- O pedido original do cliente não é tocado por este caminho. É essa a razão de
-- as colunas estarem aqui e não em `trip_requests`: "as datas originalmente
-- pedidas continuam visíveis no histórico, inalteradas."

alter table public.case_offers
  add column if not exists date_change_confirmed boolean not null default false,
  add column if not exists date_change_reason text,
  add column if not exists date_change_confirmed_at timestamptz,
  add column if not exists date_change_confirmed_by uuid references auth.users (id),
  add column if not exists date_change_confirmed_by_email text;

comment on column public.case_offers.date_change_confirmed is
  'C-24 · alguém assumiu a data diferente da pedida. Sem isto a publicação trava.';
comment on column public.case_offers.date_change_reason is
  'C-24 · porque muda a data. Vai no aviso ao cliente e fica no registo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · C-01 · não se cota um caso sem dono
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `created_by` já dizia de quem é o caso. O que faltava era **quando** passou a
-- ter dono: sem isso não há como responder a "quanto tempo esteve à espera sem
-- ninguém", que é o critério do C-01 e a única medida honesta da fila.
--
-- Fica a nulo nos casos antigos de propósito. Inventar uma data de reclamação a
-- partir de `created_at` daria uma espera de zero a todos os casos que nunca
-- foram medidos, e um número errado é pior do que um campo vazio.

alter table public.booking_cases
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by_email text;

comment on column public.booking_cases.claimed_at is
  'C-01 · instante em que o caso passou a ter dono. Nulo = nunca foi reclamado.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 · C-04 · fechar o caso depois de emitir
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Depois do bilhete emitido não havia forma de concluir o caso. Ele ficava nas
-- filas de trabalho para sempre — e uma fila que não esvazia deixa de ser lida.
--
-- `closed_at` e não uma etapa nova em `booking_cases.stage`: 'emitido' é um
-- facto sobre o bilhete e 'fechado' é um facto sobre o trabalho. São
-- independentes, e um caso emitido pode legitimamente continuar aberto enquanto
-- alguém trata de um lugar ou de uma bagagem.
--
-- Reversível por um administrador, e a reversão fica registada: é o critério, e
-- é também a razão de `closed_at` poder voltar a nulo sem se perder o rasto — o
-- rasto está em `case_events`, não aqui.

alter table public.booking_cases
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users (id),
  add column if not exists closed_by_email text;

comment on column public.booking_cases.closed_at is
  'C-04 · caso concluído. Sai das filas de trabalho. Reversível por admin.';

-- Os casos fechados saem das filas, e é por `closed_at` que se filtram.
create index if not exists booking_cases_open_idx
  on public.booking_cases (updated_at desc)
  where closed_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 · C-05 · a última vez que o cliente abriu o link
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O critério é "a data de última abertura reflecte o acesso real do cliente", e
-- não havia nenhuma: `markLinkOpened` gravava `first_opened_at` e só quando
-- estava a nulo — de propósito, para medir a primeira abertura. A segunda
-- visita, e a décima, não deixavam rasto.
--
-- Duas colunas e não uma, porque respondem a perguntas diferentes: a primeira
-- abertura diz se o link chegou, a última diz se o cliente ainda está a olhar
-- para ele. É a segunda que decide se vale a pena telefonar.

alter table public.case_links
  add column if not exists last_opened_at timestamptz,
  add column if not exists open_count integer not null default 0;

comment on column public.case_links.last_opened_at is
  'C-05 · último acesso real do cliente a este link.';

-- Os links já abertos começam com o que se sabe deles, que é a primeira vez.
update public.case_links
   set last_opened_at = first_opened_at,
       open_count     = 1
 where first_opened_at is not null
   and last_opened_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 5 · C-02 · o nome do comprovativo como o cliente o escreveu
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Um comprovativo está registado como `FormulÃ¡rio do Pedido de
-- DeclaraÃ§Ã£o Imp.314 Ed.04 01-02-2025 (1) (1).pdf`. O nome original era
-- `Formulário do Pedido de Declaração ...`: os bytes UTF-8 do `filename` do
-- multipart foram lidos como Latin-1, um byte por carácter.
--
-- O código deixou de o fazer (ver `repairFileName` em lib/pc/payment.ts). Esta
-- parte trata das linhas que já estão gravadas assim.
--
-- `convert_from(convert_to(…,'LATIN1'),'UTF8')` é a inversa exacta do erro. O
-- `where` restringe às linhas com a assinatura do problema, e o bloco apanha a
-- excepção: um nome que legitimamente não seja convertível fica como está, em
-- vez de rebentar a migração inteira.

do $$
declare
  row_id uuid;
  fixed  text;
begin
  for row_id in
    select id from public.case_payment_proofs
     where file_name ~ '[\xc2\xc3][\x80-\xbf]'
  loop
    begin
      select convert_from(convert_to(file_name, 'LATIN1'), 'UTF8')
        into fixed
        from public.case_payment_proofs
       where id = row_id;

      update public.case_payment_proofs
         set file_name = fixed
       where id = row_id
         and fixed is not null
         and fixed <> file_name;
    exception when others then
      -- Não era mojibake. Fica como está.
      raise notice 'C-02: nome do comprovativo % não convertido (%)', row_id, sqlerrm;
    end;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 5 · C-21 / C-20 · o vendedor Dominik, e só o perfil Concierge
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O seletor de vendedor já lê de `bo_allowlist` e não de uma lista no código
-- (BO-14). O C-21 pede que hoje contenha uma entrada: Dominik. Acrescentar um
-- utilizador continua a ser um insert, sem deploy — que é o resto do critério.

insert into public.bo_allowlist (email, label, role, active)
values ('dominik@weefly.africa', 'Dominik', 'manager', true)
on conflict (email) do update
  set label  = excluded.label,
      active = true;

commit;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- Depois de aplicar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. C-03a e C-03b não se resolvem aqui. São ambiente:
--
--      CONCIERGE_FROM_EMAIL="WeeFly Concierge <concierge@weefly.africa>"
--        UM endereço. O valor em produção tinha dois separados por vírgula e
--        **todos** os avisos de 3 de Setembro voltaram `bounced` com
--        validation_error. A segunda caixa vai em CONCIERGE_TEAM_EMAIL, que já
--        alimenta o `reply-to`.
--
--      RESEND_WEBHOOK_SECRET=…       sem isto o estado pára em `sent`
--      WHATSAPP_PHONE_NUMBER_ID=…    C-03b
--      WHATSAPP_ACCESS_TOKEN=…       C-03b
--
--    `GET /api/concierge/diagnose` lista o que falta, com a causa escrita.
--
-- 2. SPF, DKIM e DMARC em weefly.africa — ver docs/email-dns-handoff.md.
