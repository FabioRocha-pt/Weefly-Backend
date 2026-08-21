-- WeeFly · Price Checker — o que o Change Request Log v2.2 pede à base de dados
--
-- Quatro coisas, cada uma vinda de um item do log:
--
--   1. FE-03 · o número de telefone em E.164 e o país de quem o deu. A lista de
--      indicativos passou de vinte para todos, e o indicativo sozinho já não
--      identifica o país: o +1 é de vinte países, e é o país que decide o
--      mercado, a moeda e os métodos de pagamento que o cliente vê.
--
--   2. FE-02 · o multi-city deixa de ser "2 ou 3 voos". A restrição abre até
--      seis para que o limite do produto (quatro, sugestão da Q3) possa subir
--      sem uma migração nova — o limite que manda está em `MAX_LEGS`, no código.
--
--   3. BO-04 · as datas de um pedido só mudam por uma ação explícita, com
--      motivo. O pedido original do cliente fica guardado intacto ao lado das
--      datas em vigor, e a ficha do caso mostra os dois. Sem estas colunas a
--      única forma de saber o que o cliente pediu era acreditar em quem mudou.
--
--   4. BO-03 · o back-office atualiza no acontecimento e não num temporizador.
--      Para o Realtime entregar as mudanças, as tabelas têm de estar na
--      publicação — sem isto o websocket sobe e nunca recebe nada, e o
--      back-office cai na sondagem de recurso sem ninguém entender porquê.
--
-- Nada aqui apaga nem reescreve o que já existe.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · FE-03 · o telefone em E.164 e o país de quem o deu
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.leads
  -- O formato que o WhatsApp e o gateway de SMS pedem: "+" e dígitos, sem
  -- espaços nem parênteses. `phone_prefix` e `phone` continuam a ser escritos,
  -- porque é assim que a pessoa reconhece o próprio número e é o que o
  -- back-office e os emails já leem.
  add column if not exists phone_e164    text,
  -- ISO-3166 alpha-2. Escolhido pelo cliente no formulário; para os pedidos
  -- anteriores a esta migração a aplicação faz o palpite pelo indicativo.
  add column if not exists phone_country char(2);

-- Procurar um cliente pelo número que ele nos deu no WhatsApp: é a pesquisa
-- que o bot vai fazer, e é a única forma sem ambiguidade de o encontrar.
create index if not exists leads_phone_e164_idx
  on public.leads (phone_e164)
  where phone_e164 is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · FE-02 · mais voos num multi-city
-- ═══════════════════════════════════════════════════════════════════════════

-- Escolher "Multi-city" e não ter onde acrescentar voos fazia da opção uma
-- opção que não se podia usar. O formulário passa a somar voos até ao limite do
-- produto; a base de dados dá folga até seis para que esse limite seja uma
-- decisão de negócio e não uma migração.
alter table public.trip_request_legs
  drop constraint if exists trip_request_legs_position_check;
alter table public.trip_request_legs
  add constraint trip_request_legs_position_check
  check (position between 1 and 6);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 · BO-04 · a rota é intocável, as datas mudam com motivo
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.trip_requests
  -- O que o cliente pediu, escrito uma vez na primeira alteração e nunca mais.
  -- A segunda mudança de datas não apaga o pedido original.
  add column if not exists original_depart_date   date,
  add column if not exists original_return_date   date,
  add column if not exists dates_changed_at       timestamptz,
  add column if not exists dates_changed_by       uuid references auth.users (id) on delete set null,
  -- O email fica desnormalizado, como em `case_events`: o histórico tem de
  -- continuar legível depois de a conta sair da equipa.
  add column if not exists dates_changed_by_email text,
  -- Obrigatório na aplicação (mínimo doze caracteres) e verificado aqui só
  -- quanto ao essencial: uma data alterada sem motivo é uma data alterada sem
  -- justificação, que é exatamente o que a BO-04 proíbe.
  add column if not exists dates_change_reason    text;

alter table public.trip_requests
  drop constraint if exists trip_requests_dates_change_reason_check;
alter table public.trip_requests
  add constraint trip_requests_dates_change_reason_check
  check (dates_changed_at is null or length(coalesce(dates_change_reason, '')) >= 12);

-- A origem e o destino não têm coluna nova porque não mudam nunca: não há na
-- aplicação nenhuma escrita que lhes toque depois do pedido entrar. É a regra
-- "uma rota diferente é um pedido diferente", e vive no código, onde se lê.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 · BO-03 · tempo real para o back-office
-- ═══════════════════════════════════════════════════════════════════════════

-- A publicação `supabase_realtime` é o que faz o Postgres emitir as mudanças
-- para o websocket. As tabelas abaixo são as que mudam algum ecrã do
-- back-office: um pedido novo, um pagamento, um comprovativo, um passaporte,
-- uma proposta, um acontecimento do caso.
--
-- O `do` existe porque `alter publication ... add table` não tem
-- `if not exists`: correr esta migração duas vezes não pode falhar.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'booking_cases',
    'trip_requests',
    'case_payments',
    'case_payment_proofs',
    'case_passengers',
    'case_proposals',
    'case_events'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- O Realtime entrega a cada subscritor apenas as linhas que o RLS dele deixa
-- ler. As políticas de staff já existem (migrações 0002 e 0009) e é isso que
-- faz esta publicação segura: um cliente com o token do link não tem sessão
-- autenticada e por isso não recebe nada por aqui.

notify pgrst, 'reload schema';
