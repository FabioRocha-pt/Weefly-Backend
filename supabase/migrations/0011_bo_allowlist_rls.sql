-- WeeFly · Price Checker — a porta do BO passa a abrir as tabelas do caso
--
-- O problema que isto resolve: há duas listas de acesso e só uma delas está
-- escrita nas políticas de RLS.
--
--   · `is_platform_staff()` — quem é da equipa da plataforma. É o predicado de
--     todas as políticas escritas em 0002, 0003 e 0005.
--   · `is_bo_allowed()` — quem foi convidado para o Price Checker (0009). É a
--     porta de /admin/price-checker, e é deliberadamente mais estreita.
--
-- Uma conta na `bo_allowlist` que não esteja também em `platform_staff` entra no
-- back-office e encontra duas coisas partidas, ambas em silêncio:
--
--   1. BO-03 · o tempo real. O Realtime entrega a cada subscritor apenas as
--      linhas que o RLS dele deixa ler. O websocket sobe, o canal responde
--      SUBSCRIBED, o componente acende "live" — e nunca chega evento nenhum. E
--      porque acendeu "live", a sondagem de recurso não arranca (ver o `grace`
--      em components/bo/live-updates.tsx): a fila fica parada a dizer que está
--      ligada. É o pior desfecho possível, porque não se parece com uma avaria.
--
--   2. O compositor de propostas. Ao contrário da fila e da ficha — que leem
--      pela service role — as ações de actions/proposals.ts escrevem com a
--      sessão do vendedor (`utils/supabase/server`), e por isso passam pelo
--      RLS. Sem estas políticas, compor e publicar uma proposta falha para
--      quem só está na allowlist.
--
-- O que este ficheiro faz: acrescenta políticas paralelas com o predicado
-- `is_bo_allowed()`. Não toca nas que existem — políticas permissivas para o
-- mesmo comando somam-se com OR, e por isso o alcance de `platform_staff` fica
-- exatamente como estava. Reverter isto é apagar as políticas `*_bo_*`.
--
-- Continua a não haver política nenhuma para `anon`: o cliente do Price Checker
-- não tem sessão e escreve tudo pela service role. A porta que se abre aqui é a
-- de contas autenticadas e convidadas, uma a uma, e fecha-se com um update
-- (`bo_allowlist.active = false`) que `is_bo_allowed()` já respeita.
--
-- Os comandos são enumerados um a um em vez de `for all`. É mais linhas, mas
-- diz o que realmente é preciso: o compositor nunca apaga uma proposta, e uma
-- política que permitisse apagá-la seria uma permissão dada por comodidade de
-- escrita da migração.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · Leituras
-- ═══════════════════════════════════════════════════════════════════════════
--
-- As sete primeiras são as tabelas da publicação `supabase_realtime` (0010,
-- parte 4) — são estas que decidem se o BO-03 funciona. As restantes são o que
-- o compositor lê com a sessão do vendedor: `getCase()` traz o caso com os
-- links, o pedido e o lead embutidos, e uma tabela sem política de leitura faz
-- o embed vir vazio em vez de dar erro — que é a forma mais difícil de
-- diagnosticar um problema de permissões.

drop policy if exists "booking_cases_bo_read" on public.booking_cases;
create policy "booking_cases_bo_read" on public.booking_cases
  for select to authenticated using (public.is_bo_allowed());

drop policy if exists "trip_requests_bo_read" on public.trip_requests;
create policy "trip_requests_bo_read" on public.trip_requests
  for select to authenticated using (public.is_bo_allowed());

drop policy if exists "case_payments_bo_read" on public.case_payments;
create policy "case_payments_bo_read" on public.case_payments
  for select to authenticated using (public.is_bo_allowed());

drop policy if exists "case_payment_proofs_bo_read" on public.case_payment_proofs;
create policy "case_payment_proofs_bo_read" on public.case_payment_proofs
  for select to authenticated using (public.is_bo_allowed());

drop policy if exists "case_passengers_bo_read" on public.case_passengers;
create policy "case_passengers_bo_read" on public.case_passengers
  for select to authenticated using (public.is_bo_allowed());

drop policy if exists "case_proposals_bo_read" on public.case_proposals;
create policy "case_proposals_bo_read" on public.case_proposals
  for select to authenticated using (public.is_bo_allowed());

drop policy if exists "case_events_bo_read" on public.case_events;
create policy "case_events_bo_read" on public.case_events
  for select to authenticated using (public.is_bo_allowed());

-- Fora da publicação, mas lidas pela sessão do vendedor.

drop policy if exists "case_links_bo_read" on public.case_links;
create policy "case_links_bo_read" on public.case_links
  for select to authenticated using (public.is_bo_allowed());

-- O nome, o email e o telefone do cliente: é o que a barra de topo do
-- compositor mostra, e sem isto o caso abre sem saber de quem é.
drop policy if exists "leads_bo_read" on public.leads;
create policy "leads_bo_read" on public.leads
  for select to authenticated using (public.is_bo_allowed());

drop policy if exists "case_offers_bo_read" on public.case_offers;
create policy "case_offers_bo_read" on public.case_offers
  for select to authenticated using (public.is_bo_allowed());

drop policy if exists "case_offer_segments_bo_read" on public.case_offer_segments;
create policy "case_offer_segments_bo_read" on public.case_offer_segments
  for select to authenticated using (public.is_bo_allowed());

-- Ver a própria lista: é o que diz ao vendedor com que conta está lá dentro. A
-- política de 0009 só deixa `platform_staff` lê-la, o que deixava um convidado
-- sem forma de se ver a si mesmo.
drop policy if exists "bo_allowlist_bo_read" on public.bo_allowlist;
create policy "bo_allowlist_bo_read" on public.bo_allowlist
  for select to authenticated using (public.is_bo_allowed());

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · Escritas do compositor de propostas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só estas. Tudo o que é dinheiro a mexer-se — confirmar um pagamento, expirar
-- um link, emitir, alterar datas — vive em actions/bo-price-checker.ts e passa
-- pela service role depois de `boIdentity()` verificar a allowlist. Essas
-- escritas não precisam de política e não a levam: uma permissão que ninguém
-- usa é uma permissão que ninguém revoga.

-- A proposta nasce (`ensureProposal`) e muda de estado (rascunho → publicada,
-- R1 → R2). Não se apaga: uma proposta apagada era uma revisão sem história.
drop policy if exists "case_proposals_bo_insert" on public.case_proposals;
create policy "case_proposals_bo_insert" on public.case_proposals
  for insert to authenticated with check (public.is_bo_allowed());

drop policy if exists "case_proposals_bo_update" on public.case_proposals;
create policy "case_proposals_bo_update" on public.case_proposals
  for update to authenticated
  using (public.is_bo_allowed()) with check (public.is_bo_allowed());

-- As ofertas e os seus trechos acrescentam-se, duplicam-se, reordenam-se e
-- removem-se enquanto a proposta é um rascunho — o delete aqui é o botão
-- "remover oferta" do compositor.
drop policy if exists "case_offers_bo_insert" on public.case_offers;
create policy "case_offers_bo_insert" on public.case_offers
  for insert to authenticated with check (public.is_bo_allowed());

drop policy if exists "case_offers_bo_update" on public.case_offers;
create policy "case_offers_bo_update" on public.case_offers
  for update to authenticated
  using (public.is_bo_allowed()) with check (public.is_bo_allowed());

drop policy if exists "case_offers_bo_delete" on public.case_offers;
create policy "case_offers_bo_delete" on public.case_offers
  for delete to authenticated using (public.is_bo_allowed());

drop policy if exists "case_offer_segments_bo_insert" on public.case_offer_segments;
create policy "case_offer_segments_bo_insert" on public.case_offer_segments
  for insert to authenticated with check (public.is_bo_allowed());

drop policy if exists "case_offer_segments_bo_update" on public.case_offer_segments;
create policy "case_offer_segments_bo_update" on public.case_offer_segments
  for update to authenticated
  using (public.is_bo_allowed()) with check (public.is_bo_allowed());

drop policy if exists "case_offer_segments_bo_delete" on public.case_offer_segments;
create policy "case_offer_segments_bo_delete" on public.case_offer_segments
  for delete to authenticated using (public.is_bo_allowed());

-- Publicar faz mais duas escritas, e as duas com a sessão do vendedor: a etapa
-- do caso passa a 'proposta_enviada' e o link 2 destranca-se. É o gesto que
-- entrega a proposta ao cliente — sem estas, publicar gravava a proposta e o
-- cliente continuava a ver "à espera da cotação".
drop policy if exists "booking_cases_bo_update" on public.booking_cases;
create policy "booking_cases_bo_update" on public.booking_cases
  for update to authenticated
  using (public.is_bo_allowed()) with check (public.is_bo_allowed());

drop policy if exists "case_links_bo_update" on public.case_links;
create policy "case_links_bo_update" on public.case_links
  for update to authenticated
  using (public.is_bo_allowed()) with check (public.is_bo_allowed());

-- ═══════════════════════════════════════════════════════════════════════════
-- Depois de aplicar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Quem está a ver o quê, por conta:
--
--   select a.email, a.active,
--          (s.user_id is not null) as e_platform_staff
--     from public.bo_allowlist a
--     left join auth.users u on lower(u.email) = lower(a.email)
--     left join public.platform_staff s on s.user_id = u.id;
--
-- A coluna `e_platform_staff` deixa de decidir o acesso ao Price Checker. Uma
-- conta com `active = false` continua sem entrar: `is_bo_allowed()` verifica-o,
-- e é o mesmo predicado nas duas portas — a da página e a das linhas.

notify pgrst, 'reload schema';
