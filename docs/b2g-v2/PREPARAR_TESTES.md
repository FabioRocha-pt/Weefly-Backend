# WeeFly · Preparar o teste por persona

| | |
|---|---|
| **Para** | Fábio |
| **De** | Ivandro |
| **Objetivo** | O Ivandro começa a testar **amanhã** |
| **Neste pacote** | Este ficheiro · `weefly_test_fixtures.json` · os logótipos dos três ministérios em `assets/ministerios/` |
| **Ler com** | `WeeFly_Teste_por_Persona_B2G.md` · `WeeFly_B2G_Ministerios_v2.md` |

---

## O que é para amanhã, e o que não é

Sejamos claros desde já, para ninguém esperar o que não pode estar pronto:

| Parte do teste | Amanhã? | Porquê |
|---|---|---|
| **Limpeza** · `P-01` | ✅ | Só depende de ti |
| **Conta master do Dominik** · `P-02` | ✅ | Criada diretamente, sem passar pelo registo partido |
| **Empresa Teste** · `P-04` | ✅ | Já existe |
| **Cliente B2C** · regressão | ✅ | Não depende de nada |
| **Agente da Alô** · `P-03` | 🔴 | Só depois do `TEN-03`. Hoje as contas da Alô estão bloqueadas, e bem |
| **Ministérios** · `P-05` | 🔴 | A entidade ministério ainda não existe na base de dados (`PAR-02`) |
| **Secretárias** · `P-06` | 🔴 | A mini-app e o PIN ainda não estão construídos (`B2G-06` a `B2G-08`) |

**Se conseguires só os quatro primeiros, amanhã já se testa:** a limpeza, a entrada do Dominik, a Empresa Teste e o ciclo B2C. O resto entra à medida que for ficando pronto, pela ordem do documento B2G.

---

## Regras de segurança

A limpeza é feita **na base de dados de produção**. Estas regras não são opcionais.

1. **Cópia de segurança antes de apagar.** Um ponto de restauro no Supabase, ou um `pg_dump`, com a data no nome. Se não for possível, **não se apaga nada**: arquiva-se
2. **Primeiro a lista, depois o `DELETE`.** Corre a seleção do que vai ser apagado, conta as linhas por tabela, e envia a lista ao Ivandro **antes** de apagar
3. **Só se apaga o que o Ivandro confirmar.** Se um caso parecer real, fica
4. **Nada de passwords em ficheiros**, nem neste pacote, nem no repositório, nem no Slack
5. **Os comandos são gerados sobre o esquema real.** Este documento diz o que fazer. Os nomes das tabelas e colunas são os teus

---

## `P-01` · Limpeza

### O que limpar

| O quê | Como reconhecer | Estado a 28 de setembro |
|---|---|---|
| Casos de teste antigos | Criados pela equipa durante os testes | Até 52 dias, em várias filas |
| Casos *TESTE MIGRAÇÃO* | Pelo nome | Do guião de validação |
| Emissões de teste | Ligadas aos casos acima | **€400 em *Emitidos este mês*** |
| Notificações | Ligadas aos casos acima, mais o ×292 | 52 por ver |
| Comprovativos | Ficheiros guardados dos casos acima | Apagar também os ficheiros, não só o registo |
| Contas de teste antigas | Que já não vão ser usadas | Confirmar com o Ivandro |

**Ficam sempre:** a tua conta, a do Ivandro, a do Admilson (`ADM-09`), os parceiros WeeFly, Alô e Empresa Teste, e **qualquer caso que possa ser real**.

### Como fazer

| # | Passo |
|---|---|
| 1 | Cópia de segurança, com a data no nome |
| 2 | Lista dos casos a apagar: referência, nome, data, estado |
| 3 | Contagem do que sai em cada tabela: casos, ofertas, passageiros, emissões, notificações, ficheiros, registo |
| 4 | **Envia ao Ivandro a lista e as contagens. Espera a confirmação** |
| 5 | Apaga, dentro de uma transação. Se alguma contagem não bater certo, reverte |
| 6 | Confirma que as estatísticas do backoffice voltaram a zero |

### Como o Ivandro verifica

| Verificação | Está certo se |
|---|---|
| Todas as filas do Price Checker | **0** em cada uma |
| O sino | **0** por ver, painel vazio |
| *Emitidos este mês* | **0** e **€0** |
| Filtro *Tudo* | Vazio, ou só com casos que ficaram de propósito |

---

## `P-02` · Conta master do Dominik

O registo está partido (`OCT-01` a `OCT-04`), por isso a conta **cria-se diretamente**.

**Critérios**
- Conta `dominik@weefly.africa`, parceiro WeeFly, perfil **master**
- Módulos: **Fornecedor, Agente e Admin**
- Estado aprovado, sem passar pela fila de validação
- **A password não é escolhida por ti.** Envias ao Dominik um link para ele a definir. Se o email de recuperação ainda não chegar (`OCT-04`), combinam outra forma que não deixe a password escrita em lado nenhum

**Teste:** o Dominik entra em `pro.weefly.africa` e vê os três módulos.

---

## `P-03` · Agente da Alô

**Depende do `TEN-03`.** Não cries a conta antes: ficaria bloqueada à entrada, e um teste falhado por bloqueio não diz nada.

**Quando o `TEN-03` estiver feito**
- Conta do agente com os dados de `contas` no ficheiro, parceiro **Alô**
- Menus do Agente: **Passagens, Cliente e Carteira**
- Ferramenta Viagens com **B2C e B2G ligados** na Alô, para se poder testar a escolha no construtor de links (`B2G-03`). Em produção pode ficar só com B2G: confirmar com o Ivandro

---

## `P-04` · Empresa Teste

Já existe. É **o controlo** do teste.

**Critérios**
- Uma conta de agente, com os dados do ficheiro
- Ferramenta Viagens com **B2C ligado e B2G desligado**
- Ao entrar, não vê nada do B2G nem da Alô

---

## `P-05` · Ministérios

**Depende do `PAR-02`**, a entidade ministério.

**Quando existir**
- Os três ministérios do ficheiro, todos da **Alô**: *TESTE Ministério da Saúde*, *da Educação* e *das Finanças*
- Com os logótipos reais em `assets/ministerios/`: o horizontal para o cabeçalho, o brasão para o ícone
- Endereços: `alo.weefly.africa/ministerios/teste-saude`, e assim por diante
- A Alô vê-os, mas **não os pode criar**

> **Os três brasões são iguais**: é o emblema nacional. Em listas e seletores, o brasão leva sempre o nome do ministério ao lado.

---

## `P-06` · Secretárias

**Não as cries tu.** Na versão 2 é o agente da Alô que as cria no menu Ministérios, e o sistema gera o PIN. Criá-las é parte do teste.

**Depende do espaço da secretária e do PIN** (`B2G-06` a `B2G-08`).

**Quando existirem**
- *TESTE Secretária A* e *TESTE Secretária B*, as duas no **TESTE Saúde**
- Cada uma com o seu link pessoal. O PIN é definido por elas no primeiro acesso
- **Nenhuma secretária** nos outros dois ministérios: é isso que permite testar o 4.5, um pedido de outro ministério

---

## Os emails

O ficheiro usa endereços do tipo `<gmail>+alo@gmail.com`. **No Gmail, tudo o que vem depois do `+` é ignorado na entrega**: os avisos das seis personas chegam à mesma caixa do Ivandro, e o `+` mostra para quem era cada um. O Ivandro substitui `<gmail>` pelo endereço dele antes de correres o script.

---

## Para fechar amanhã de manhã

Envia ao Ivandro, numa mensagem:

| | |
|---|---|
| ☐ | Limpeza feita, com as contagens do que saiu |
| ☐ | Conta do Dominik criada e o link para definir a password enviado |
| ☐ | Empresa Teste com B2G desligado |
| ☐ | O que ficou bloqueado, e por qual pré-requisito |
| ☐ | Os endereços de teste a usar, se algum mudou |

Com isto, o Ivandro corre os passos 0 e 5 do guião, as fichas do Dominik e da Empresa Teste, e o teste de fecho dos `OCT-01` a `OCT-04` que corrigires.
