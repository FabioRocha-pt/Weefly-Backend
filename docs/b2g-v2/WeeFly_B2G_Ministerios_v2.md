# WeeFly · B2G, terminal de vendas do parceiro e área do master

| | |
|---|---|
| **Para** | Fábio |
| **De** | Ivandro |
| **Versão** | 2.0 · substitui a 1.0 |
| **Itens** | 26 requisitos, cada um com o seu teste |
| **Empresas** | WeeFly Global · WeeFly Moçambique · Alô · Empresa Teste, como controlo |
| **Anexos** | `assets/ministerios/` com os logótipos dos três ministérios · `assets/alo/` do pacote de 2 de outubro |
| **Complementa** | O PDF do Ivandro com o teste manual e as telas · `WeeFly_Teste_por_Persona_B2G.md` |

---

## O que mudou desde a versão 1

| Antes | Agora |
|---|---|
| O master tinha uma área de suporte | O master tem **um concierge próprio, sem empresa**, que vê os pedidos de todas: WeeFly Global, WeeFly Moçambique e Alô |
| O link de envio escolhia B2G ou B2C | O terminal de vendas do parceiro tem **três menus e três tipos de link: Público, VIP e Ministérios** |
| As secretárias eram criadas pela equipa técnica e definiam o próprio PIN | **O PIN é gerado pela WeeFly ou pelo parceiro** e entregue à secretária |
| Os passageiros ficavam só no caso | **Os passageiros que a secretária regista ficam guardados no espaço dela**, para reutilizar, e ficam registados no Admin |
| Os ministérios eram criados pela equipa técnica | Continua assim. **O parceiro pede um ministério novo, e o master aprova** |
| Só o Admin criava clientes VIP | **O parceiro cria os seus VIP**, no menu VIP |
| Logótipos de teste | **Os logótipos reais** dos três ministérios, mais o da Alô em todos os terminais dela |

---

## O modelo

| Nível | O que é |
|---|---|
| **Master** | O Dominik. Gere tudo a partir do **Admin**, sem pertencer a nenhuma empresa |
| **Empresas** | **WeeFly Global**, **WeeFly Moçambique** e **Alô**. Cada uma com o seu backoffice e as suas ferramentas |
| **Ferramenta Viagens** | Ligada pelo master empresa a empresa, com os canais que essa empresa pode usar |
| **Canais** | **Público** · **VIP** · **Ministérios**. Cada um é um menu no terminal de vendas da empresa |

**Tudo o que este documento descreve para a Alô vale também para a WeeFly Global, a WeeFly Moçambique e qualquer empresa com a ferramenta B2G ligada.** A Alô é o primeiro caso, não um caso especial.

---

## O fluxo B2G

1. A secretária entra no **espaço do ministério** com o seu PIN
2. Faz um **pedido simples**: pessoas, de onde, para onde, quando vão, quando voltam, urgência e notas
3. O pedido chega **à empresa e ao master ao mesmo tempo**, ordenado por urgência e depois por espera
4. Um agente da empresa ou o Dominik **reclama** o pedido. Fica registado quem foi
5. Faz a pesquisa e as ofertas **com o compositor que já existe**
6. Se foi o Dominik, **a empresa revê antes de enviar**
7. A secretária recebe as ofertas. O ministério decide **fora da plataforma**
8. A secretária escolhe e regista **os passageiros**, que ficam guardados no espaço dela
9. **A WeeFly emite.** Os bilhetes aparecem no espaço da secretária
10. O pagamento é **fora da plataforma**, até haver InstaPay

---

## Pré-requisitos

**Sem estes, nenhum teste deste documento passa.**

| Pré-requisito | Porquê |
|---|---|
| **Os quatro P0 da entrada** · `OCT-01` a `OCT-04` | Os agentes da Alô e o Dominik têm de conseguir entrar |
| **Isolamento entre empresas** · `TEN-03` | Hoje as contas da Alô estão bloqueadas à entrada, de propósito |
| **Certificado para `*.weefly.africa`** · `DOM-01` | Os endereços dos ministérios e de empresas novas, como `mz`, dão erro de certificado |

---

## Decisões

### Tomadas pelo Ivandro

| # | Decisão | Afeta |
|---|---|---|
| **D-5** | **O PIN é gerado pela WeeFly ou pelo parceiro** e entregue à secretária. Cada secretária tem o seu | `B2G-06` `B2G-24` |
| **D-9** | **O parceiro cria os seus clientes VIP.** Substitui a regra anterior, em que só o Admin os criava | `B2G-22` |
| **D-10** | **O parceiro não cria ministérios: pede-os ao master**, que aprova no Admin | `B2G-23` |
| **D-11** | **Os passageiros registados pela secretária ficam guardados no espaço dela** e no Admin | `B2G-25` |
| **D-12** | **O master trabalha sem empresa**, com acesso a todas | `B2G-14` |

### Propostas, por confirmar

O documento assume a proposta. Se alguma mudar, só muda o requisito indicado.

| # | Pergunta | Proposta | Afeta |
|---|---|---|---|
| **D-1** | O formulário tem *para onde* mas não *de onde* | **Origem com a Praia por defeito, editável** | `B2G-09` |
| **D-2** | Quando o Dominik prepara ofertas para uma empresa, quem envia à secretária? | **A empresa revê e envia.** Num white label, a secretária não deve receber nada da WeeFly | `B2G-15` |
| **D-3** | Quem emite? | **Sempre a WeeFly**, pela acreditação IATA via Atlântida | `B2G-18` |
| **D-4** | Duas secretárias do mesmo ministério veem os pedidos uma da outra? | **Sim.** Quem viaja é o ministério | `B2G-06` `B2G-10` |
| **D-6** | Urgência | **Normal, Urgente e Muito urgente**, escolhida pela secretária, alterável pelo agente | `B2G-09` `B2G-11` |
| **D-7** | Quantas pessoas, ou de que tipo? | **Só o número total.** O tipo sai da data de nascimento | `B2G-09` `B2G-16` |
| **D-8** | Bolsa do ministério | **Fica para depois**, com a Carteira | Fora deste documento |
| **D-13** | O que vende a WeeFly Moçambique, e em que endereço? | **Público e VIP**, em `mz.weefly.africa`, como proposto a 2 de outubro. Ministérios quando houver acordo local | `B2G-20` |

> **Os passageiros guardados são dados pessoais de funcionários do Estado.** As questões `L1`, `L2` e `L3` continuam por responder: base legal, prazo de conservação, e se os dados têm de ficar em Cabo Verde. **Pode construir-se e testar-se com dados de teste. Não se usam com ministérios reais antes da resposta.**

---

## Modelo de dados

Tudo pertence a uma empresa e respeita o isolamento do `TEN-03`. O master lê todas.

| Entidade | Campos |
|---|---|
| **Empresa** | nome · subdomínio · tipo · marca · ferramentas e canais ligados |
| **Ministério** | empresa · nome · `slug` · logótipo horizontal · brasão · ativo |
| **Pedido de ministério** | empresa que pede · nome do ministério · logótipo enviado · estado: pendente, aprovado, recusado · motivo · quem decidiu |
| **Secretária** | ministério · nome · telefone · email · token do link pessoal · PIN com hash · quem gerou o PIN · ativa · último acesso |
| **Cliente VIP** | empresa · nome · contactos · link pessoal · nível · ativo · quem criou |
| **Passageiro guardado** | ministério · nomes · apelidos · data de nascimento · sexo · nacionalidade · passaporte · validade · país emissor · telefone · email · quem registou · quando |
| **Pedido B2G** | é um caso, com canal `ministerio` · ministério · secretária · pessoas · origem · destino · ida · volta · urgência · notas · quem reclamou |

O pedido B2G **reutiliza o caso que já existe**. Não é um modelo novo.

---

## Os logótipos

### Onde aparece cada um

| Terminal | Logótipo |
|---|---|
| **Público** da Alô | Alô |
| **VIP** da Alô | Alô |
| **Ministérios** da Alô | **Dois: Alô e o do ministério**, lado a lado, separados por uma linha fina |
| Backoffice da Alô | Alô |
| Admin do master | WeeFly |

E *Powered by WeeFly*, discreto, no fundo de cada terminal da Alô.

### Os ficheiros, em `assets/ministerios/`

| Ficheiro | Para quê |
|---|---|
| `ministerio_saude_horizontal.png` · `_educacao_` · `_financas_` | **O logótipo completo**, com o nome. No cabeçalho do espaço do ministério e em tudo o que o identifica |
| `ministerio_saude_brasao.png` · `_educacao_` · `_financas_` | **Só o brasão**, quadrado, 512 px, fundo transparente. Para o ícone da aplicação e o favicon |

> **Os três brasões são iguais.** É o emblema nacional. Numa lista, num seletor ou num ícone pequeno, **o brasão nunca aparece sozinho**: leva sempre o nome do ministério ao lado. Se não, a secretária e o agente não distinguem um ministério do outro.

---

# Os requisitos

## A · Estrutura e master

### `B2G-01` · O Dominik é o master
**Complexidade** Baixa

**Critérios de aceitação**
- `dominik@weefly.africa` é a conta master
- Vê os três módulos: **Fornecedor, Agente e Admin**
- Não pertence a nenhuma empresa

**Teste:** entrar com `dominik@weefly.africa`. **Passa se** aparecem os três módulos.

### `B2G-02` · Canais ligados empresa a empresa
**Complexidade** Média

**Critérios de aceitação**
- No Admin, o master liga a ferramenta Viagens e escolhe os canais de cada empresa: **Público, VIP, Ministérios**
- Uma empresa sem o canal Ministérios não vê ministérios, secretárias nem pedidos B2G
- Ligar ou desligar não exige nova versão

**Teste:** ligar os três canais à Alô e deixar a Empresa Teste só com Público. **Passa se** a Alô vê os três menus e **a Empresa Teste só vê Público**.

### `B2G-20` · Três empresas no Admin
**Complexidade** Média · **Depende do certificado `*.weefly.africa`**

**Critérios de aceitação**
- No Admin existem: **WeeFly Global**, **WeeFly Moçambique** e **Alô**
- A WeeFly Moçambique tem o seu subdomínio, `mz.weefly.africa` (`D-13`)
- Cada uma com a sua marca e os seus canais

**Teste:** abrir a lista de empresas no Admin, e abrir `mz.weefly.africa/pc`. **Passa se** as três aparecem e a página da WeeFly Moçambique abre sem aviso de certificado.

### `B2G-14` · O concierge do master
**Complexidade** Média

O master tem um sistema **igual ao concierge das empresas**, mas sem empresa: vê e trata os pedidos de todas.

**Critérios de aceitação**
- No Admin, uma fila com os pedidos de **todas as empresas e todos os canais**
- **Filtro por empresa:** WeeFly Global, WeeFly Moçambique, Alô
- Filtro por canal: Público, VIP, Ministérios
- Cada pedido mostra **de que empresa é**
- O master reclama e trata como qualquer agente

**Teste:** com um pedido em cada empresa, abrir a fila do master. **Passa se** aparecem os três, cada um com a sua empresa, e o filtro funciona.

## B · O terminal de vendas do parceiro

### `B2G-21` · Três menus: Público, VIP e Ministérios
**Complexidade** Média

No backoffice da empresa, **um menu para cada canal**.

| Menu | O que tem |
|---|---|
| **Público** | O link público do price checker, e os pedidos que vieram por ele |
| **VIP** | A lista de clientes VIP, criar mais, e os pedidos de cada um |
| **Ministérios** | A lista de ministérios, as secretárias de cada um, os pedidos, e **pedir um ministério novo** |

**Critérios de aceitação**
- Os três menus aparecem só se o canal estiver ligado (`B2G-02`)
- Cada menu tem a sua fila de pedidos
- A marca da empresa em todos

**Teste:** entrar como agente da Alô. **Passa se** aparecem os três menus, cada um com o que está na tabela.

### `B2G-03` · O link de envio tem três opções
**Complexidade** Baixa · **Substitui a versão 1**

**Critérios de aceitação**
- O construtor de links tem três opções: **Público, VIP e Ministério**
- **Público** gera o link do price checker da empresa
- **VIP** pede o cliente VIP e gera o link pessoal dele
- **Ministério** pede o ministério e a secretária, e gera o link pessoal dela
- Só aparecem as opções dos canais ligados

**Teste:** no construtor da Alô, gerar um link de cada tipo. **Passa se** cada um abre o terminal certo, com a marca certa.

### `B2G-22` · O parceiro cria clientes VIP
**Complexidade** Média · **Decisão `D-9`**

**Critérios de aceitação**
- No menu VIP, o agente cria um cliente: nome, telefone, email
- O cliente recebe um link pessoal, opaco e permanente, com a marca da empresa
- O agente pode desativar um VIP; o link deixa de funcionar e o histórico fica
- O master vê os VIP de todas as empresas no Admin

**Teste:** criar um VIP na Alô e abrir o link dele. **Passa se** abre com a marca da Alô, e o VIP aparece no Admin do master.

### `B2G-23` · Pedir um ministério novo
**Complexidade** Média · **Decisão `D-10`**

**Critérios de aceitação**
- No menu Ministérios, a empresa **pede** um ministério: nome e logótipo
- **A empresa não o cria**: o pedido vai ao master
- No Admin, o master aprova ou recusa, com motivo
- Ao aprovar, o ministério aparece na empresa, com o endereço `/ministerios/<slug>`
- A empresa recebe aviso da decisão

**Teste:** a Alô pede um quarto ministério. **Passa se** fica pendente, aparece ao master, e só depois de aprovado aparece na Alô.

## C · O espaço do ministério

### `B2G-05` · Os três ministérios
**Complexidade** Média

**Critérios de aceitação**
- **Ministério da Saúde**, **Ministério da Educação** e **Ministério das Finanças**, da Alô, com os logótipos de `assets/ministerios/`
- Para o teste, com o prefixo **TESTE** no nome interno e no `slug`, para a limpeza ser uma pesquisa
- Endereços: `alo.weefly.africa/ministerios/teste-saude`, e assim por diante

**Teste:** abrir o menu Ministérios da Alô. **Passa se** os três aparecem, cada um com o logótipo e o nome.

### `B2G-06` · Cada secretária tem o seu acesso
**Complexidade** Média · **Decisões `D-4` e `D-5`**

**Critérios de aceitação**
- A WeeFly ou a empresa cria a secretária no menu Ministérios, ligada a um ministério
- Cada secretária recebe **um link pessoal** e **um PIN de 6 dígitos gerado pelo sistema**, mostrado uma só vez a quem a criou
- Fica registado **quem gerou o PIN**
- PIN esquecido: quem a criou gera um novo, e o antigo deixa de funcionar
- Várias secretárias no mesmo ministério, cada uma com o seu acesso
- Todas veem os pedidos do ministério
- Desativar uma secretária corta o acesso de imediato; o histórico fica

**Teste:** a Alô cria duas secretárias no mesmo ministério, e cada uma faz um pedido. **Passa se** cada uma entra com o seu PIN, o PIN de uma não serve à outra, ambas veem os dois pedidos, e o histórico diz quem fez cada um.

### `B2G-07` · Sem PIN não há pedido
**Complexidade** Baixa

**Critérios de aceitação**
- Sem link pessoal e PIN, não é possível fazer pedidos
- Cinco PIN errados seguidos bloqueiam durante 15 minutos
- A sessão expira após um período sem uso

**Teste:** abrir `alo.weefly.africa/ministerios/teste-saude` sem link pessoal. **Passa se** não é possível fazer nenhum pedido.

### `B2G-08` · O espaço da secretária
**Complexidade** Média

**Critérios de aceitação**
- **Dois logótipos no cabeçalho: Alô e o do ministério**
- *Powered by WeeFly* discreto em baixo
- Três áreas: **Novo pedido**, **Os meus pedidos** e **Passageiros**
- Em *Os meus pedidos*: todos os pedidos do ministério, com o estado e o registo de atividade de cada um
- Ícone da aplicação com o brasão, e o nome do ministério no título
- Instalável no telemóvel

**Teste:** entrar como secretária. **Passa se** aparecem os dois logótipos, as três áreas e o registo de atividade.

### `B2G-25` · Os passageiros ficam guardados
**Complexidade** Média · **Decisão `D-11` · ver a nota sobre `L1` a `L3`**

**Critérios de aceitação**
- Cada passageiro que a secretária regista **fica guardado no espaço do ministério**
- Na área **Passageiros**, a secretária vê, pesquisa e corrige os passageiros do ministério
- Ao preencher os passageiros de um pedido, **escolhe da lista** em vez de escrever tudo de novo, e confirma os dados
- Passaporte a menos de seis meses de expirar fica assinalado
- **Cada registo e cada alteração ficam no Admin**, com quem fez e quando
- Os passageiros de um ministério não aparecem a outro

**Teste:** registar um passageiro num pedido, e depois fazer um segundo pedido com a mesma pessoa. **Passa se** no segundo pedido o passageiro aparece para escolher, já preenchido, e o registo aparece no Admin.

## D · O pedido

### `B2G-09` · Formulário simples
**Complexidade** Média

| Campo | Regra |
|---|---|
| Número de pessoas | Obrigatório, de 1 a 50 |
| De onde | Obrigatório. **Praia por defeito**, editável |
| Para onde | Obrigatório. Lista de aeroportos que já existe |
| Data de ida | Obrigatória, não no passado |
| Data de volta | Opcional; vazia é só ida. Não antes da ida |
| Urgência | Normal · Urgente · Muito urgente. **Normal por defeito** |
| Notas | Opcional |

**Critérios de aceitação**
- Só estes campos. Nenhum dado de passageiro neste passo
- Os campos obrigatórios em falta aparecem listados e destacados
- Enviar cria o pedido e mostra a referência

**Teste:** pedido de 3 pessoas, Praia → Lisboa, ida e volta, com uma nota. **Passa se** só aparecem estes campos e o pedido fica criado.

### `B2G-10` · Pedidos sem limite, todos listados
**Complexidade** Baixa

**Teste:** três pedidos seguidos. **Passa se** os três aparecem a ambas as secretárias do ministério.

### `B2G-11` · Ordem: urgência, depois espera
**Complexidade** Baixa

**Critérios de aceitação**
- Primeiro pela urgência, do mais urgente para o menos
- Dentro da mesma urgência, **o que espera há mais tempo fica em primeiro**
- O agente pode alterar a urgência; fica registado

**Teste:** um pedido Normal, outro Normal, um Urgente. **Passa se** o Urgente fica em primeiro e, entre os Normais, o mais antigo fica à frente.

### `B2G-12` · O pedido chega à empresa e ao master
**Complexidade** Média

**Critérios de aceitação**
- Aparece na fila **Ministérios da empresa** e na fila **do master**
- Sem recarregar, em menos de 5 segundos
- Os dois recebem a notificação

**Teste:** fazer um pedido e olhar para os dois backoffices. **Passa se** aparece nos dois, em poucos segundos.

## E · Tratamento e emissão

### `B2G-13` · Reclamar regista e bloqueia
**Complexidade** Baixa

**Critérios de aceitação**
- Fica registado quem reclamou, e quando
- Depois de reclamado, mais ninguém o pode reclamar; os outros veem *"reclamado por …"*
- Um administrador pode libertar o pedido; fica registado

**Teste:** o Dominik reclama, e um agente da Alô tenta reclamar o mesmo. **Passa se** a Alô vê *"reclamado por Dominik"* e não consegue reclamar.

### `B2G-15` · Ofertas, e a revisão da empresa
**Complexidade** Média · **Decisão `D-2`**

**Critérios de aceitação**
- As ofertas criam-se com o compositor que já existe
- Quando é **um agente da empresa**, envia diretamente à secretária
- Quando é **o master**, o botão é **Enviar à empresa para revisão**. A empresa vê, pode alterar, e envia
- A secretária recebe aviso, vê as ofertas e pode **imprimi-las**

**Teste:** o Dominik prepara ofertas num pedido da Alô. **Passa se** a secretária ainda não as vê; depois de a Alô enviar, vê-as e consegue imprimir.

### `B2G-16` · Escolha e passageiros
**Complexidade** Baixa

**Critérios de aceitação**
- A secretária escolhe uma oferta e preenche um bloco por pessoa, **escolhendo da lista de passageiros guardados** sempre que possível (`B2G-25`)
- O tipo de passageiro sai da data de nascimento
- Os dados chegam ao caso

**Teste:** escolher uma oferta e preencher 3 passageiros, um deles já guardado. **Passa se** o guardado aparece para escolher e os três chegam ao caso.

### `B2G-17` · Sem pagamento na plataforma
**Complexidade** Baixa

**Teste:** percorrer o fluxo da secretária. **Passa se** não aparece nenhum ecrã de pagamento e o caso passa a *pronto a emitir*.

### `B2G-18` · A WeeFly emite
**Complexidade** Baixa · **Reutiliza a emissão**

**Teste:** emitir. **Passa se** os bilhetes aparecem em *Os meus pedidos* da secretária, e a secretária e a empresa recebem aviso.

### `B2G-19` · Tudo fica registado
**Complexidade** Média

**Critérios de aceitação**
- No backoffice da empresa, por ministério: cada pedido, reclamação, oferta, envio, escolha, passageiro registado e emissão, com **hora e autor**
- **No Admin, o master vê o mesmo registo para todas as empresas**
- Filtros por ministério, por secretária e por período
- Exportável

**Teste:** depois do teste completo, abrir o registo de um ministério na Alô e no Admin. **Passa se** cada passo está nos dois, com hora e autor.

## F · Marca e regressão

### `B2G-24` · Os logótipos certos em cada terminal
**Complexidade** Baixa

**Critérios de aceitação**
- **Alô** nos terminais Público e VIP, e no backoffice
- **Alô e o ministério** no espaço da secretária, lado a lado
- O brasão sozinho só no ícone da aplicação. **Em listas e seletores, sempre com o nome**
- *Powered by WeeFly* discreto em todos os terminais da Alô

**Teste:** abrir os três terminais da Alô. **Passa se** cada um tem os logótipos da tabela da secção *Os logótipos*.

### `B2G-26` · O mesmo para qualquer empresa
**Complexidade** Baixa · **Não é trabalho novo: é a prova de que não há nada feito só para a Alô**

**Teste:** ligar o canal Ministérios à WeeFly Global e criar um ministério nela. **Passa se** tudo o que funciona na Alô funciona igual na WeeFly Global, com a marca WeeFly.

### `B2G-04` · O resto fica como está
**Complexidade** Nenhuma · **Regressão**

**Teste:** o ciclo completo do guião de validação, no canal Público. **Passa se** tudo funciona como antes.

---

# Ordem de trabalho

| # | Bloco | Itens |
|---|---|---|
| 0 | **Pré-requisitos** | `OCT-01` a `OCT-04` · `TEN-03` · certificado `*.weefly.africa` |
| 1 | Master e empresas | `B2G-01` `B2G-02` `B2G-20` |
| 2 | Terminal de vendas | `B2G-21` `B2G-03` `B2G-22` |
| 3 | Ministérios e secretárias | `B2G-05` `B2G-23` `B2G-06` `B2G-07` |
| 4 | O espaço da secretária | `B2G-08` `B2G-24` `B2G-09` `B2G-10` |
| 5 | Filas | `B2G-11` `B2G-12` `B2G-13` `B2G-14` |
| 6 | Do envio à emissão | `B2G-15` `B2G-16` `B2G-25` `B2G-17` `B2G-18` |
| 7 | Registo | `B2G-19` |
| 8 | Prova e regressão | `B2G-26` `B2G-04` |

---

# Teste de fecho

| # | Teste | Passou? |
|---|---|---|
| `B2G-01` | O Dominik vê os três módulos, sem empresa | ☐ |
| `B2G-02` | Empresa Teste só com Público não vê o resto | ☐ |
| `B2G-20` | Três empresas no Admin; `mz.weefly.africa` sem aviso | ☐ |
| `B2G-14` | Fila do master com as três empresas e filtro | ☐ |
| `B2G-21` | Três menus no backoffice da Alô | ☐ |
| `B2G-03` | Três tipos de link, cada um no terminal certo | ☐ |
| `B2G-22` | VIP criado pela Alô, visível no Admin | ☐ |
| `B2G-23` | Ministério pedido pela Alô, aprovado pelo master | ☐ |
| `B2G-05` | Três ministérios com logótipo e nome | ☐ |
| `B2G-06` | Duas secretárias, PIN gerado, acessos separados | ☐ |
| `B2G-07` | Sem PIN, não há pedido | ☐ |
| `B2G-08` | Espaço com dois logótipos e três áreas | ☐ |
| `B2G-25` | Passageiro guardado reaparece no pedido seguinte | ☐ |
| `B2G-09` | Formulário só com os campos definidos | ☐ |
| `B2G-10` | Pedidos listados para as duas secretárias | ☐ |
| `B2G-11` | Urgente primeiro, depois o mais antigo | ☐ |
| `B2G-12` | Pedido chega à Alô e ao master | ☐ |
| `B2G-13` | Reclamado pelo Dominik, a Alô não reclama | ☐ |
| `B2G-15` | Ofertas do master passam pela Alô | ☐ |
| `B2G-16` | Passageiros escolhidos da lista | ☐ |
| `B2G-17` | Nenhum ecrã de pagamento | ☐ |
| `B2G-18` | Bilhetes no espaço da secretária | ☐ |
| `B2G-19` | Registo completo na Alô e no Admin | ☐ |
| `B2G-24` | Logótipos certos nos três terminais | ☐ |
| `B2G-26` | O mesmo funciona na WeeFly Global | ☐ |
| `B2G-04` | Canal Público igual ao anterior | ☐ |

---

# Fora deste documento

| Item | Quando |
|---|---|
| Bolsa por ministério, na Carteira | Com o conteúdo da Carteira (`D-8`) |
| Pagamento pela InstaPay | Quando a integração existir |
| Pesquisa integrada pelo Amadeus | Depois do MVP. Quando existir, o concierge do master deixa de ter de fazer a pesquisa pelas empresas |
| Ministérios com pessoas reais | Depois das respostas a `L1`, `L2` e `L3` |
