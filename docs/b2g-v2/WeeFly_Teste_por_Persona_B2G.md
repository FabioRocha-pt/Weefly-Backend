# WeeFly · Teste por persona · B2G e B2C

| | |
|---|---|
| **Para** | Ivandro, que corre o teste · Fábio, que faz a limpeza e prepara as contas |
| **Base** | `WeeFly_B2G_Ministerios_v2.md` |
| **Tempo** | Cerca de 1 hora e meia, depois da limpeza e da preparação |
| **Personas** | 6 |
| **Ligações entre personas** | 9 · `L1` a `L9` |

---

## Para que serve

Um teste por requisito diz se cada peça existe. Este diz **se o pedido passa de mão em mão sem se perder**.

O B2G é uma conversa entre pessoas: a secretária pede, o agente reclama, o Dominik apoia, a WeeFly emite. Cada vez que o pedido muda de mãos há uma **ligação**, e cada ligação tem o seu ID. Se alguma coisa falhar, o resultado diz em que ligação foi, e o Fábio sabe onde procurar.

Cada persona tem também uma lista do que **não pode ver**. Num sistema com vários parceiros, isso é tão importante como o que pode.

---

## O mapa das ligações

```
                    ┌─────────────────────┐
                    │  Dominik · master   │
                    │  Admin · suporte    │
                    └──┬──────▲──────┬────┘
                L2 ·   │  L3  │      │ L7 · emite
              reclama  │      │      │
                       ▼      │      ▼
┌────────────────┐  L1  ┌─────┴──────────┐  L4  ┌──────────────────┐
│  Secretária A  │─────▶│  Agente da Alô │─────▶│  Secretária A    │
│  pede          │      │  fila B2G      │      │  vê as ofertas   │
└───────┬────────┘      └───────▲────────┘      └────────┬─────────┘
        │ L5 · mesmo            │ L6 · escolha            │
        │ ministério            │ e passageiros           │
        ▼                       │                         │
┌────────────────┐              └─────────────────────────┘
│  Secretária B  │
└────────────────┘

L8 · tudo fica no registo da Alô
L9 · o master liga e desliga o B2G parceiro a parceiro · Empresa Teste fica sem ele
```

| ID | De | Para | O que passa | Onde aparece |
|---|---|---|---|---|
| `L1` | Secretária | Alô **e** WeeFly | O pedido novo | Fila B2G da Alô · área de suporte da WeeFly · notificação nos dois |
| `L2` | Alô ou Dominik | O outro | Quem reclamou | *"Reclamado por …"*, e o outro deixa de poder reclamar |
| `L3` | Dominik | Alô | As ofertas, para rever | Caso da Alô, à espera de revisão |
| `L4` | Alô | Secretária | As ofertas | Mini-app da secretária · aviso |
| `L5` | Secretária A | Secretária B | Os pedidos do ministério | *Os meus pedidos* das duas |
| `L6` | Secretária | Alô e WeeFly | A escolha e os passageiros | Caso passa a *pronto a emitir* |
| `L7` | Dominik | Secretárias e Alô | Os bilhetes | *Os meus pedidos* · aviso aos dois |
| `L8` | Todos | Registo da Alô | Cada passo, com hora e autor | Registo do ministério |
| `L9` | Master | Parceiros | A ferramenta ligada ou desligada | O que cada parceiro vê |

---

## Passo 0 · Limpeza

**Faz o Fábio, verifica o Ivandro.** Sem isto, os casos antigos misturam-se com os novos e não se percebe o que veio de onde.

### O Fábio limpa

| O quê | Como estava a 28 de setembro |
|---|---|
| Casos de teste antigos | Até 52 dias, nas filas *Comprovativos por validar*, *Pagos sem bilhete*, *Novos sem dono* e *A cotar* |
| Casos *TESTE MIGRAÇÃO* | Do guião de validação |
| Emissões de teste | **€400 a contar em *Emitidos este mês*** |
| Notificações | O ×292 e as 52 por ver |
| Contas de teste antigas | As que já não vão ser usadas |

**Combina com o Fábio:** apagar, ou arquivar com um motivo *"teste"*. Arquivar deixa rasto; apagar deixa os números limpos. Para os números financeiros, **apagar é melhor**.

### O Ivandro verifica

| Verificação | Está certo se |
|---|---|
| Todas as filas do Price Checker | **0** em cada uma |
| O sino | **0** por ver, e o painel vazio |
| *Emitidos este mês* | **0** e **€0** |
| A lista de casos, filtro *Tudo* | Vazia, ou só com casos reais que o Fábio decidiu manter |

**A regra para o teste:** tudo o que se criar a seguir começa por **TESTE**. Nomes, ministérios, empresas. Assim a próxima limpeza é uma pesquisa.

---

## Passo 1 · Preparação

**Faz o Fábio** os ministérios e as contas. **As secretárias cria-as o agente da Alô durante o teste**, no menu Ministérios: é parte do que se testa.

### As contas

| Persona | Conta | Quem cria |
|---|---|---|
| **Dominik** | `dominik@weefly.africa`, master | O próprio, pelo registo; o Fábio torna-a master |
| **Agente da Alô** | Uma conta de agente na Alô | O Fábio, ou pelo registo e aprovação no Admin |
| **Secretária A** | Link pessoal e PIN · *TESTE Saúde* | **O agente da Alô**, no menu Ministérios, que gera o PIN |
| **Secretária B** | Link pessoal e PIN · *TESTE Saúde* | **O agente da Alô**, no menu Ministérios, que gera o PIN |
| **Empresa Teste** | Uma conta de agente na Empresa Teste | O Fábio |
| **Cliente B2C** | Nenhuma: o price checker público não pede conta | Ninguém |

### Os dados

| O quê | Valor |
|---|---|
| Ministérios | **TESTE Ministério da Saúde · da Educação · das Finanças**, com os logótipos reais de `assets/ministerios/` |
| Secretárias | **A** e **B** no *TESTE Saúde*. Nenhuma nos outros dois |
| Canais | Alô com **Público, VIP e Ministérios** · Empresa Teste **só com Público** |
| Emails | Reais, para veres os avisos. Um Gmail por persona, se der |

### As janelas

**Uma janela por persona, todas abertas ao mesmo tempo.** Perfis diferentes do Chrome, ou janelas anónimas de browsers diferentes. Só assim se veem os pedidos a chegar sem recarregar, e o bloqueio quando duas pessoas reclamam o mesmo.

Põe o nome da persona no título de cada janela, ou numa nota ao lado. Com seis janelas abertas, é fácil carregar no sítio errado.

---

## Passo 2 · As fichas das personas

Antes do cenário, cada persona entra sozinha e confirma o que vê e o que não vê.

### Dominik · master

**Entra por** `pro.weefly.africa`

| Tem de ver | Não pode ver |
|---|---|
| Os três módulos: Fornecedor, Agente e **Admin** | |
| No Admin: parceiros, validação de contas, ministérios, **área de suporte** | |
| Na área de suporte: os pedidos **de todos os parceiros com a ferramenta ligada** | |
| A Alô e a Empresa Teste como parceiros | |

### Agente da Alô

**Entra por** `alo.weefly.africa/admin`

| Tem de ver | Não pode ver |
|---|---|
| **A marca da Alô** no login e no backoffice | O módulo **Admin** |
| Fornecedor e Agente; dentro do Agente, só **Passagens**, **Cliente** e **Carteira** | Os menus Carros, Casas, Experiências e Comida |
| A fila B2G e os três ministérios, **sem botão para criar** | **Nenhum caso da WeeFly** |
| Os menus **Público, VIP e Ministérios**, e o construtor de links com as três opções | **Nenhum caso da Empresa Teste** |

### Secretária A · TESTE Saúde

**Entra por** o seu link pessoal, com o PIN

| Tem de ver | Não pode ver |
|---|---|
| **Dois logótipos: Alô e o do ministério** | Pedidos de outros ministérios |
| **Novo pedido**, **Os meus pedidos** e **Passageiros** | Custos, margens ou notas internas da Alô |
| *Powered by WeeFly* discreto em baixo | Nenhum passo de pagamento |

### Secretária B · TESTE Saúde

**Entra por** o seu link pessoal, **com outro PIN**

| Tem de ver | Não pode ver |
|---|---|
| O mesmo que a Secretária A | O mesmo que a Secretária A |
| **O seu próprio acesso**: o PIN da A não serve para entrar | |

### Empresa Teste · o controlo

**Entra por** `pro.weefly.africa`

| Tem de ver | Não pode ver |
|---|---|
| O seu backoffice, com a sua marca, e o menu Público | **Nada de VIP nem de ministérios**: nem menus, nem pedidos, nem essas opções no construtor de links |
| | **Nenhum caso da Alô nem da WeeFly** |

### Cliente B2C

**Entra por** `weefly.africa/pc`

| Tem de ver | Não pode ver |
|---|---|
| O price checker de sempre, com a marca WeeFly | Nada do B2G |
| | Nenhuma página do site de reservas, nem de erro |

> **Esta persona dá para testar já.** Não depende dos problemas de login nem do isolamento. Se o `weefly.africa/pc` ainda abrir a página de erro, anota e testa em `concierge.weefly.africa/pc`.

---

## Passo 3 · O cenário ligado

Os passos seguem o pedido. Cada passo diz **que persona age**, e quando há passagem de mãos, **que ligação** se está a testar.

### Os pedidos

**3.1 · Secretária A** · Faz um pedido: **4 pessoas, Praia → Lisboa, ida e volta, Normal**, com a nota *"TESTE · conferência"*.

**Está certo se:** o formulário só tem os campos definidos, a Praia já vem preenchida, e o pedido fica criado com referência.

**3.2 · Secretária B** · Faz um pedido: **2 pessoas, Praia → Dakar, só ida, Urgente**, com a nota *"TESTE · missão"*.

**3.3 · Secretária A** · Abre *Os meus pedidos*. · `L5`

**Está certo se:** vê **os dois pedidos**, incluindo o da colega, e cada um diz quem o fez.
**Está errado se:** só vê o seu.

### A chegada

**3.4 · Agente da Alô** · Olha para a fila B2G **sem recarregar**. · `L1`

**Está certo se:** os dois pedidos aparecem sozinhos, **o Urgente em primeiro**, e chegou uma notificação.
**Está errado se:** só aparecem depois de recarregar, ou a ordem é por data.

**3.5 · Dominik** · Olha para a área de suporte **sem recarregar**. · `L1`

**Está certo se:** os mesmos dois pedidos, a mesma ordem, e a indicação de que são da **Alô**.

### O bloqueio

**3.6 · Dominik** · Reclama o pedido **Urgente**.
**3.7 · Agente da Alô** · Tenta reclamar o mesmo pedido. · `L2`

**Está certo se:** vê *"reclamado por Dominik"* e **o botão de reclamar não está disponível**.
**Está errado se:** consegue reclamar, ou o pedido fica com dois donos.

**3.8 · Agente da Alô** · Reclama o pedido **Normal**. · `L2`

**Está certo se:** o Dominik vê *"reclamado por"* o agente da Alô.

### As ofertas pelo suporte

**3.9 · Dominik** · No pedido Urgente, cria **duas ofertas** e carrega em **Enviar ao parceiro para revisão**. · `L3`

**Está certo se:** o botão diz *enviar ao parceiro*, não *enviar ao cliente*.

**3.10 · Secretária B** · Abre *Os meus pedidos*.

**Está certo se:** **ainda não vê as ofertas**. Estão com a Alô.
**Está errado se:** já as vê. O suporte saltou a revisão do parceiro.

**3.11 · Agente da Alô** · Abre o pedido Urgente, revê as ofertas, muda uma nota, e envia à secretária. · `L4`

**Está certo se:** consegue ver e alterar antes de enviar.

**3.12 · Secretária B** · Abre *Os meus pedidos*. · `L4`

**Está certo se:** as duas ofertas aparecem, **com as alterações da Alô**, chegou um aviso, e consegue **imprimir**.

### As ofertas da Alô

**3.13 · Agente da Alô** · No pedido Normal, cria uma oferta e envia diretamente à secretária. · `L4`

**3.14 · Secretária A** · Abre o pedido Normal.

**Está certo se:** vê a oferta, chegou o aviso.

### A escolha

**3.15 · Secretária A** · No pedido **Urgente da colega**, escolhe uma oferta e preenche os **2 passageiros**. · `L5` `L6`

**Está certo se:** consegue tratar o pedido da colega, e o caso passa a *pronto a emitir* para o Dominik e para a Alô.

**3.16 · Secretária A** · Verifica que **não aparece nenhum ecrã de pagamento**.

### A emissão

**3.17 · Dominik** · Emite os bilhetes do pedido Urgente. · `L7`

**Está certo se:** o ecrã de emissão tem os blocos certos para um voo só de ida, com 2 passageiros.

**3.18 · Secretária B** · Abre o pedido. · `L7`

**Está certo se:** os 2 bilhetes estão lá para descarregar, e chegou um aviso.

**3.19 · Agente da Alô** · Abre o pedido. · `L7`

**Está certo se:** vê que foi emitido, por quem e quando.

### O registo

**3.20 · Agente da Alô** · Abre o registo do *TESTE Saúde*. · `L8`

**Está certo se:** está lá cada passo dos dois pedidos, com **hora e autor**: as duas secretárias, o agente e o Dominik.

| Tem de aparecer, com hora e autor |
|---|
| Pedido criado pela Secretária A · Pedido criado pela Secretária B |
| Reclamado pelo Dominik · Reclamado pelo agente da Alô |
| Ofertas preparadas pelo Dominik · revistas e enviadas pela Alô |
| Oferta enviada pela Alô |
| Escolha e passageiros pela Secretária A |
| Emitido pelo Dominik |

---

## Passo 4 · Os testes do que não se pode ver

Fazem-se no fim, com tudo criado. **São os mais importantes do teste.**

| # | Persona | Tenta | Está certo se |
|---|---|---|---|
| 4.1 | **Empresa Teste** | Ver os menus VIP ou Ministérios, ou essas opções no construtor de links | **Não vê nada disto** · `L9` |
| 4.2 | **Empresa Teste** | Procurar os casos *TESTE* na sua lista | Não aparecem |
| 4.3 | **Agente da Alô** | Ver casos B2C da WeeFly | Não aparecem |
| 4.4 | **Agente da Alô** | Abrir o endereço de um caso da WeeFly, copiado da janela do Dominik | **Página não encontrada**, não o caso |
| 4.5 | **Secretária A** | Abrir o endereço de um pedido de outro ministério | Página não encontrada |
| 4.6 | **Secretária A** | Ver custos ou notas internas nas ofertas | Não aparecem |
| 4.7 | **Qualquer pessoa** | Abrir `alo.weefly.africa/ministerios/teste-saude` sem link pessoal | Não consegue fazer pedidos |
| 4.8 | **Secretária B** | Errar o PIN cinco vezes | Fica bloqueada 15 minutos |

> O 4.4 e o 4.5 são o teste do isolamento a sério: não basta não mostrar na lista. **Mesmo com o endereço exato, não pode abrir.**

---

## Passo 5 · Cliente B2C · regressão

Pode correr **já**, antes de tudo o resto.

- **1.** Abre `weefly.africa/pc`. Se ainda der a página de erro, anota e usa `concierge.weefly.africa/pc`.
- **2.** Faz o ciclo B2C completo, do guião de validação: pedido, oferta, escolha, passageiros, link de pagamento, comprovativo, emissão.

**Está certo se:** tudo funciona como antes, e **nenhum caso B2C aparece à Alô**.

---

## Resultado

### Por persona

| Persona | Entrou | Vê o que deve | Não vê o que não deve |
|---|---|---|---|
| Dominik | ☐ | ☐ | ☐ |
| Agente da Alô | ☐ | ☐ | ☐ |
| Secretária A | ☐ | ☐ | ☐ |
| Secretária B | ☐ | ☐ | ☐ |
| Empresa Teste | ☐ | ☐ | ☐ |
| Cliente B2C | ☐ | ☐ | ☐ |

### Por ligação

**Esta é a tabela que diz onde estão os problemas.**

| Ligação | O que passa | Passou? | Passo | Nota |
|---|---|---|---|---|
| `L1` | Pedido chega à Alô e à WeeFly, sem recarregar | ☐ | 3.4 · 3.5 | |
| `L2` | Reclamar regista e bloqueia | ☐ | 3.7 · 3.8 | |
| `L3` | Ofertas do Dominik vão primeiro à Alô | ☐ | 3.9 · 3.10 | |
| `L4` | Ofertas da Alô chegam à secretária | ☐ | 3.12 · 3.14 | |
| `L5` | As duas secretárias partilham os pedidos | ☐ | 3.3 · 3.15 | |
| `L6` | Escolha e passageiros chegam ao caso | ☐ | 3.15 | |
| `L7` | Bilhetes chegam às secretárias e à Alô | ☐ | 3.18 · 3.19 | |
| `L8` | Registo completo, com hora e autor | ☐ | 3.20 | |
| `L9` | Empresa Teste sem B2G não vê nada | ☐ | 4.1 | |

### Isolamento

| # | Passou? |
|---|---|
| 4.1 a 4.8 | ☐ ☐ ☐ ☐ ☐ ☐ ☐ ☐ |

Para cada falha: **o passo, a persona, a hora e uma captura.** Com a hora, o Fábio encontra o erro nos registos do servidor.

---

## O que já dá para testar, e o que não

| Parte | Hoje? | Porquê |
|---|---|---|
| Passo 0 · limpeza | ✅ | Só depende do Fábio |
| Passo 5 · cliente B2C | ✅ | Não depende de login nem de isolamento |
| Ficha do Dominik | 🔴 | Não tem conta, e o registo está partido (`OCT-01` a `OCT-04`) |
| Agente da Alô | 🔴 | As contas da Alô estão bloqueadas até ao `TEN-03` |
| Secretárias | 🔴 | A mini-app e o PIN ainda não estão construídos |
| Empresa Teste | 🟡 | Entra, mas o teste só faz sentido com o B2G ligado à Alô |
| Cenário ligado e isolamento | 🔴 | Precisa de todas as personas |

**A sequência:** limpeza e cliente B2C agora · o resto quando o Fábio fechar os pré-requisitos do documento B2G.
