# Triagem do backlog v3.0 contra o código

Cada ID do `WeeFly_Development_Backlog_v3.0.md` medido contra o que está no repositório
a 26 de agosto de 2026 (`main`, commit `178281c`).

O plano v3.0 foi escrito sobre o *Change Request Log v2.2* e sobre o pacote de handoff de
front-end. Não foi escrito sobre esta implementação — e no intervalo o v2.2 foi construído.
O resultado é que uma parte do que o plano pede como pendente já está de pé, e uma parte do
que pede como bug não existe na aplicação real, existe nos protótipos HTML.

## Veredicto

| | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 |
|---|---|---|---|---|
| Feito | 6 | 6 | 1 | 0 |
| Parcial | 5 | 1 | 6 | 0 |
| Em falta | 3 | 3 | 15 | 30 |
| Conflito | 1 | — | — | — |
| Confirmar | 1 | — | — | — |

Doze IDs estão **anotados no próprio código** (`BO-01` a `BO-07`, `FE-01` a `FE-04`, `NEW-01`),
com o comentário a explicar a decisão tomada. Foram entregues no v2.2 e o v3.0 volta a
listá-los.

Do marco do dia 2 — os sete itens que o PDF vende como o ciclo comercial mínimo — **três
estão fechados, dois estão a meio, um é um conflito de decisão e um é trabalho real**.
O dia 2 não é o risco deste plano. O Sprint 3 é.

O peso real das quatro semanas está invertido em relação ao plano: os Sprints 1 e 2 estão
em grande parte entregues, e os Sprints 3 e 4 somam 45 IDs em falta, quase todos por
construir do zero.

### Nota de contagem
O sumário diz 68 requisitos; contando os sub-IDs (`PC-06a`, `PC-06b`, `VIP-21a`) o corpo do
documento lista 78. Quem acompanhar progresso deve fixar um dos dois números.

---

## Sprint 1 · Responder mais rápido e receber

Os sete itens do marco do dia 2 estão marcados **VMP**.

| ID | Estado | Evidência | Nota |
|---|---|---|---|
| `FE-04` **VMP** | **Feito** | `src/components/pc/request-wizard.tsx:247` | Ver abaixo — o bug é no protótipo, não na app |
| `BO-07` **VMP** | **Feito** | `src/lib/proposal-math.ts:377-486`, `src/actions/proposals.ts:511` | Os três níveis, `+1` aceite, 45 min avisa sem bloquear, publicação travada no servidor |
| `BO-02` **VMP** | **Feito** | `src/actions/pc.ts:450` | O link nasce só ali, com as duas condições verificadas no servidor |
| `PC-10` **VMP** | **Conflito** | `src/lib/pc/catalog.ts:149-229` | Ver «Conflitos» — não é um ajuste, é outro modelo |
| `PC-B` **VMP** | **Em falta** | `src/components/admin/offer-composer.tsx` (2058 linhas) | Trabalho real e o maior do sprint |
| `FB-01` **VMP** | **Parcial** | `src/components/admin/offer-composer.tsx:312` | O pedido é uma *coluna ao lado*, não valores dentro dos campos |
| `FB-04` **VMP** | **Parcial** | `src/lib/proposal-math.ts:310`, `offer-view.tsx:180` | Ver «Conflitos» — o `guaranteed` tem a fonte errada |
| `BO-04` | **Feito** | `src/components/bo/dates-panel.tsx:12,104-112` | Rota `readOnly`, «Propor novas datas» com motivo obrigatório |
| `BO-01` | **Feito** | `src/components/bo/user-menu.tsx` | Falta só trocar os três lugares reservados por **Settings** |
| `BO-06` | **Feito** | `src/i18n/dictionaries/pt.json:539`, `offer-composer.tsx:973` | |
| `PC-06a` | **Parcial** | `offer-composer.tsx` | Horas existem; a marca **a confirmar** é nova |
| `PC-06b` | **Parcial** | `src/lib/proposal-math.ts` | Total e `fare + taxes` existem; entram no formulário reduzido do `PC-B` |
| `FB-05` | **Parcial** | `src/components/bo/case-view.tsx:155`, `note-form.tsx:40` | `wa.me` em dois sítios, não em todos os ecrãs do caso |
| `FB-03` | **Em falta** | `offer-composer.tsx:94-95` | `baggage_cabin` e `baggage_hold` são texto livre |
| `VIP-10` | **Em falta** | — | Não há bagagem no formulário do cliente |
| `FB-02` | **Confirmar** | — | Renomear para *ticket issuance*; verificar os dicionários |

### `FE-04` · o bug não está na aplicação

As pistas do backlog — *«a JavaScript error earlier in the file»*, *«listeners bound before
the elements exist»*, *«changed class names breaking the script's selectors»* — descrevem JS
vanilla. Isso é `PC_P1_P2_P3_EN.html`, na raiz: 52 `addEventListener`/`querySelector`, zero
React.

A aplicação real é `request-wizard.tsx`, e tem os critérios de aceitação todos:

- os três selectores abrem, aplicam e fecham (`:497`, `:524`, `:613`);
- um painel de cada vez, por construção — é um único `openPop`, não três booleanos;
- clique fora e `Escape` fecham (`:263-269`);
- `Cancel` restaura o que estava (`paxSnapshot.current`, `:531`, `:592-601`);
- colos nunca passam os adultos, com o limite **e** o corte ao descer adultos (`:562`, `:586`).

O comentário em `:247` descreve a regressão no passado: *«era esta a regressão FE-04»*.

Isto não fecha o item, redirige-o: alguém viu selectores quebrados em algum sítio. Ou é o
protótipo — e então é do handoff de design, não do backend — ou é a app e a causa é outra
(build, CSS a tapar o painel, uma versão em produção mais antiga que `main`). **Confirmar em
que URL foi visto antes de abrir a branch.**

### `PC-B` · o item que justifica o sprint

O compositor tem 2058 linhas e é o último resto da geração antiga: `src/components/admin/`
tem um só consumidor vivo, `(bo)/admin/price-checker/[id]/ofertas/page.tsx`, e o que ele
importa é o `OfferComposer`. Todo o resto do back-office já é `src/components/bo/`.

Separá-lo em proposta reduzida + construtor de bilhete no momento da emissão é o que o
`PC-B` pede, e `src/components/bo/issuance-panel.tsx` já existe para receber a segunda
metade. Feito assim, o item fecha e a geração antiga é retirada no mesmo movimento.

Há aqui um risco a ter presente: o `BO-05` e o `BO-07` vivem *dentro* do compositor
(autosave com o limite dos dez minutos, validação de datas em escrita). Partir o ficheiro é
partir a casa deles. Não é um copiar-colar.

### Dependências mortas a remover

`src/components/admin/pay-link-form.tsx` está definido e **nunca é montado** — pede um valor
à mão, sem verificar passageiros, que é exactamente o que o `BO-02` manda tirar. A server
action que ele chama, `createPayLink` (`src/actions/booking-cases.ts:136`), continua
exposta. O ecrã já não existe; a porta continua aberta. Fechar as duas coisas faz parte do
`BO-02`.

---

## Sprint 2 · Parar erros e perdas

| ID | Estado | Evidência | Nota |
|---|---|---|---|
| `BO-03` | **Feito** | `src/components/bo/live-updates.tsx:131-162` | Supabase Realtime com polling só como recurso, como pedido |
| `BO-05` | **Feito** | `offer-composer.tsx:123,372,568` | Toast limitado a 10 min, rascunho local se a gravação falhar |
| `FE-01` | **Feito** | `src/data/airports.json` (568 KB), `src/lib/airports.ts:50-57` | `fold()` com NFD resolve o acento; `/api/airports` serve cliente e BO |
| `FE-02` | **Feito** | `catalog.ts:45`, migração `0010` parte 2 | `MAX_LEGS = 4`, base com folga até 6 |
| `FE-03` | **Feito** | migração `0010` parte 1 | E.164 mais o país de quem o deu |
| `FB-06` | **Feito** | `src/lib/countries.ts` | Mesmo catálogo nos dois lados |
| `PC-13` | **Parcial** | `src/lib/pc/bo-queue.ts:40-54` | `expirado` e `cancelado` existem; falta a linha de filtros, `archived` e as acções de fecho |
| `PC-12` | **Em falta** | `catalog.ts:106-117` | 10 companhias contra as 31 pedidas, e **não há `public/`** |
| `PC-16` | **Em falta** | — | Zero ocorrências de arquivo no código |
| `PC-17` | **Em falta** | `bo-queue.ts:127` | A coluna `pnr` existe; a extracção não. `src/lib/amadeus.ts` existe — confirmar se consulta por PNR |

O Sprint 2 está entregue em seis dos dez itens. O que sobra são três funcionalidades novas
(logos, arquivo, extracção) mais o acabamento do `PC-13`.

---

## Sprint 3 · Tornar o back-office navegável

É aqui que está o trabalho.

| ID | Estado | Evidência | Nota |
|---|---|---|---|
| `LIVE-01` | **Feito** | `layout.tsx:99` | `BoLiveUpdates` montado em todo o espaço |
| `NAV-03` | **Parcial** | `bo/user-menu.tsx` | Menu de utilizador feito; notificações em falta |
| `PC-04` | **Parcial** | `src/i18n/` | en/pt/**fr** — ver nota |
| `PC-02` | **Parcial** | `src/components/concierge/case-stepper.tsx` | Existe um stepper; não é o fluxo completo com o que falta |
| `PC-03` | **Parcial** | `bo-queue.ts:362,390-395` | `ownerId` é o `created_by`: quem criou, não quem reivindicou. Falta a rota **My space** |
| `NEW-01` | **Parcial** | migração `0007`, `src/lib/conversations.ts` | Agente↔cliente existe. `dates-panel.tsx:15` diz em texto que o `NEW-01` «ainda não existe» |
| `PC-05` | **Em falta** | — | Agente↔agente ligado ao caso, sobre a mesma infraestrutura |
| `NAV-01` `NAV-02` `NAV-05` | **Em falta** | `layout.tsx` | Só existe *Price Checker*; sem Dashboard, My space, Employees |
| `NAV-04` | **Em falta** | migração `0011` | Contas individuais e RLS existem; sessões abertas visíveis ao admin não |
| `LIVE-02` `LIVE-03` | **Em falta** | — | |
| `HDR-01` a `HDR-04` | **Em falta** | — | Zero breadcrumbs no projeto |
| `DASH-01` a `DASH-03` | **Em falta** | — | Ver nota |
| `PC-14` `PC-15` | **Em falta** | `src/app/layout.tsx:12` | Só metadata na raiz; nada por URL em `/pc/[token]` |

**`DASH`:** existe um grupo `(dashboard)` com `empresa/` e `agente/`, mas é outro produto —
o painel das empresas e dos agentes, não o dashboard do Concierge. Não serve de base.

**`PC-04`:** há três dicionários mantidos, `en.json`, `pt.json` e `fr.json` (62 KB). O
requisito diz inglês e português. Ou o francês entra no contrato e é mantido, ou sai — o que
não convém é ficar meio traduzido sem ninguém decidir.

---

## Sprint 4 · Cliente premium e link privado

**Trinta IDs, nenhuma linha.** Busca por `vip`, `tier`, `gold`, `diamond`, `platinum`,
`private link` em `src/` e `supabase/`: zero ocorrências.

Não há aqui nada para triar — é greenfield, e é a estimativa que merece mais desconfiança.
Três notas que a triagem levanta:

- **`LNK-08` está certo e é urgente.** `weefly.duckdns.org/p/Jonathan/gold` é adivinhável e
  mostra o nome e o nível na barra de endereço. Token opaco, 128 bits.
- **`VIP-06`** depende de 20 a 30 imagens licenciadas, que o PDF já lista como pressuposto.
- **`VIP-01`**, a remoção do passo de contacto, é o item barato que dá a sensação premium
  toda. Se o sprint derrapar, é o que se salva primeiro.

---

## Conflitos e decisões

Três coisas que não são trabalho, são decisões. Nenhuma deve ser resolvida na branch.

### 1 · `PC-10` reverte uma decisão do v2.2 e é maior do que parece

O critério diz *«All five appear for every customer, regardless of country»*, com cinco
nomes: `Vinti4/SISP` · `Stripe` · `Revolut` · `Instapay` · `PayPal`.

O que está construído (`catalog.ts:149-229`) é outro modelo: **seis famílias** de método —
`transfer`, `link`, `card`, `momo`, `local`, `cash` — com os provedores dentro de cada uma e
a ordem a mudar por país. A migração `0010` justifica-o em texto: *«é o país que decide o
mercado, a moeda e os métodos de pagamento que o cliente vê»*.

Não são as mesmas cinco coisas noutra ordem. São taxonomias diferentes:

- `Instapay` não existe em nenhum sítio do código;
- `Stripe` e `Vinti4/SISP` existem como provedores dentro de `card` e `local`, não como vias
  próprias;
- **`transfer` e `cash` não estão nos cinco.** Tirá-los remove as duas formas como o
  comentário do código diz que os clientes em Cabo Verde pagam de facto — *«em casa as
  pessoas pagam-nos por transferência local ou ao balcão»* — e deixa órfão todo o fluxo de
  comprovativo: `PROOF_REVIEW_HOURS = 48`, os limites do ficheiro, o bucket da migração
  `0009`, o painel de validação no back-office.

Marcado no plano como **Medium**. Como está escrito, é remodelar a escolha de pagamento e
abater um fluxo em produção. A pergunta para o cliente é uma: **os cinco nomes são as vias
que o cliente escolhe, ou são os provedores a garantir dentro das famílias que já existem?**
A segunda leitura é dias; a primeira é o sprint.

### 2 · `FB-04` · o `guaranteed` está ligado à fonte errada

A distinção que o backlog fecha a dizer que não se pode perder já está no ecrã
(`offer-view.tsx:202`, `picked-option.tsx:100`) — mas assim:

```ts
const guaranteed = Boolean(offer.valid_until)   // offer-view.tsx:180
```

`valid_until` é uma data que o vendedor escreve à mão. Ou seja: **hoje a aplicação promete
«Price guaranteed» com base num campo escrito, sem qualquer tarifa retida em Amadeus.** É
exactamente a falha que o backlog manda evitar — *«Never show a countdown next to a price
that is not held»* — e está do lado do cliente, não do interno.

O resto do `FB-04` é menor: `published_at` já existe (migração `0005:33`) e a contagem passa
a derivar dele em vez do `valid_until` por oferta. Isto, sim, é o `Low` que o plano diz.

Dos itens todos desta triagem é o que tem a pior relação entre esforço e risco: é pequeno e
é uma promessa comercial a ser feita sem cobertura.

### 3 · Não existe `public/`

Não há diretório de estáticos no projeto. Quatro itens em três sprints assumem que há:

| Item | Precisa |
|---|---|
| `PC-12` | logos por código IATA, **acrescentáveis sem deploy** |
| `PC-14` `PC-15` | imagem Open Graph 1200 × 630 |
| `VIP-06` | 20 a 30 imagens de cidades |
| `LNK-05` `LNK-06` | imagem do link, escolhida pelo agente |

«Sem deploy» e «escolhida pelo agente» querem dizer Supabase Storage, não `public/`. É uma
decisão de infraestrutura que aparece no Sprint 2 e que o Sprint 4 volta a precisar — vale a
pena tomá-la uma vez, no `PC-12`, em vez de duas.

---

## Sprint 1 revisto

Se a triagem estiver certa, o sprint fica assim:

**Fechado, a verificar e assinar** (meia dia, não uma semana)
`FE-04` · `BO-07` · `BO-02` · `BO-04` · `BO-06` · `BO-01`

**Bloqueado por decisão** — não abrir branch antes da resposta
`PC-10`

**O trabalho real da semana**
1. `PC-B` — partir o compositor, retirando a geração `admin/` (o item grande)
2. `FB-04` — ligar o `guaranteed` a uma retenção real; derivar a contagem de `published_at`
3. `FB-01` — pré-preencher os campos, não só mostrar o pedido ao lado
4. `FB-03` + `VIP-10` — contadores de bagagem nos dois lados
5. `BO-02` — apagar `pay-link-form.tsx` e a action `createPayLink`
6. `FB-05` · `FB-02` · `PC-06a` — acabamento

A semana que sobra do Sprint 1 e a maior parte do Sprint 2 podem puxar o Sprint 3, que é
onde os 15 itens em falta estão.

## Perguntas ao cliente, por ordem de urgência

Antes das oito do plano, três que a triagem levanta e que valem mais:

1. **`PC-10`** — os cinco nomes são vias de pagamento ou provedores? Sai a transferência
   bancária e o pagamento ao balcão em Cabo Verde?
2. **`FE-04`** — em que URL foram vistos os selectores quebrados? Se foi o protótipo HTML, o
   item não é do backend.
3. **`FB-04`** — há tarifas realmente retidas em Amadeus com *option time*, ou o
   «guaranteed» é sempre uma retenção comercial da WeeFly? A resposta muda o que o cliente
   pode ler no ecrã.

Das oito do plano, a `Q1` (chat substitui ou acompanha o WhatsApp) é a que bloqueia mais
código: define o `NEW-01`, o `PC-05` e o que o `FB-05` passa a significar.
