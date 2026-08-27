-- WeeFly · Price Checker — o que o Development Backlog v3.0 pede à base de dados
--
-- Três coisas, cada uma de um item do Sprint 1:
--
--   1. VIP-10 · a bagagem entra no contrato de campos. O cliente diz no passo 1
--      quantas malas de porão leva, e esse número pré-preenche a proposta em vez
--      de ser adivinhado por quem cota.
--
--   2. FB-03 · a bagagem da oferta deixa de ser texto livre e passa a contagem.
--      "1 peça, 8 kg" escrito à mão é um campo onde cabe tudo: "1 mala", "uma",
--      "8kg", "sim". Nenhuma dessas formas se compara com outra, e comparar
--      opções é a única coisa que o ecrã do cliente faz.
--
--   3. FB-04 · a distinção entre um preço garantido e um preço indicativo passa
--      a ter coluna própria. Hoje o ecrã do cliente lê "Price guaranteed" a
--      partir de `valid_until`, que é uma data que o vendedor escreve à mão — a
--      aplicação promete uma tarifa retida sem que exista retenção nenhuma.
--
-- Nada aqui apaga nem reescreve o que já existe. As colunas de texto da bagagem
-- ficam de pé, sem ninguém a escrever nelas, até se decidir o que fazer ao peso
-- (ver a nota na PARTE 2).

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 · VIP-10 · a bagagem que o cliente pediu
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.trip_requests
  -- Malas de porão. O seletor do formulário oferece 0, 1 ou 2; a coluna aceita
  -- até 9 porque o limite é do produto e vive no código (`MAX_BAGGAGE`), como o
  -- `MAX_LEGS` — subi-lo não pode obrigar a uma migração.
  add column if not exists baggage_hold smallint not null default 0;

alter table public.trip_requests
  drop constraint if exists trip_requests_baggage_hold_check;
alter table public.trip_requests
  add constraint trip_requests_baggage_hold_check
  check (baggage_hold between 0 and 9);

-- Os pedidos anteriores a esta migração ficam a zero, que é o valor por
-- omissão do seletor. Zero aqui significa "não disse", e quem cota vê a mesma
-- coisa que via antes: nada pré-preenchido.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 · FB-03 · a bagagem da oferta, em contagem
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.case_offers
  add column if not exists baggage_cabin_count smallint,
  add column if not exists baggage_hold_count  smallint;

alter table public.case_offers
  drop constraint if exists case_offers_baggage_cabin_count_check;
alter table public.case_offers
  add constraint case_offers_baggage_cabin_count_check
  check (baggage_cabin_count is null or baggage_cabin_count between 0 and 9);

alter table public.case_offers
  drop constraint if exists case_offers_baggage_hold_count_check;
alter table public.case_offers
  add constraint case_offers_baggage_hold_count_check
  check (baggage_hold_count is null or baggage_hold_count between 0 and 9);

-- O que estava escrito passa a número quando o número está à frente, que é o
-- formato que os marcadores de posição sugeriam ("1 peça, 8 kg"). O que não
-- couber fica nulo em vez de virar um palpite: uma oferta sem contagem mostra o
-- campo por preencher, e quem cota corrige numa passagem. Inventar o número
-- seria pior — ninguém reveria um campo que já parece respondido.
update public.case_offers
   set baggage_cabin_count = least(
         (substring(baggage_cabin from '^\s*(\d+)'))::int, 9
       )
 where baggage_cabin_count is null
   and baggage_cabin ~ '^\s*\d+';

update public.case_offers
   set baggage_hold_count = least(
         (substring(baggage_hold from '^\s*(\d+)'))::int, 9
       )
 where baggage_hold_count is null
   and baggage_hold ~ '^\s*\d+';

-- NOTA sobre `baggage_cabin` e `baggage_hold`, as colunas de texto.
--
-- Ficam. A aplicação deixa de as escrever, mas o que lá está é a única cópia do
-- peso — "23 kg", "8 kg" — e a contagem não o guarda. O backlog pede contadores
-- e é isso que fica no ecrã; o peso é uma pergunta em aberto para o cliente
-- (23 kg e 32 kg são malas diferentes e preços diferentes). Enquanto a pergunta
-- não tiver resposta, apagar o texto seria apagar a resposta possível.
--
-- Quando a decisão vier: ou o peso volta como campo próprio e estas colunas
-- caem, ou caem à mesma. Numa migração que decida, não nesta.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 · FB-04 · garantido é garantido, e tem de vir de uma retenção
-- ═══════════════════════════════════════════════════════════════════════════

-- `valid_until` é a validade comercial da proposta: o prazo que a WeeFly dá ao
-- cliente para decidir. É escrita à mão e continua a ser útil — o que ela nunca
-- foi é prova de que a tarifa está retida na companhia.
--
-- Uma tarifa retida em Amadeus tem um `option time`: um instante, dado pela
-- companhia, até ao qual o lugar e o preço são dela para vender a este cliente.
-- É outra coisa, vem de outro sítio, e é a única que autoriza a palavra
-- "garantido" no ecrã do cliente.
alter table public.case_offers
  -- O instante que a companhia deu. Sem fuso não serve aqui: ao contrário de
  -- `valid_until`, este valor não é escrito por uma pessoa a pensar na hora de
  -- Cabo Verde — vem de um sistema, em UTC.
  add column if not exists fare_held_until timestamptz,
  -- De onde veio a retenção. `amadeus` quando foi o GDS a dá-la; `manual`
  -- quando o vendedor a confirmou com a companhia por fora e a regista. A
  -- distinção existe porque a segunda depende de alguém ter feito bem, e um dia
  -- alguém vai querer saber quantas eram de cada tipo.
  add column if not exists fare_held_source text,
  -- A referência da retenção: o record locator do Amadeus, ou o que a
  -- companhia deu ao telefone. Sem isto, uma retenção não se pode reclamar.
  add column if not exists fare_held_ref text;

alter table public.case_offers
  drop constraint if exists case_offers_fare_held_source_check;
alter table public.case_offers
  add constraint case_offers_fare_held_source_check
  check (fare_held_source is null or fare_held_source in ('amadeus', 'manual'));

-- Uma retenção sem instante não é uma retenção. E um instante sem origem é um
-- campo que alguém preencheu sem saber o que estava a afirmar.
alter table public.case_offers
  drop constraint if exists case_offers_fare_held_pair_check;
alter table public.case_offers
  add constraint case_offers_fare_held_pair_check
  check (
    (fare_held_until is null and fare_held_source is null)
    or (fare_held_until is not null and fare_held_source is not null)
  );

-- NENHUM BACKFILL, de propósito.
--
-- A tentação é escrever `fare_held_until = valid_until` para as ofertas que já
-- existem e manter o ecrã como estava. Seria transformar em dado o que hoje é
-- um erro de leitura: nenhuma dessas ofertas teve uma tarifa retida, e passá-las
-- todas a "garantido" carimbaria a afirmação errada de forma permanente.
--
-- Sem retenção, o ecrã do cliente passa a dizer "sujeito a reconfirmação" — que
-- é o que sempre foi verdade.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 · PC-B · a proposta reduzida e o construtor de bilhete
-- ═══════════════════════════════════════════════════════════════════════════

-- O compositor parte-se em dois: uma proposta com o que o cliente precisa para
-- decidir, e o construtor de bilhete completo, na emissão. Duas colunas nascem
-- dessa separação.

alter table public.case_offers
  /*
   * "Não reembolsável", como campo e não como frase.
   *
   * Era texto livre em `refund_policy`, e o ecrã do cliente decidia se a tarifa
   * era reembolsável correndo uma expressão regular sobre o que lá estava
   * escrito — em três línguas. Uma tarifa passava a reembolsável por causa de
   * uma palavra mal escrita.
   *
   * `refund_policy` fica, e continua a ser onde cabe a letra pequena. O que sai
   * de lá é a decisão.
   */
  add column if not exists non_refundable boolean not null default false,
  /*
   * PC-06a · as horas ainda não foram confirmadas por uma pessoa.
   *
   * Por omissão `true`: uma oferta escrita à mão tem as horas que quem a
   * escreveu lá pôs, e não há nada a confirmar. Quem a põe a `false` é o
   * pré-preenchimento automático (`lib/proposal-prefill.ts`), porque aí as
   * horas vieram de uma pesquisa e ninguém olhou para elas.
   *
   * Publicar com isto a `false` é o que o painel de publicação impede. Um
   * clique a reconhecer, não um formulário a repetir — poupar a escrita é o
   * ponto todo do pré-preenchimento, e obrigar a reescrevê-lo anulava-o.
   */
  add column if not exists times_confirmed boolean not null default true;

-- As ofertas que já existem ficam com `times_confirmed = true`: foram todas
-- compostas à mão, e marcá-las por confirmar seria inventar uma dúvida que
-- nunca existiu e travar a publicação de propostas em curso.

-- O `non_refundable` das ofertas que já existem vem de onde a aplicação o lia
-- até agora: a mesma expressão que `offer-view.tsx` corria sobre o texto de
-- `refund_policy`. Não é para ficar — é para que uma proposta já publicada
-- continue a dizer ao cliente exactamente o que lhe dizia ontem. Sem isto, uma
-- tarifa não reembolsável passava a não dizer nada no dia em que esta migração
-- corresse, e o cliente lia uma proposta diferente da que aceitou.
update public.case_offers
   set non_refundable = true
 where non_refundable = false
   and refund_policy ~* '(não|nao) reembols|non.?refund';

notify pgrst, 'reload schema';
