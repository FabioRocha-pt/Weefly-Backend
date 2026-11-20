# WeeFly · Fechar o VIP

| | |
|---|---|
| **Para** | Fábio |
| **De** | Ivandro |
| **Base** | O teste do VIP de 19 de novembro, casos `WF-2611-0094` e `WF-2611-0095` |
| **Erros a corrigir** | 8 · `E1` a `E8` |
| **A construir** | A app VIP · `APP-01` a `APP-05` · as imagens das cidades · `IMG-01` · a fila do backoffice · `FILA-01` e `FILA-02` · o endereço · `VIP-01` |
| **Por decidir** | 3 propostas, no fim. Não avançam |

---

## O que muda nesta fase

**O VIP passa a ser uma pequena aplicação**, com três separadores em baixo: **Fazer pedido**, **Minhas passagens** e **Meus dados**.

> **É o começo da aplicação móvel da WeeFly.** Constrói-o como a base de uma app que vai crescer, e não como uma página: a mesma estrutura vai receber, mais tarde, outros separadores e outros serviços.

**A regra mantém-se:** o que funciona não se altera. Os erros corrigem-se; o resto acrescenta-se.

---

## Ordem de trabalho

| # | O quê | Porquê primeiro |
|---|---|---|
| 1 | **`E2` · O pagamento declarado sem ninguém pagar** | **Afeta também os pedidos públicos**, não só o VIP |
| 2 | **`APP-01` a `APP-03` · A app e Minhas passagens** | Resolve o `E1`: hoje o cliente não vê as ofertas pelo seu link |
| 3 | `E3` a `E8` | Os restantes erros do teste |
| 4 | `APP-04` · Meus dados, editável | Preenche a passagem |
| 5 | `FILA-01` e `FILA-02` · A marca VIP e as cores do tempo de espera | A equipa vê o que é urgente |
| 6 | `IMG-01` · As imagens das cidades | |
| 7 | `VIP-01` · O endereço novo e os dados mascarados | |
| 8 | `APP-05` · Instalar no telemóvel | |
| 9 | Teste de fecho | |

---

# 1 · Os erros do teste

## `E2` · Pedir as instruções do Stripe dá o pagamento como declarado

**Prioridade máxima.** No caso `WF-2611-0094`, o cliente pediu as instruções de pagamento do Stripe e o caso passou a **comprovativo por validar**, sem ninguém ter pago nem enviado comprovativo. O backoffice registou uma declaração de pagamento sem ficheiro.

**Verificar primeiro:** se acontece também num pedido público com Stripe. É o mais provável.

**Critérios de aceitação**
- **Pedir as instruções** e **declarar que pagou** são duas ações separadas
- Depois de pedir as instruções, o caso fica **à espera de pagamento**, até o cliente declarar ou o agente confirmar
- Se o Stripe dispensa comprovativo, o cliente tem um botão próprio, **Já paguei**, e só esse muda o estado
- Nada muda de estado sem uma ação do cliente ou do agente que o diga

**Teste:** num pedido novo, público e VIP, pedir as instruções do Stripe e não fazer mais nada. **Passa se** o caso continua à espera de pagamento.

## `E1` · O link pessoal volta sempre ao formulário

Mesmo depois de as ofertas serem enviadas, o link do cliente abria um formulário novo. Para escolher a oferta foi preciso o link do email.

**Resolve-se com a app**, em `APP-03`. O link pessoal abre a app, e os pedidos e as ofertas estão em **Minhas passagens**.

## `E3` · O VIP passa pelo passo dos contactos

**Critérios de aceitação**
- No VIP, o pedido vai **do formulário da viagem diretamente para o resumo**
- Os contactos vêm do cliente, sem passo próprio

## `E4` · A bagagem muda, e aparece em inglês

O resumo dizia **1 mala**; o acompanhamento disse **No checked bag**, em inglês num fluxo em português.

**Critérios de aceitação**
- A bagagem escolhida é a que aparece no resumo, no acompanhamento, no backoffice e no bilhete
- **Todo o acompanhamento na língua do pedido.** Nenhum texto escrito no código
- Verificar também no fluxo público

## `E5` · A ficha do agente não atualiza sozinha

O pedido só apareceu na ficha do *TESTE VIP* depois de recarregar.

**Critérios de aceitação**
- Um pedido novo aparece na ficha do cliente VIP, na fila e no sino, **em menos de 5 segundos, sem recarregar**

## `E6` · O canal aparece como *Formulário online*

**Critérios de aceitação**
- Um pedido feito pelo link VIP aparece como **VIP** no Concierge, na fila e na ficha do caso
- Com o nome do cliente VIP, que abre a ficha dele

## `E7` · O telefone do VIP aceita texto livre

**Critérios de aceitação**
- Ao criar ou editar um cliente VIP, o telefone tem **a lista de países e indicativos**, a mesma do registo
- Guarda-se no formato internacional

## `E8` · O backoffice mostra horas diferentes para os mesmos acontecimentos

**Critérios de aceitação**
- **Todas as horas no mesmo fuso**, o da conta de quem está a ver
- O fuso aparece indicado onde houver dúvida, por exemplo no registo de atividade

---

# 2 · A app VIP

## `APP-01` · A estrutura

**Três separadores, com ícone e nome, fixos em baixo:**

| Separador | Ícone | O que tem |
|---|---|---|
| **Fazer pedido** | Avião | O formulário da viagem · `APP-02` |
| **Minhas passagens** | Bilhete | Pedidos, ofertas e bilhetes · `APP-03` |
| **Meus dados** | Pessoa | Os dados do cliente · `APP-04` |

```
┌─────────────────────────────────┐
│  [ logótipo da empresa ]        │
│                                 │
│   imagem da cidade              │
│   Olá, João                     │
│                                 │
│   … conteúdo do separador …     │
│                                 │
│   Powered by WeeFly *           │
├──────────┬──────────┬───────────┤
│    ✈     │    🎫     │     👤    │
│  Fazer   │  Minhas  │   Meus    │
│  pedido  │ passagens│   dados   │
└──────────┴──────────┴───────────┘
```
\* Só nos parceiros. Na WeeFly Global, a marca é a WeeFly.

**Critérios de aceitação**
- A barra fica **sempre visível em baixo**, e respeita a área segura do telemóvel
- O separador ativo distingue-se pela cor e pelo ícone preenchido
- **Ao abrir o link, a app abre em *Minhas passagens* se houver um pedido em curso**, e em *Fazer pedido* se não houver
- **A marca da empresa** que criou o VIP: o logótipo, as cores, e *Powered by WeeFly* nos parceiros
- **Na língua do cliente**, com escolha em *Meus dados*
- Funciona de 360 a 430 px de largura, sem deslizar para o lado
- **Estrutura preparada para mais separadores**, sem refazer a navegação

## `APP-02` · Fazer pedido

**Critérios de aceitação**
- **A saudação** com o primeiro nome: *Olá, João*
- **A imagem da cidade** de partida ao fundo; muda para a de destino quando esta é escolhida · `IMG-01`
- **O formulário da viagem** do price checker: tipo, passageiros, classe, bagagem, de, para, datas
- **Sem passo de contactos** · `E3`
- Depois, o **resumo** com os pedidos especiais e o consentimento
- Ao enviar, a app passa para **Minhas passagens**, com o pedido novo em cima

## `APP-03` · Minhas passagens

**Resolve o `E1`.** É aqui que o cliente segue tudo, sem precisar do email.

| Secção | O que mostra |
|---|---|
| **Em curso** | Os pedidos ainda sem bilhete, o mais recente em cima, com o estado de cada um |
| **Viagens marcadas** | Os bilhetes emitidos de viagens futuras, com o PDF para abrir |
| **Histórico** | As viagens passadas e os pedidos fechados |

**Critérios de aceitação**
- Cada pedido abre o seu acompanhamento **dentro da app**: as ofertas, a escolha, os passageiros, o pagamento e o bilhete
- **O cliente escolhe a oferta aqui**, sem o link do email
- O link do email continua a funcionar, e leva ao mesmo sítio
- Os bilhetes de viagens futuras são **o atalho para os bilhetes** que ficou decidido
- Um estado novo, como ofertas recebidas, aparece assinalado no separador

## `APP-04` · Meus dados

**Decidido pelo Ivandro:** o cliente altera os seus dados aqui, e **estes dados preenchem a passagem automaticamente**, a não ser que ele os mude nesse pedido.

| Grupo | Campos |
|---|---|
| **Contacto** | Telefone com indicativo · email |
| **Para a passagem** | Nomes e apelidos **como no passaporte** · data de nascimento · sexo · nacionalidade · número do passaporte · validade · país emissor |
| **Preferências** | Língua da app |

**Critérios de aceitação**
- O cliente vê e **edita** os seus dados
- Ao preencher os passageiros de um pedido, **o primeiro passageiro vem preenchido com estes dados**. O cliente pode mudá-los nesse pedido, sem alterar os de *Meus dados*
- Se mudar os dados no pedido, a app pergunta se quer guardar a alteração em *Meus dados*
- **No ecrã, aparecem mascarados**: `+238 ••• •• 47`, `jo•••@gmail.com`, passaporte `•••••• 123`. Ao editar, cada campo mostra-se completo
- Passaporte a menos de seis meses de expirar fica assinalado
- **A empresa que acompanha o cliente**, com o WhatsApp e o email de contacto
- Cada alteração fica registada, com a data, e aparece ao agente na ficha do cliente

> **Proposta de segurança, a confirmar:** mudar o **telefone** ou o **email** pede um **código de confirmação**, enviado para o contacto atual. Os dados da passagem editam-se sem código. Assim, quem receber o link por engano não consegue mudar os contactos de outra pessoa. Ver `D-D`.

> **Os dados de passaporte de clientes privados** guardam-se com o consentimento do próprio cliente, marcado ao guardá-los. As questões `L1` a `L3` eram sobre funcionários do Estado nos ministérios; aqui o titular é quem consente.

## `APP-05` · Instalar no telemóvel

**Critérios de aceitação**
- Instalável no ecrã inicial, em Android e iPhone, com o ícone e o nome da empresa
- Abre em ecrã inteiro, sem a barra do browser
- O convite para instalar aparece **uma vez**, depois do primeiro pedido, e não volta se for recusado
- **O link pessoal fica guardado na app instalada.** O cliente não precisa de o voltar a abrir pelo WhatsApp

---

# 3 · `IMG-01` · As imagens das cidades

**Entra nesta fase.**

**Critérios de aceitação**
- **Uma biblioteca de imagens por cidade**, gerida pelo master no Admin: carregar, substituir e desativar
- Cada imagem ligada a um **código de cidade ou de aeroporto**: `RAI`, `LIS`, `PAR`
- Um aeroporto usa a imagem da sua cidade: `CDG` e `ORY` usam a de Paris
- **Ao abrir**, a imagem da cidade de partida. Sem cidade escolhida, a da cidade da empresa: a Praia na WeeFly Global
- **Quando o destino é escolhido**, passa para a imagem do destino, com uma transição suave
- **Uma cidade sem imagem** mostra um fundo nas cores da marca, com o nome da cidade. Nunca um espaço vazio
- **O texto por cima fica sempre legível:** uma camada escura em degradé sob a saudação e os títulos
- Cada imagem com um texto alternativo, o nome da cidade

**O formato das imagens**

| | |
|---|---|
| Proporção | 4:3, horizontal, com a parte importante ao centro |
| Tamanho | 1600 × 1200 px no original |
| Formato servido | WebP, com menos de 200 KB, e versões menores para telemóveis |
| Carregamento | A imagem pequena primeiro; a grande depois, sem atrasar o formulário |

**As primeiras 33 cidades:** Cabo Verde, uma cidade em cada um dos países dos 20 parceiros, e as rotas da diáspora.

| Cabo Verde | Europa e Américas | África · os países dos parceiros |
|---|---|---|
| Praia · Sal · Mindelo · Boa Vista | Lisboa · Porto · Paris · Madrid · Londres · Roterdão · Amesterdão · Boston · Nova Iorque · Fortaleza | Luanda · Douala · Kinshasa · Accra · Conacri · Bissau · Abidjan · Nairobi · Bamako · Casablanca · Maputo · Lagos · São Tomé · Dakar · Freetown · Joanesburgo · Lomé · Tunes · Lusaka |

**As imagens são fornecidas pelo Ivandro.** O Fábio constrói a biblioteca e o comportamento; até as imagens chegarem, aparece o fundo da marca com o nome da cidade.

---

# 4 · A fila do backoffice

## `FILA-01` · A marca VIP

**Decidido pelo Ivandro.** Os pedidos VIP **não mudam de lugar na fila**: levam uma marca, para a equipa perceber logo que é um cliente VIP.

**Critérios de aceitação**
- Uma **etiqueta VIP** em cada pedido de um cliente VIP: na fila, no Concierge, no menu VIP e na ficha do caso
- A etiqueta tem o nome do cliente, e abre a ficha dele
- Os pedidos VIP podem ser **filtrados** na fila
- Aparece também ao master, em `/gestao/concierge`

## `FILA-02` · As cores do tempo de espera

**Decidido pelo Ivandro.** Cada entrada da fila tem uma **cor suave** pelo tempo de espera.

| Tempo de espera | Cor | Nome |
|---|---|---|
| **Até 1 hora** | Verde suave | Acabou de chegar |
| **De 1 a 10 horas** | Laranja suave | A aguardar |
| **De 10 horas a 3 dias** | Vermelho suave | Atrasado |
| **Mais de 3 dias** | Vermelho forte, com ícone | **Crítico** |

**Critérios de aceitação**
- A cor aparece na linha de cada entrada, em todas as filas: Público, VIP e Ministérios
- **A cor nunca aparece sozinha.** Ao lado, o tempo escrito, *há 45 min*, *há 2 dias*, para quem não distingue as cores e para a impressão
- As cores mudam sozinhas, sem recarregar a página
- Nos Ministérios, as cores **juntam-se** à ordem por urgência, sem a mudar
- Os críticos podem ser filtrados, e o master vê quantos há em cada empresa
- **As cores são suaves**, para a fila continuar legível. Só o crítico é forte

> **Proposta, a confirmar: quando o relógio conta.** Só enquanto **a próxima ação é da equipa**: um pedido novo, uma escolha feita, um comprovativo enviado. Quando se está **à espera do cliente**, por exemplo depois de enviar as ofertas, a entrada fica **cinzenta** e o relógio para. Senão a equipa persegue casos em que não tem nada a fazer. Ver `D-E`.

---

# 5 · `VIP-01` · O endereço novo

**Já estava no documento anterior.** Fica aqui para o VIP estar todo num sítio.

- `weefly.africa/pc/<nome>-<código>`. O código não muda quando o nome é editado
- Os links `/vip/<código>` já enviados redirecionam para o novo
- **Na WeeFly Global, depende do encaminhamento do `weefly.africa/pc`**, que está do lado de quem gere o servidor do site de reservas. Até lá, o link mantém-se em `pro.weefly.africa`

---

# 6 · Teste de fecho

**O Ivandro repete o teste do VIP**, com três diferenças em relação a 19 de novembro:

- **num telemóvel real**, com a pré-visualização do link no WhatsApp
- **com uma conta da Alô**, para o isolamento entre empresas (`VIP-02`)
- **até ao fim**: comprovativo, emissão e desativação

| # | Passa se |
|---|---|
| 1 | Pedir as instruções do Stripe não muda o estado, no público e no VIP |
| 2 | O link pessoal abre a app, e o pedido em curso está em *Minhas passagens* |
| 3 | O cliente escolhe a oferta dentro da app |
| 4 | Sem passo de contactos |
| 5 | A bagagem é a mesma do princípio ao fim, e tudo na língua do pedido |
| 6 | O pedido aparece no backoffice sem recarregar, marcado como VIP |
| 7 | O telefone do VIP escolhe-se com o indicativo |
| 8 | As horas são as mesmas em todo o lado |
| 9 | Os três separadores, a saudação e os dados mascarados |
| 10 | A imagem da partida, depois a do destino; sem imagem, o fundo da marca |
| 11 | A app instala-se no telemóvel e abre sem a barra do browser |
| 12 | Um VIP da Alô não aparece à WeeFly Global, e o contrário |
| 13 | Desativado, o link dá página não encontrada, e o histórico fica |
| 14 | Em *Meus dados*, o cliente edita os seus dados, e o primeiro passageiro do pedido seguinte vem preenchido com eles |
| 15 | Mudar os dados só num pedido não altera *Meus dados*, a não ser que o cliente escolha guardar |
| 16 | Os pedidos VIP têm a etiqueta VIP em todas as filas, e filtram-se |
| 17 | Um pedido novo está verde; com mais de 1 hora, laranja; mais de 10 horas, vermelho; mais de 3 dias, crítico. Sempre com o tempo escrito ao lado |

---

# 7 · Por decidir

## Decidido pelo Ivandro

| # | Decisão |
|---|---|
| **D-A** | **O cliente altera os seus dados** em *Meus dados*, e eles preenchem a passagem · `APP-04` |
| **D-B** | **Os pedidos VIP levam uma etiqueta**, sem mudar de lugar na fila · `FILA-01` |
| **Cores** | **Verde, laranja, vermelho e crítico** pelo tempo de espera · `FILA-02` |

## Propostas, a confirmar

**Não avançam sem resposta.**

| # | Pergunta | Proposta |
|---|---|---|
| **D-C** | **Níveis VIP** | Um só, por agora. Decide o Dominik |
| **D-D** | **Mudar o telefone ou o email pede um código?** | **Sim**, enviado para o contacto atual. Os dados da passagem editam-se sem código |
| **D-E** | **Quando conta o relógio das cores?** | **Só quando a próxima ação é da equipa.** À espera do cliente, a entrada fica cinzenta e o relógio para. O relógio conta as 24 horas do dia |

---

# 8 · Limpeza do teste de 19 de novembro

| | |
|---|---|
| ☐ | Desativar o *TESTE VIP*. A desativação não chegou a concluir |
| ☐ | Marcar `WF-2611-0094` e `WF-2611-0095` como teste. **O 0094 está como *comprovativo por validar* por causa do `E2`**, sem ninguém ter pago |

---

## Lista para ires marcando

| | |
|---|---|
| ☐ | `E2` · Instruções e declaração de pagamento separadas |
| ☐ | `APP-01` · A app com três separadores |
| ☐ | `APP-02` · Fazer pedido, com saudação e sem contactos |
| ☐ | `APP-03` · Minhas passagens, com as ofertas e os bilhetes |
| ☐ | `E3` a `E8` |
| ☐ | `APP-04` · Meus dados, editável, a preencher a passagem |
| ☐ | `FILA-01` · Etiqueta VIP |
| ☐ | `FILA-02` · Cores do tempo de espera |
| ☐ | `IMG-01` · A biblioteca de imagens e o fundo da marca |
| ☐ | `VIP-01` · O endereço novo |
| ☐ | `APP-05` · Instalar no telemóvel |
| ☐ | A limpeza do teste |
| ☐ | Avisar o Ivandro para o teste de fecho |
