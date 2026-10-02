# WeeFly · Atualização de 2 de outubro · ponto de situação

| | |
|---|---|
| **Para** | Ivandro |
| **De** | Fábio |
| **Data** | 2 de outubro de 2026 |
| **Base** | `IMPLEMENTACAO.md` do Admilson · 31 itens (`OCT-01` a `OCT-25`, `DOM-01`, `SEO-01` a `SEO-05`) |
| **Estado** | Código escrito e a compilar, **ainda não está no git nem no servidor** |

---

## Em três números

| | % | O que conta |
|---|---|---|
| **Código escrito** | **94%** | 29 dos 31 itens completos no código; os outros 2 estão feitos em parte |
| **No servidor** | **0%** | Ainda não foi feito commit. Vai de manhã para `concierge.weefly.africa` |
| **Testado em produção** | **0%** | Os testes de fecho (`T1` a `T10`) e de SEO (`S1` a `S8`) correm depois do deploy |

> **Importante:** estas alterações estão só na minha máquina, num branch próprio (`update/2026-10-02`). Ainda não foram feitos commits. De manhã faço os commits, ponho-as no servidor AWS (`concierge.weefly.africa`) e só aí se testa tudo.

O que já está verificado na minha máquina:

- O projeto compila sem erros (`next build` e verificação de tipos)
- As três línguas (PT, EN, FR) e as duas do backoffice (PT, EN) têm exatamente as mesmas chaves
- Testes locais aos pontos principais: o link de confirmação já não vai para `localhost`, os favicons e o manifesto respondem, o `robots.txt` fecha o PRO, os links antigos `/m/...` redirecionam

---

## Por secção

| Secção | Itens | Código feito | % |
|---|---|---|---|
| 1 · Criação de conta e entrada | OCT-01 a OCT-09 | 9 de 9 | **100%** |
| 2 · Admin | OCT-10 a OCT-18 | 9 de 9 | **100%** |
| 3 · Agente e backoffice | OCT-19 a OCT-24 | 4 completos, 2 em parte | **83%** |
| 4 · Domínios | DOM-01 | código feito, falta DNS e certificado | **100% no código** |
| 5 · Favicon, ícones e SEO | SEO-01 a SEO-05 | 5 de 5 | **100%** |
| **Total** | **31** | **29 completos + 2 em parte** | **94%** |

---

## O mais importante: o login e a criação de conta (P0)

Os quatro bloqueios do teste de 1 de outubro têm causa encontrada e correção feita:

| ID | O que estava mal | O que mudou |
|---|---|---|
| `OCT-01` | O link de confirmação acabava em `localhost:3000` | Atrás do NGINX, o servidor via o próprio endereço interno. Agora usa o endereço por onde a pessoa chegou |
| `OCT-02` | Carregar em Entrar não fazia nada | O botão responde sempre: password errada, email por confirmar (com *Reenviar confirmação*), demasiadas tentativas, ou erro. Não envia duas vezes |
| `OCT-03` | Conta aprovada não entrava | Corrigido com o `OCT-01` e o `OCT-02`. Depois de entrar abre o `/modulo` |
| `OCT-04` | O email de recuperar a password não chegava | Os dois ecrãs de recuperação nunca tinham sido ligados ao servidor. Agora pedem o email e gravam a password nova |

---

## Item a item

| ID | Estado | Nota |
|---|---|---|
| `OCT-01` · `OCT-02` · `OCT-03` · `OCT-04` | ✅ Feito | Ver em cima |
| `OCT-05` · Conta pendente | ✅ Feito | Mostra "A sua conta está à espera de aprovação", com um formulário para escrever à equipa e o email de contacto |
| `OCT-06` · Alterar email | ✅ Feito | A opção saiu. Ficam *Reenviar email* e *Voltar ao início de sessão* |
| `OCT-07` · Email por escrito | ✅ Feito | "Enviámos um email para **nome@exemplo.com**. Clique no link para ativar a sua conta." |
| `OCT-08` · "Email confirmado" real | ✅ Feito | Já vinha do Supabase. Acrescentei *Reenviar confirmação* quando ainda não está confirmado |
| `OCT-09` · Travessões | ✅ Feito | ~290 frases corrigidas nos dicionários, nos emails e no PDF do bilhete |
| `OCT-10` · Recusar | ✅ Feito | Janela com nota obrigatória e a confirmação "Esta decisão não pode ser desfeita" |
| `OCT-11` · Aprovar | ✅ Feito | Email "A sua conta WeeFly PRO foi aprovada" com botão para entrar |
| `OCT-12` · Subdomínio | ✅ Feito | Diz *disponível* ou *ocupado* enquanto se escreve. Nomes reservados recusados |
| `OCT-13` · Logótipo da empresa | ✅ Feito | Upload de logótipo, ícone e imagem de partilha, cores, com pré-visualização do separador e do WhatsApp |
| `OCT-14` · Alô | ✅ Feito | Fica criada pela migração `0031`, com o logótipo, o ícone e as cores do pacote. NIF, morada, remetente e WhatsApp preenchem-se no ecrã |
| `OCT-15` · Dashboard do Admin | ✅ Feito | Primeiro menu: contas à espera, parceiros, casos abertos, emitidos no mês, alertas de saldo |
| `OCT-16` · Seletor de módulo | ✅ Feito | Um botão que abre a lista. Fornecedor continua com cadeado |
| `OCT-17` · Clientes no Admin | ✅ Feito | Todos os parceiros, com filtro e pesquisa por nome, telefone e email |
| `OCT-18` · `/modulo` depois de entrar | ✅ Feito | O último módulo usado fica destacado |
| `OCT-19` · Menu lateral | 🟡 Em parte | Nas Passagens já aparece, recolhido em ícones, e guarda a escolha. Falta nos ecrãs de escolha de módulo e de conta pendente |
| `OCT-20` · Price checker lento | 🟡 Em parte | Tirei os dois ecrãs de carregamento que tapavam o link do cliente (pelo menos 2,4 s) e reduzi o logótipo da Alô de 674 KB para 70 KB. Falta medir com Lighthouse no servidor |
| `OCT-21` · Notificações | ✅ Já estava | A correção já estava no código; o servidor está numa versão anterior. Fica resolvido com o deploy |
| `OCT-22` · Arquivar | ✅ Feito | Botão *Arquivar* em cada linha da fila, com motivo |
| `OCT-23` · Tutorial | ✅ Feito | Ícone ao lado do sino, com um guia por ecrã |
| `OCT-24` · Perfil | ✅ Já estava | Corrigi o link *Perfil* nas Passagens |
| `DOM-01` · Endereços novos | ✅ Código feito | A empresa sai do subdomínio, `/admin` e `/ministerios` por empresa, 404 numa empresa de outra conta, página própria para empresa inexistente |
| `SEO-01` a `SEO-05` | ✅ Feito | Favicon e ícones por empresa (gerados a partir do ícone carregado), título, descrição e imagem de partilha por empresa, só a página inicial do price checker é indexada |

---

## O que acontece amanhã

1. **De manhã:** commits e envio para o servidor AWS (`concierge.weefly.africa`)
2. **Base de dados:** aplicar a migração nova `0031` (marca, SEO e a Alô)
3. **Testar no servidor:** criar conta nova, confirmar o email, entrar pendente, aprovar, entrar aprovada, password errada, recuperar password, recusar outra conta (`T1` a `T9`)
4. **Medir:** o link do price checker num telemóvel, para o `OCT-20` (`T10`)

### O que não dá para testar ainda em `concierge.weefly.africa`

Os endereços novos (`pro.weefly.africa`, `alo.weefly.africa`, `weefly.africa/pc`) dependem de duas coisas que não são código:

- **DNS e certificado wildcard** `*.weefly.africa` (pedido ao Sarin)
- **Configuração do NGINX**, já escrita em `deploy/nginx/weefly-dom01.conf`, à espera da confirmação de como está o site público (decisão Q4)

Até lá tudo continua a funcionar em `concierge.weefly.africa` como hoje. Os testes de favicon e partilha da Alô (`S2`, `S4`, `S6`) ficam para quando os endereços novos existirem.

---

## Por decidir

| # | Pergunta | Proposta |
|---|---|---|
| Q1 | Ministérios sem código secreto no link? | Mantive o código: `/ministerios/saude/<código>`. Sem ele, qualquer pessoa que soubesse o nome do ministério abria a aplicação |
| S2 | Os links antigos de `weefly.duckdns.org` redirecionam? | Não fiz redirecionamento, porque a plataforma ainda não foi lançada |
