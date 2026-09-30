# WeeFly · MVP 2 · A plataforma de parceiros, começando pela Alô

| | |
|---|---|
| **Para** | Fábio |
| **De** | Admilson |
| **Data** | 30 de setembro de 2026 |
| **Início** | Semana de 5 de outubro, depois de o MVP 1 estar estável |
| **Base** | `WeeFly_MVP2_Specification_v5.2.md` · `WeeFly_Platform_MVP1_MVP2_v6.1.pdf` · `WeeFly_Correcoes_e_Funcionalidades_28Set.md` |
| **Âmbito** | 5 blocos · 35 itens · inclui o RBAC mínimo (`ADM-02`) e o espaço B2G no Admin (`ADM-08`) |
| **Stack** | Next.js 14 · Supabase · Resend · PM2 · NGINX no EC2 |

---

## Como usar este documento

**A ordem é a ordem de trabalho.** A secção *Sequência* diz o que vem primeiro, e porquê. Não se salta um passo: cada um apoia-se no anterior.

**Os critérios de aceitação são a definição de feito.** Um item só fecha quando todos passam. No fim de cada bloco há um **teste de bloco**, e o bloco só está fechado quando esse teste passa.

**Os itens marcados ⚠ dependem de uma decisão ou de dados que ainda não tens.** Estão listados em *O que falta decidir* e *Dados a receber*. Constrói à volta deles, sem inventar valores.

Usa o ID nos commits e nos branches: `feat/TEN-03-isolamento-rls`, `feat/PAR-03-bolsa-ministerio`.

---

## O MVP 2 numa frase

**A WeeFly continua a vender passagens e passa a ter um segundo negócio na mesma plataforma: parceiros que vendem aos seus próprios mercados, com a sua própria marca.**

Não se substitui nada. O concierge da WeeFly continua a funcionar exatamente como está. A Alô é o primeiro parceiro: vende ao Estado (B2G), com a marca dela.

### Três camadas

| Camada | Quem usa | O que faz |
|---|---|---|
| **Admin WeeFly** | Dominik · Admilson | Cria e controla parceiros e utilizadores, vê todos os dados B2G, acompanha a receita |
| **Backoffice do parceiro** | Equipa da Alô | Gere ministérios, cota, emite passagens. **Deve ser autónomo** |
| **Aplicação do ministério** | A secretária do ministério | Pede viagens, escolhe ofertas, dá os dados dos passageiros, vê as passagens |

### Onde passa o dinheiro

**Fora da plataforma.** O ministério paga diretamente à Alô. A WeeFly não toca nesse pagamento. A plataforma **regista-o**, **liberta a emissão** e **desconta-o da bolsa do ministério**.

---

## O que tem de estar feito antes

O MVP 2 corre no mesmo motor que o MVP 1. Estes itens da semana de 28 de setembro são a base e **não podem ficar abertos**:

| ID | Porque é que a Alô precisa |
|---|---|
| `T-04` · voo de volta na emissão | As viagens dos ministérios são ida e volta. Sem isto, nenhuma passagem de ministério se emite |
| `T-02` · trocar de oferta | O mesmo ecrã, o mesmo fluxo do cliente |
| `T-22` · eventos repetidos | Uma secretária de ministério a receber 22 mensagens iguais é pior do que um cliente particular |
| `T-03` · backoffice ao vivo | A equipa da Alô tem o mesmo problema |
| `T-11` · prazo de pagamento automático | O prazo é o que garante a tarifa contra a bolsa do ministério |
| `T-01` · cotar sem reclamar | A Alô vai ter vários agentes |
| `PRO-06` · empresa e isolamento | O modelo de empresas já existe. O isolamento entre empresas passa a ser o `TEN-03` |
| `PRO-04` · `PRO-05` · `PRO-09` | Menus por conta, Cliente e Carteira, validação de contas. É o que a Alô usa para entrar |

---

## Domínios · decisão de 30 de setembro

**`weefly.duckdns.org` é desligado.** Deixa de funcionar e **não se redireciona**. Isto substitui o `MIG-01`.

> Consequência assumida: os links antigos já enviados aos clientes deixam de abrir. Hoje, 30 de setembro, o endereço antigo ainda responde e mostra o login do WeeFly Pro. **Tem de deixar de responder.**

A partir de agora só existe a família `weefly.africa`:

| Endereço | O que serve |
|---|---|
| `weefly.africa` | O site público com a pesquisa Amadeus |
| `concierge.weefly.africa` | O WeeFly Pro e o concierge da WeeFly |
| `alo.weefly.africa` | A Alô, com os ministérios em `/m/<ministério>/` — ver `TEN-04` |

### `MIG-02` · Nenhum domínio escrito no código
**Complexidade** Baixa · **Faz-se primeiro**

**Critérios de aceitação**
- Todos os links gerados leem o endereço base da configuração
- Os links de um parceiro saem do subdomínio do parceiro, conforme o `TEN-04`
- Mudar de domínio no futuro não exige alterar código
- **Nenhum link gerado aponta para `weefly.duckdns.org`**, nem em emails, nem em WhatsApp, nem em PDFs

---

## O modelo de contas · ler antes do Bloco A

É a base de tudo. Já foi pedido na semana de 28 de setembro. Confirma que o que existe segue isto.

**Uma conta, dois menus.**

| Menu | O que é | Por defeito |
|---|---|---|
| **Menu 1 · Fornecer produtos** | A conta é fornecedora: insere produtos e garante disponibilidade | Disponível depois da aprovação do Admin |
| **Menu 2 · Vender produtos** | A conta é vendedora | **Fechado** até o Admin o abrir |

Uma empresa pode começar como fornecedora e, mais tarde, também vender. **Uma só conta, o histórico nunca se divide.** Não modelar fornecedor e vendedor como tipos de conta separados.

**Duas formas de vender.**

| Modo | Marca | Exemplo |
|---|---|---|
| **Revendedor oficial WeeFly** | WeeFly | Quem vende passagens B2C pelo sistema WeeFly |
| **White label** | A do vendedor | Alô |

**Os dois têm de estar distintos nos dados desde o primeiro dia.** Mudam o logótipo, o remetente dos emails, o domínio e, quase de certeza, a comissão.

Um vendedor white label escolhe o que o link mostra: **o seu próprio ecrã**, com um discreto *Powered by WeeFly* no rodapé, ou **o ecrã WeeFly**, sem alterações.

**B2B é uma licença, não um canal.** B2C e B2G dizem a quem se vende e configuram-se por conta no Admin. B2B é a licença que a WeeFly dá a um parceiro para vender com a marca dele, só por acordo fora da plataforma. **Não modelar B2B como um canal ao lado de B2C e B2G.**

**O Concierge é um produto que a WeeFly fornece.** Disponibilidade: *vendedores autorizados*. Hoje: WeeFly (B2C e B2G) e Alô (B2G). **Não há inventário nem calendário a bloquear** — não pôr voos no calendário partilhado.

**Âmbito: só voos.** Carros, casas, experiências e comida ficam na lista, bloqueados, e não se constroem nesta versão.

**Amadeus:** o contrato está ativo em `weefly.africa`. Liga ao backoffice **depois** deste MVP. O modelo de dados não pode impedir essa ligação.

---

# Sequência

Não são sprints. É a ordem que mantém o sistema a funcionar a cada passo.

| Ordem | Itens | Porquê aqui |
|---|---|---|
| 0 | `MIG-02` · desligar `weefly.duckdns.org` | Todos os links novos saem do sítio certo |
| 1 | Correções do MVP 1 fechadas | Motor partilhado. Sem `T-04` não há ida e volta |
| 2 | `TEN-01` `TEN-03` | O modelo e o isolamento. Todas as consultas seguintes dependem desta forma |
| 3 | `TEN-06` `ADM-02` `ADM-09` `ADM-01` | Perfis e permissões, as contas Admin da WeeFly e a possibilidade de criar a Alô |
| 4 | `TEN-02` `TEN-04` `TEN-05` `I18N-01` | Marca, endereços e backoffice em duas línguas — tocam em todos os ecrãs, fazem-se na mesma passagem |
| 5 | `PAR-01` a `PAR-05` · `ADM-08` `ADM-06` | Backoffice da Alô e a bolsa, e o espaço B2G no Admin para os acompanhar |
| 6 | `MIN-01` a `MIN-07` | A aplicação do ministério |
| 7 | `PAR-06` `PAR-07` `PAR-08` | Cotação, pagamento externo, finanças |
| 8 | `ADM-03` `ADM-04` `ADM-05` `ADM-07` | Números e receita |
| 9 | `DAT-01` `DAT-02` `DAT-03` | Fichas dos passageiros |

**Primeira entrega para testar:** os passos 0 a 3, com os testes dos Blocos A e B (B1 a B6). É o que dá acesso Admin à equipa WeeFly e desbloqueia as contas da Alô que hoje estão fechadas à entrada.

---

# Bloco A · Separação entre parceiros

A camada onde assenta tudo o resto.

### `TEN-01` · Modelo de três níveis
**Complexidade** Alta

```
Parceiro      (WeeFly Concierge · Alô)
  └─ Organização   (Ministério da Saúde · Ministério da Educação)
       └─ Caso     (o que existe hoje)
```

Cada caso ganha `partner_id` e `organisation_id`. Todos os casos existentes ficam associados ao parceiro WeeFly.

**Critérios de aceitação**
- `partner_id` preenchido em todos os casos, antigos e novos
- Não é possível criar um caso sem parceiro
- A organização é opcional: os casos de retalho da WeeFly não têm nenhuma

> O `PRO-06` já criou a "empresa". Confirma que **empresa = parceiro** no modelo de dados, e não duas tabelas diferentes para a mesma coisa.

### `TEN-03` · Isolamento das consultas
**Complexidade** Alta · **Não é opcional**

**Critérios de aceitação**
- Todas as consultas filtradas pelo parceiro do utilizador autenticado
- **Row-level security ativa no Supabase**, imposta na base de dados e não só no código da aplicação
- Abrir um caso de outro parceiro pelo endereço direto devolve **não encontrado** (404), não *proibido* (403)
- Exportações, pesquisa, relatórios, notificações e o menu Cliente respeitam a mesma fronteira
- Um teste explícito por parceiro prova o isolamento

> Row-level security é a ferramenta certa. Filtrar só na aplicação quer dizer que basta um `where` esquecido para um parceiro ver os casos de outro.

### `TEN-06` · Modelo de acesso
**Complexidade** Média

Há duas coisas aqui, e **as duas entram agora**.

| Parte | Decisão |
|---|---|
| **Modelo de dados** — cada utilizador pertence a um parceiro, cada consulta filtra por ele | **Entra agora** |
| **Ecrãs de gestão** — criar utilizadores, atribuir perfis, editar permissões | **Entra agora, na versão mínima do `ADM-02`**, dentro do backoffice Admin |

> **Alteração à especificação v5.2, pedida a 30 de setembro.** A v5.2 adiava os ecrãs de gestão porque só o Dominik administrava. Isso deixou de ser verdade: há mais de uma pessoa na WeeFly a administrar e a fazer os testes finais, e a Alô vai ter vários agentes e secretárias. Criar contas à mão no Supabase deixa de chegar.

**Tem de estar no código desde o primeiro dia:**
- `partner_id` no utilizador e no caso, nunca nulo, nunca deduzido
- Row-level security ativa desde o início, não acrescentada depois
- **Nenhum caminho do código assume que "o parceiro é a WeeFly"**
- O parceiro do utilizador vem da sessão, nunca de um parâmetro

**Critérios de aceitação**
- O login abre o Concierge por defeito
- Os módulos que a conta não tem aparecem bloqueados com *Brevemente* e são inacessíveis pelo endereço direto
- Um utilizador com outro `partner_id` vê só os casos desse parceiro — testado explicitamente
- As permissões vêm do perfil guardado nos dados (`ADM-02`), nunca de verificações escritas no código com nomes de pessoas ou de contas
- **Admin** aparece em qualquer conta com o perfil *Admin WeeFly*, não só na conta do Dominik (substitui a regra do `PRO-02`)

### `TEN-02` · Marca em dois níveis
**Complexidade** Média · ⚠ **Parte dos dados da Alô ainda por receber**

**Recebido a 30 de setembro:**

| | Valor |
|---|---|
| Nome na marca | **Alô Cabo Verde Tour** · *Agência de viagens & turismo* |
| Logótipo | `alo_marca/alo_logo_transparente.png` · 1774 × 887 px, fundo transparente |
| Cor principal (azul) | `#02A9FF` — tirada do logótipo |
| Cor de destaque (laranja) | `#FF6A02` — tirada do logótipo |
| Cor escura | Proposta: `#0078E8`, o azul mais escuro do globo. ⚠ Confirmar com a Alô |

> **Sobre o ficheiro do logótipo:** o PNG transparente tem as margens serrilhadas, com restos de branco à volta das letras que se veem sobre fundos escuros. Pede à Alô **o original em vetor (SVG ou PDF)**. Precisas também de uma **versão compacta** — só o globo com o avião — para o cabeçalho da aplicação em telemóvel, para o ícone da app instalada (`MIN-06`) e para o favicon. O logótipo completo é largo (2:1) e fica ilegível em pequeno.

**Nível do parceiro:** logótipo, cor principal, cor escura, nome do remetente, endereço do remetente, endereço de resposta, rodapé, interruptor `powered_by_weefly`.

**Nível da organização:** **só o nome e o logótipo (brasão) do ministério.** Um ministério não tem cores próprias: tem o brasão sobre o desenho da Alô.

**Critérios de aceitação**
- Nenhuma cor escrita no código; todas lidas de tokens preenchidos na renderização
- O brasão do ministério aparece no cabeçalho, ao lado do logótipo da Alô
- Se um ministério não tiver brasão, o ecrã continua limpo, sem espaço vazio nem imagem partida
- Os emails da Alô saem com o remetente da Alô, não com o da WeeFly

### `TEN-04` · Endereços
**Complexidade** Média

**Um subdomínio por parceiro, um caminho por ministério.**

```
alo.weefly.africa/m/saude/...
alo.weefly.africa/m/educacao/...
```

Não um subdomínio por ministério: isso exigia um registo DNS e um certificado para cada um.

**Critérios de aceitação**
- Registo DNS e **certificado wildcard** para `*.weefly.africa`
- O subdomínio identifica o parceiro; o caminho identifica o ministério
- Um parceiro ou ministério desconhecido devolve um *não encontrado* com a marca certa, nunca um erro técnico

> Teste feito a 30 de setembro: `alo.weefly.africa` e qualquer outro subdomínio de `weefly.africa` **ainda não existem** no DNS.

### `TEN-05` · Powered by WeeFly
**Complexidade** Baixa

No rodapé do backoffice do parceiro, do backoffice Admin e da aplicação do ministério. Interruptor por parceiro, ligado por defeito.

### Teste do Bloco A

| # | Passos | Resultado esperado |
|---|---|---|
| A1 | Entrar com uma conta de teste da Alô | Entra. Vê só Agente › Passagens, Cliente e Carteira. Fornecedor com cadeado |
| A2 | Na conta da Alô, abrir a fila de casos | **Zero** casos da WeeFly |
| A3 | Na conta da Alô, colar o endereço direto de um caso da WeeFly | **404** |
| A4 | Na conta da Alô, pesquisar pela referência, nome ou telefone de um caso da WeeFly | Nenhum resultado |
| A5 | Na conta da Alô, abrir o menu Cliente | Nenhum cliente da WeeFly |
| A6 | Na conta da Alô, exportar | Só dados da Alô |
| A7 | Na conta da WeeFly, repetir A2–A6 para um caso da Alô | O mesmo resultado, no sentido inverso |
| A8 | Na conta da Alô, abrir o sino | Nenhuma notificação de casos da WeeFly |
| A9 | Numa conta Admin WeeFly (Dominik ou Admilson), abrir o Admin | Vê os dois parceiros |
| A10 | Abrir `alo.weefly.africa/m/nao-existe` | *Não encontrado* com a marca da Alô |

**A2 a A8 são o teste mais importante do MVP 2.** Se um falhar, nenhuma conta real da Alô é aberta.

---

# Bloco B · Admin WeeFly

O painel master. Reaproveita o backoffice atual e alarga-o. Vive no módulo **Admin**, visível a quem tem o perfil *Admin WeeFly*.

**O que o Admin tem, no ecrã:**

| Menu do Admin | Itens | O que se faz lá |
|---|---|---|
| **Contas** | `PRO-09` | Validar contas novas: aprovar ou recusar |
| **Utilizadores e permissões** | `ADM-02` | Criar utilizadores, atribuir perfis e módulos, suspender |
| **Parceiros** | `ADM-01` | Criar e suspender parceiros, configurar a marca |
| **B2G** | `ADM-08`, com `ADM-04` e `ADM-06` | Ver e acompanhar parceiros, ministérios, bolsas, alertas, casos e passagens |
| **Números** | `ADM-03` | Análise consolidada e exportação |
| **Receita** | `ADM-07` | Taxas e comissões, quando decididas |

### `ADM-01` · Registo de parceiros
**Complexidade** Média · **Sem isto não se cria a Alô**

Campos: nome comercial, nome legal, NIF, país, morada, pessoa de contacto, email, telefone, configuração da marca (`TEN-02`), data de início do contrato, estado.

**Critérios de aceitação**
- Só um Admin WeeFly cria parceiros
- Criar um parceiro cria a sua primeira conta de administrador e envia o convite
- Um parceiro pode ser **suspenso sem ser apagado**; a suspensão bloqueia o login e congela os links dele

> Liga ao `PRO-09`: uma empresa aprovada no Admin como white label é um parceiro.

### `ADM-02` · Utilizadores e permissões (RBAC) · versão mínima
**Complexidade** Média · **Volta ao MVP 2 — ver `TEN-06`** · **Necessário para os testes finais**

Menu **Utilizadores e permissões**, dentro do Admin.

**Perfis desta versão** — fixos, guardados como dados:

| Perfil | Pertence a | O que pode fazer |
|---|---|---|
| **Admin WeeFly** | Parceiro WeeFly, com a marca *vê todos os parceiros* | Tudo: Admin, todos os parceiros, criar utilizadores de qualquer parceiro |
| **Agente WeeFly** | Parceiro WeeFly | Concierge da WeeFly. Sem Admin |
| **Admin do parceiro** | Um parceiro (ex.: Alô) | O backoffice do seu parceiro: ministérios, bolsas, reverter pagamentos (`PAR-07`), criar agentes e secretárias do seu parceiro |
| **Agente do parceiro** | Um parceiro | Cotar, enviar ofertas, emitir, confirmar pagamentos. Não mexe em bolsas nem em utilizadores |
| **Secretária** | Um ministério de um parceiro | Só a aplicação do seu ministério (`MIN-01`). Nunca entra no backoffice |

**Critérios de aceitação**
- Criar, editar e **suspender** utilizadores. Não se apagam: suspender preserva o histórico (mesma regra do `PAR-04`)
- Atribuir a cada utilizador **um perfil, um parceiro e os módulos** ligados (`PRO-04`)
- Um utilizador pertence a **exatamente um parceiro**
- Só o Admin WeeFly vê os utilizadores de todos os parceiros; um Admin do parceiro vê e gere só os do seu
- Um Admin do parceiro **não** pode dar a ninguém o perfil Admin WeeFly
- Cada alteração de permissões fica registada com autor, data e hora, e o valor antes e depois
- Suspender um utilizador termina as sessões abertas dele de imediato
- O perfil é verificado no servidor e nas políticas de row-level security, não só escondendo botões no ecrã

> Fica para depois: perfis à medida e permissões editáveis uma a uma. Os cinco perfis fixos chegam para a Alô e para os testes.

### `ADM-09` · Contas Admin da equipa WeeFly
**Complexidade** Baixa · **Primeira coisa a fazer depois do `ADM-02`**

**Critérios de aceitação**
- Existem pelo menos duas contas com o perfil Admin WeeFly: **Dominik** e **Admilson** (`admilsonborges@bonako.com`)
- As duas veem o módulo Admin completo, com todos os menus da tabela acima
- Cada uma tem a sua password; ninguém usa a conta do Dominik
- As ações de cada uma ficam registadas com o nome de quem as fez

### `ADM-03` · Análise consolidada
**Complexidade** Média

**Critérios de aceitação**
- Total de passagens emitidas, por parceiro e por ministério
- Custo unitário e custo total
- Datas de emissão e linha temporal
- Quem emitiu cada passagem
- Filtros: hoje, semana, mês, ano, intervalo à escolha
- Exportação para CSV

### `ADM-04` · Todos os dados dos parceiros, só para o Admin
**Complexidade** Média

**Critérios de aceitação**
- O Admin WeeFly vê os casos, ministérios e passagens de todos os parceiros
- Organizado por parceiro, depois por ministério
- **Só leitura por defeito.** Intervir exige uma ação explícita, que fica registada
- Nunca visível a contas de parceiros

### `ADM-08` · Espaço B2G no Admin
**Complexidade** Média · **Necessário para os testes finais e para vender**

Menu **B2G** no Admin. É onde a WeeFly acompanha todas as vendas ao Estado, de todos os parceiros. Junta num só sítio o `ADM-04` (dados dos parceiros) e o `ADM-06` (destinatários dos alertas).

**O que mostra, por níveis:**

```
B2G
  └─ Parceiro        (Alô · próximos)          estado, nº de ministérios, total emitido
       └─ Ministério (Saúde · Educação · …)     secretária, link, saldo da bolsa, limite, alertas
            └─ Caso  (o que existe hoje)        estado, oferta, pagamento externo, passagens
```

**Critérios de aceitação**
- Lista de parceiros B2G, com: estado, número de ministérios, total emitido, soma dos saldos
- Por parceiro, a lista dos seus ministérios, com: secretária ativa, link, saldo, limite de alerta, último alerta, número de pedidos
- Por ministério: o **histórico da bolsa** (`PAR-03`), os **alertas enviados** (`PAR-05`), os casos e as passagens emitidas
- Por caso: o mesmo detalhe que a Alô vê, incluindo o pagamento externo (`PAR-07`)
- Os destinatários dos alertas configuram-se aqui, por parceiro e por ministério (`ADM-06`)
- **Só leitura por defeito.** Intervir (ex.: corrigir um saldo, reenviar um link) exige um botão explícito, pede confirmação e fica registado com quem, quando e porquê
- Filtros por parceiro, ministério, estado e datas; pesquisa por referência, ministério e passageiro
- Exportação CSV com os mesmos números do `ADM-03` e do `PAR-08`
- **Nunca visível a contas de parceiros**, nem pelo endereço direto (404)

### `ADM-05` · Módulos futuros bloqueados
**Complexidade** Baixa — Fornecedor, experiências, carros, alojamento: presentes na navegação, bloqueados, com *Brevemente*. Já está coberto pelo `PRO-03` e `PRO-04`; confirmar.

### `ADM-06` · Destinatários dos alertas
**Complexidade** Baixa · ⚠ **Decisão O1**

Por parceiro e por ministério: quem recebe os alertas de saldo, na WeeFly e no parceiro.

### `ADM-07` · Modelo de receita
**Complexidade** Média · ⚠ **Bloqueado — decisões D1, D7, D8 e C1**

Duas componentes: **uma taxa por conta criada** e **uma percentagem por emissão**, ainda a acordar com a Alô.

**Critérios de aceitação, quando decidido**
- Configurável por parceiro, nunca escrito no código
- Calculado na emissão e guardado no caso, para que mudar a taxa mais tarde não reescreva o histórico
- Visível no `ADM-03`, por parceiro e por período
- Incluído na exportação CSV

> **Até haver decisão:** prepara o campo no caso (`commission_rate`, `commission_amount`, nulos), mas não calcules nada. Ver C1 em *O que falta decidir*.

### Teste do Bloco B

| # | Passos | Resultado esperado |
|---|---|---|
| B1 | Entrar com a conta do Admilson | Vê o módulo **Admin** com os menus Contas, Utilizadores e permissões, Parceiros, B2G, Números, Receita |
| B2 | Criar o parceiro *Alô* (`ADM-01`) | Parceiro criado; a primeira conta de administrador recebe o convite |
| B3 | Em Utilizadores, criar um *Agente do parceiro* da Alô | Entra e vê só o backoffice da Alô. Não vê Admin |
| B4 | Entrar como *Admin do parceiro* da Alô e tentar dar a alguém o perfil Admin WeeFly | **Não é possível** |
| B5 | Suspender o agente da B3 com ele ligado | É desligado de imediato e não volta a entrar |
| B6 | Ver o registo de alterações | B3, B4 e B5 registadas, com autor, data e hora |
| B7 | Abrir **B2G** › Alô › *Ministério de Teste* | Saldo, histórico da bolsa, alertas, casos e passagens iguais aos que a Alô vê |
| B8 | Na conta de um agente da Alô, abrir o endereço do menu B2G | **404** |
| B9 | No B2G, corrigir um saldo | Pede confirmação e motivo; fica registado com o nome do Admilson |
| B10 | Exportar o B2G e comparar com o `ADM-03` e o `PAR-08` | Os mesmos números |

---

# Backoffice em duas línguas

### `I18N-01` · Backoffice em português e inglês
**Complexidade** Média · **Na mesma passagem que o `TEN-02`**

| | Terminal público · `/pc` | Backoffice · `/admin` |
|---|---|---|
| **Línguas** | PT · EN · FR · NL | **PT · EN** |
| **Quem escolhe** | O `lang` do caso, a partir do link | O utilizador, nas Definições |
| **Por defeito** | O parâmetro do link | **Português** |
| **Dicionário** | O público, que já existe | **Um dicionário próprio do backoffice** |

**Critérios de aceitação**
- Todos os textos do backoffice vêm de um dicionário, nenhum escrito no código
- Seletor de língua nas **Definições, dentro do menu do utilizador**, não no ecrã principal
- A escolha fica guardada no utilizador e mantém-se entre sessões e dispositivos
- Uma verificação no build mantém PT e EN alinhados, como o `npm run i18n:check`
- Datas e números seguem a língua escolhida

> **A regra que não se quebra: a língua do backoffice só muda o que o agente vê. Nunca muda o que o cliente recebe.** Um agente em português que emite para um cliente francês envia-lhe tudo em francês: emails, WhatsApp, link e PDF do bilhete. Os helpers do Sprint 3.1 que recebem um tradutor opcional têm de receber o tradutor **do caso** quando constroem algo para o cliente, e o **do agente** só no ecrã do backoffice. Misturar os dois é o erro mais provável deste item.

**Verificar também:**
- O PDF do bilhete segue a língua do caso nas quatro línguas
- Notas internas e registo de atividade ficam na língua em que o agente escreveu
- Entradas geradas pelo sistema (*caso reclamado*, *pagamento confirmado*) guardam-se como códigos de evento e mostram-se na língua de quem lê

---

# Bloco C · Backoffice da Alô

A equipa da Alô entra pelo login do WeeFly Pro, escolhe **Agente** e vê **Passagens**, **Cliente** e **Carteira** (`PRO-04`, `PRO-05`).

### `PAR-01` · Abre no Concierge
**Complexidade** Baixa — o módulo por defeito é o Concierge (Passagens); os outros ficam bloqueados conforme o `TEN-06`.

### `PAR-02` · Gestão de ministérios
**Complexidade** Média · ⚠ **Decisão O3 — onde fica o menu**

Lista dos ministérios ativos. Por ministério: nome, **brasão**, nome da secretária, contactos da secretária, **link único**, histórico de pedidos, saldo da bolsa.

**Critérios de aceitação**
- A Alô cria e gere os ministérios sem precisar da WeeFly
- O link é gerado na criação e pode ser regenerado
- O link segue o `TEN-04` (`alo.weefly.africa/m/<ministério>/…`) e sai do mesmo construtor de links do `MIG-02`
- O histórico mantém-se quando a secretária muda (`PAR-04`)

### `PAR-03` · Bolsa por ministério
**Complexidade** Alta · **O centro do modelo B2G**

É assim que o dinheiro público funciona em Cabo Verde, e substitui por completo um circuito de aprovação.

| Mecanismo | Como funciona |
|---|---|
| **Bolsa** | O ministério deposita um montante antecipadamente, disponível para viagens |
| **Carta conforto** | O ministério emite uma carta; a Alô apresenta-a ao banco e os fundos ficam disponíveis |

O montante disponível é registado no sistema. **Cada emissão validada desconta dele.**

**Critérios de aceitação**
- Saldo por ministério, com histórico completo de movimentos
- Cada movimento: data, valor, tipo (crédito ou débito), referência do caso, quem registou
- A emissão desconta automaticamente, no momento da emissão
- Crédito manual quando o ministério reforça, registado com a referência do documento
- **Uma passagem não pode ser emitida se o saldo não a cobrir** — bloqueio total, com mensagem clara
- Saldo visível à Alô e ao Admin WeeFly; **à secretária só se for ativado explicitamente** (decisão O2)
- O saldo aparece também na **Carteira** da Alô, só para consulta (Parte 3 do documento de 28 de setembro)

> **Porque é que não é preciso um passo de aprovação.** Num organismo público, alguém autoriza a despesa antes de ela acontecer. Aqui essa autorização já aconteceu: é o próprio financiamento. O dinheiro está disponível antes do primeiro pedido, e é por isso que a tarifa pode ser garantida.

⚠ **Decisão D9:** quando um viajante não voa, o que acontece ao valor já descontado da bolsa? Até haver resposta, a devolução faz-se como **crédito manual** com motivo.

### `PAR-04` · Troca de secretária
**Complexidade** Baixa

Quando uma secretária sai, a Alô **cria uma conta nova** em vez de editar a antiga, para que o registo de quem fez o quê se mantenha.

**Critérios de aceitação**
- A conta que sai é desativada, não apagada
- O histórico fica ligado ao ministério, não à pessoa
- A conta nova herda o ministério e todo o histórico
- O link é regenerado e enviado à nova secretária
- **O link antigo deixa de funcionar de imediato**

### `PAR-05` · Alertas de saldo
**Complexidade** Média · ⚠ **Decisão O1 — destinatários**

**Critérios de aceitação**
- Limite configurável por ministério, em valor ou em percentagem
- Passar o limite envia um alerta **por email e depois por WhatsApp**
- Destinatários: o responsável na Alô e na WeeFly, conforme o `ADM-06`
- Repete-se enquanto o saldo estiver abaixo do limite, **no máximo uma vez por dia**
- Os alertas ficam registados no ministério, não só enviados
- Nenhum alerta sai em duplicado (mesma regra do `T-22`)

### `PAR-06` · Cotação e oferta
**Complexidade** Baixa · **Reaproveita o que existe**

Pesquisa de preço, composição da oferta, envio ao ministério. O motor é o que já existe. A única novidade é a que parceiro pertence o caso.

### `PAR-07` · Confirmação de pagamento externo
**Complexidade** Média

O ministério paga à Alô fora da plataforma. A plataforma regista e liberta a emissão.

**Critérios de aceitação**
- Ação **Confirmar pagamento externo** no caso
- Regista valor, data, método, referência e quem confirmou
- Documento de suporte opcional — a bolsa é o verdadeiro controlo
- Confirmar liberta a emissão e desconta da bolsa do ministério
- Um administrador da Alô pode reverter; a reversão fica registada e o saldo é reposto

### `PAR-08` · Acompanhamento financeiro
**Complexidade** Média · ⚠ **Comissão depende da decisão C1**

**Critérios de aceitação**
- Por passagem: custo, valor cobrado, comissão WeeFly, data de emissão, quem emitiu
- Por ministério: total emitido, total consumido, saldo
- Exportação para CSV
- **Os números batem exatamente com o `ADM-03`** — mesmos valores, âmbito diferente

### Teste do Bloco C

| # | Passos | Resultado esperado |
|---|---|---|
| C1 | Na conta da Alô, criar o *Ministério de Teste* com brasão e secretária | Aparece na lista com um link `alo.weefly.africa/m/teste/…` |
| C2 | Registar um crédito de 100 000 CVE com referência de documento | Saldo 100 000, um movimento de crédito no histórico |
| C3 | Definir limite de alerta a 20 000 CVE | Guardado |
| C4 | Emitir uma ida e volta de 85 000 CVE | Saldo 15 000. Débito com a referência do caso. **Um** alerta por email e **um** por WhatsApp |
| C5 | Tentar emitir uma passagem de 20 000 CVE | **Bloqueado**, com mensagem clara |
| C6 | Reverter o pagamento externo da C4 | Saldo reposto a 100 000, reversão registada |
| C7 | Trocar a secretária | Link antigo deixa de abrir. Nova secretária recebe link novo. Histórico intacto |
| C8 | Comparar `PAR-08` com `ADM-03` | Os mesmos números |

---

# Bloco D · A aplicação do ministério

### `MIN-01` · Aplicação com barra inferior — **igual para os dois tipos de link**
**Complexidade** Média

Não é o Price Checker com outro logótipo. É uma aplicação, e é **a entrada de todos os links personalizados**: o do ministério e o do cliente particular.

| | Link do ministério | Link do cliente particular |
|---|---|---|
| Aba principal | Novo pedido | Novo pedido |
| Segunda aba | Minhas passagens | Minhas passagens |
| Dados de quem pede | Conhecidos, do ministério | Conhecidos, do registo |
| Dados dos passageiros | A secretária preenche | O cliente preenche, ou reutiliza |
| Marca | Alô + brasão do ministério | WeeFly, ou o parceiro |

A única diferença real: o link particular pede os dados do cliente uma vez, na primeira visita, e nunca mais. **Um componente, duas configurações.**

| Aba | Conteúdo |
|---|---|
| **Novo pedido** | Ativa por defeito. O passo 1 do Price Checker: datas, destino, passageiros, percurso |
| **Minhas passagens** | A viagem ativa em cima, depois o arquivo das passagens emitidas, usadas e expiradas desse ministério |

**Critérios de aceitação**
- Barra inferior fixa, sempre visível
- *Novo pedido* é o estado inicial ao abrir
- *Minhas passagens* mostra a viagem ativa em destaque e o arquivo por baixo
- O arquivo rola e mostra só o que pertence a esse link de ministério

⚠ **Decisão O4:** a secretária entra só pelo link, sem password? A especificação fala numa "conta" da secretária e num link que se regenera. Confirma com o Ivandro antes de construir a entrada.

### `MIN-02` · Marca do ministério no cabeçalho
**Complexidade** Baixa — logótipo da Alô e brasão do ministério.

### `MIN-03` · Dados dos passageiros preenchidos pela secretária
**Complexidade** Média

Por passageiro: nomes próprios, apelidos, data de nascimento, sexo, nacionalidade, número de passaporte, validade, país emissor, **e agora telefone e email**.

**Critérios de aceitação**
- Telefone e email são campos novos no contrato de dados
- Marcados como *só para apoio operacional*, com uma frase curta a explicar porquê
- Aviso se o passaporte não cobrir seis meses depois do regresso
- Fichas reutilizáveis: escrever um nome que coincide com um viajante anterior oferece reutilizar os dados

> Os contactos existem para que a equipa da Alô chegue ao viajante durante uma perturbação, e para que o viajante chegue à equipa. É essa a justificação, e tem de estar escrita no ecrã.

### `MIN-04` · WhatsApp, só para apoio
**Complexidade** Baixa · ⚠ **Número da Alô a receber**

Um botão flutuante que liga **à Alô**, não à WeeFly.

**Critérios de aceitação**
- O número vem da configuração do parceiro
- Abre com o nome do ministério e a referência já escritos
- Presente em todos os ecrãs do link
- Serve também para pedir um link novo se se perder o acesso

### `MIN-05` · Email de boas-vindas
**Complexidade** Baixa

**Critérios de aceitação**
- Enviado quando o ministério é criado e sempre que o link é regenerado
- Com a marca da Alô e *powered by WeeFly*
- Leva o link e instruções completas: o que é, como guardar no ecrã inicial, o que faz cada aba, como pedir ajuda
- Instruções de instalação por plataforma, como já especificado

### `MIN-06` · Instalar como aplicação
**Complexidade** Baixa — a especificação PWA que já existe, sem alterações. Android com um toque, iOS em três passos, atalho no computador. Ícone: a versão compacta do logótipo da Alô (ver `TEN-02`).

### `MIN-07` · Aceitar a oferta garante a tarifa
**Complexidade** Baixa

**Critérios de aceitação**
- A oferta diz o prazo, e a contagem parte da hora de envio
- Aceitar dentro do prazo leva o caso diretamente à emissão, porque os fundos já estão disponíveis
- Se o saldo não cobrir, a secretária vê uma mensagem clara e a Alô é avisada

### Teste do Bloco D

| # | Passos | Resultado esperado |
|---|---|---|
| D1 | Abrir o link do *Ministério de Teste* num telemóvel | Marca da Alô, brasão, aba *Novo pedido* ativa, barra inferior fixa |
| D2 | Pedir uma ida e volta Praia–Lisboa para 2 passageiros | O caso aparece no backoffice da Alô em menos de 5 s, **e não aparece no da WeeFly** |
| D3 | Alô envia oferta; secretária aceita dentro do prazo | O caso segue para a emissão sem outro passo |
| D4 | Preencher os 2 passageiros, um com passaporte a expirar daqui a 4 meses | Aviso de validade |
| D5 | Emitir | Os dois voos no bilhete; saldo descontado; *Minhas passagens* mostra a viagem ativa |
| D6 | Novo pedido com o mesmo passageiro | Oferece reutilizar os dados |
| D7 | Tocar no WhatsApp | Abre o número da Alô com o ministério e a referência escritos |
| D8 | Instalar no Android e no iPhone | Ícone da Alô no ecrã inicial |

---

# Bloco E · Fichas dos passageiros

### `DAT-01` · Fichas reutilizáveis
**Complexidade** Média

**Critérios de aceitação**
- As fichas pertencem ao ministério, não ao caso
- Reutilizáveis num pedido novo, com os dados pré-preenchidos e a confirmar
- Editáveis, com histórico de alterações

### `DAT-02` · Aviso de passaporte a expirar
**Complexidade** Baixa

**Critérios de aceitação**
- Alerta quando um passaporte guardado está a menos de seis meses de expirar
- Enviado à secretária do ministério
- Assinalado também no backoffice da Alô

### `DAT-03` · Conservação e base legal
**Complexidade** Baixa a construir · ⚠ **Bloqueado — decisões L1, L2, L3**

Guardar dados de passaporte e contactos de funcionários do Estado numa empresa privada exige uma base legal e um prazo de conservação. **Tem de haver resposta antes do lançamento, não depois.**

**Critérios de aceitação, quando decidido**
- Prazo de conservação configurável e cumprido
- Anonimização automática no fim do prazo: números de passaporte apagados, nomes mantidos para a contabilidade
- Texto de consentimento explícito no ecrã onde a secretária introduz os dados
- Exportação e apagamento a pedido

---

# Duas coisas que não se podem perder

**As etiquetas `P1` `P2` `P3` dos passageiros.** Geradas no pedido, mostradas no pagamento, impressas no bilhete e repetidas em cada voo.

**A diferença entre um preço garantido e um preço indicativo.** No B2G a tarifa é garantida por outra razão — os fundos já estão lá —, mas a regra mantém-se: **nunca mostrar uma contagem ao lado de um preço que não está de facto reservado.**

---

# O que falta decidir

| # | Pergunta | Quem | Bloqueia |
|---|---|---|---|
| **S1** | Aprovar a alteração ao âmbito: o RBAC mínimo (`ADM-02`) e o espaço B2G (`ADM-08`) entram no MVP 2. A v5.2 adiava o `ADM-02` | Ivandro · Dominik | Datas do MVP 2 |
| **C1** | As comissões são calculadas no sistema (especificação v5.2, `ADM-07`) ou fora dele (decisão de 26 de setembro)? | Ivandro · Dominik | `ADM-07` · `PAR-08` |
| `D1` | Percentagem por emissão, e sobre que base — custo ou valor cobrado ao ministério? A acordar com a Alô | Dominik | `ADM-07` |
| `D7` | A taxa por conta cobra-se uma vez ou todos os meses? | Dominik | `ADM-07` |
| `D8` | A comissão é diferente entre revendedor oficial e white label? | Dominik | `ADM-07` |
| `D9` | Quando um viajante não voa, o que acontece ao valor já descontado da bolsa? | Contrato com a Alô | `PAR-03` |
| `O1` | Quem na Alô e na WeeFly recebe os alertas de saldo? | Alô · Dominik | `ADM-06` · `PAR-05` |
| `O2` | O ministério vê o seu próprio saldo, ou só a Alô? | Dominik · Alô | `PAR-03` |
| **O3** | Onde fica a gestão de ministérios no backoffice da Alô: dentro de **Cliente** ou num menu próprio **Ministérios**? | Ivandro | `PAR-02` |
| **O4** | A secretária entra só pelo link, ou com link e password? | Ivandro | `MIN-01` |
| `L1` | Base legal para guardar dados de passaporte e contactos de funcionários do Estado | Jurídico | `DAT-03` |
| `L2` | Prazo de conservação | Jurídico | `DAT-03` |
| `L3` | Os dados têm de estar alojados em Cabo Verde? O servidor está na Irlanda (AWS) | Jurídico | Infraestrutura |
| `L-03` | Linha da bagagem em neerlandês: `Ingecheckt bagage` é rótulo, falta o valor para "sem bagagem" | Dominik | Dicionário NL |

---

# Dados a receber

Para configurar a Alô (`ADM-01`, `TEN-02`, `MIN-04`):

| Dado | Estado |
|---|---|
| Nome comercial | ✅ Alô Cabo Verde Tour |
| Logótipo PNG | ✅ Recebido |
| Cores principal e de destaque | ✅ Do logótipo |
| Logótipo em vetor (SVG/PDF) e versão compacta (só o globo) | ❌ |
| Cor escura (confirmar `#0078E8`) | ❌ |
| Nome legal, NIF, morada | ❌ |
| Pessoa de contacto, email, telefone | ❌ |
| Nome e endereço do remetente dos emails (ex.: `reservas@…`) | ❌ |
| Endereço de resposta | ❌ |
| Texto do rodapé | ❌ |
| Número de WhatsApp de apoio | ❌ |
| O link mostra o ecrã da Alô ou o ecrã WeeFly? | ❌ Presume-se o da Alô |
| Data de início do contrato | ❌ |

Para o teste, um **ministério de teste**: nome, identificador no endereço (ex.: `teste`), brasão, nome e contactos da secretária de teste, saldo inicial, limite de alerta.

---

# Como fechar o MVP 2

| Quando | Teste | Se falhar |
|---|---|---|
| Fim do passo 3 | **Teste do Bloco A** — isolamento entre parceiros · **Teste do Bloco B, B1 a B6** — Admin e permissões | Nenhuma conta real da Alô é aberta |
| Fim do passo 5 | **Teste do Bloco B, B7 a B10** — espaço B2G | Os testes finais de vendas não começam |
| Fim do passo 5 | **Teste do Bloco C** — ministério, bolsa, alertas | A aplicação do ministério não começa |
| Fim do passo 6 | **Teste do Bloco D** — do pedido da secretária à passagem emitida | Não se envia nenhum link a um ministério real |
| Antes do lançamento | `L1` `L2` `L3` respondidas · `DAT-03` feito | Não se guardam dados de passaporte de ministérios reais |
