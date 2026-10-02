# WeeFly · Próxima atualização · correções, domínios, favicon e SEO

| | |
|---|---|
| **Para** | Fábio |
| **De** | Admilson Borges |
| **Data** | 2 de outubro de 2026 |
| **Base** | Teste em produção de 1 de outubro (`concierge.weefly.africa`) |
| **Ler com** | `WeeFly_MVP2_Para_Developer.md` · `WeeFly_Correcoes_e_Funcionalidades_28Set.md` |
| **Stack** | Next.js 14 · Supabase · Resend · PM2 · NGINX no EC2 |
| **Âmbito** | 25 correções (`OCT-01` a `OCT-25`) · domínios (`DOM-01`) · favicon e SEO (`SEO-01` a `SEO-05`) |
| **Pacote** | Este ficheiro + `assets/` (favicons, ícones e imagens de partilha prontos) + `capturas/` (prints do teste) |

---

## Como usar este documento

> **Nota para o assistente de código (Claude Opus 5.5) que vai implementar isto.**
> Lê o documento inteiro antes de mexer em código. Trabalha pela ordem da secção *Ordem de trabalho*. Os **critérios de aceitação são a definição de feito**: um item só fecha quando todos passam. Onde um valor ou uma decisão não está escrita aqui (marcado ⚠), **não inventes**: deixa configurável e assinala no resumo final. Antes de alterar um ficheiro, confirma no código como a funcionalidade está hoje; as indicações de *onde procurar* são pistas, não certezas.
> No fim, entrega um resumo por ID: feito, feito em parte (o que falta) ou não feito (porquê).

Usa o ID nos commits e nos branches: `fix/OCT-01-confirmacao-localhost`, `feat/SEO-02-metadados-por-empresa`.

**Prioridades**

| Prioridade | Quer dizer |
|---|---|
| **P0** | Bloqueia. Ninguém consegue criar conta ou entrar. Primeiro de tudo |
| **P1** | Tem de estar feito antes de abrir contas reais à Alô e a outras empresas |
| **P2** | Melhoria de uso. Entra se houver tempo |

**Regra de texto em todo o produto:** nenhum travessão longo `—` em emails, WhatsApp, ecrãs ou notificações (`OCT-09`).

---

## Ordem de trabalho

| Passo | Itens | Porquê aqui |
|---|---|---|
| 1 | `OCT-01` `OCT-02` `OCT-03` `OCT-04` | Sem isto ninguém cria conta nem entra |
| 2 | `OCT-05` a `OCT-08` · `OCT-10` `OCT-11` | Fecha o ciclo registo → aprovação → entrada |
| 3 | `DOM-01` · `OCT-12` | Nova estrutura de endereços. Passa pela mesma configuração do passo 1 |
| 4 | `OCT-13` `OCT-14` · `SEO-01` a `SEO-05` (= `OCT-25`) | Marca de cada empresa: logótipo, favicon, imagens de partilha, metadados |
| 5 | `OCT-17` `OCT-20` `OCT-21` | Restantes P1 |
| 6 | `OCT-09` `OCT-15` `OCT-16` `OCT-18` `OCT-19` `OCT-22` `OCT-23` `OCT-24` | P2 |
| 7 | Teste de fecho (`T1`–`T10`) e testes de SEO (`S1`–`S8`) | Em produção, com conta nova e email real |

---

# 1 · Criação de conta e entrada

### `OCT-01` · O link de confirmação do email leva a localhost · **P0**
Ligado a: `PRO-08` · `MIG-02` · `ENV-01` · Captura: `capturas/OCT-01_email-confirmacao.png`

**Hoje:** o email chega; o botão aponta para `https://concierge.weefly.africa/auth/callback?token_hash=…&type=signup`, mas depois do callback acaba em `https://localhost:3000/email-confirmado`.

**Critérios de aceitação**
- O link abre a página de email confirmado no endereço de produção, nunca em `localhost`
- O endereço base vem da configuração de cada ambiente: produção leva a produção, desenvolvimento (`weefly.duckdns.org`) leva a desenvolvimento
- Testado em Gmail, Outlook e num domínio empresarial

**Verificar primeiro:** no Supabase › Authentication › URL Configuration, o *Site URL* e as *Redirect URLs*; no código, o `emailRedirectTo` do `signUp`, o redirecionamento feito em `/auth/callback` e a variável de endereço base (ex.: `NEXT_PUBLIC_SITE_URL`). Procurar `localhost:3000` no código, nos `.env*` do servidor e nos modelos de email.

### `OCT-02` · Carregar em Entrar não faz nada · **P0**
Ligado a: `PRO-01` · `TEN-06`

**Hoje:** com email e password de uma conta criada (pendente ou já aprovada), carregar em *Entrar* não faz nada: não entra, não mostra erro, não mostra carregamento.

**Critérios de aceitação**
- Carregar em Entrar dá sempre uma resposta visível: entra, ou mostra a razão
- Mensagens para cada caso: password errada · email por confirmar (com *Reenviar confirmação*) · conta à espera de aprovação · conta recusada · conta suspensa
- O botão mostra estado de carregamento e não envia duas vezes
- Qualquer erro do servidor aparece ao utilizador e fica nos logs

**Verificar primeiro:** a consola do browser e o pedido de rede ao carregar em Entrar. Provável: o erro *Email not confirmed* do Supabase (consequência do `OCT-01`) a ser apanhado sem mensagem, ou um redirecionamento para `localhost` engolido.

### `OCT-03` · Conta aprovada pelo Admin não consegue entrar · **P0**
Ligado a: `PRO-09` · `ADM-02`

**Hoje:** a conta foi aprovada e aparece em Utilizadores, mas não entra (ver `OCT-02`).

**Critérios de aceitação**
- Uma conta aprovada entra com o email e a password do registo
- Depois de entrar vai para `/modulo` (`OCT-18`) e vê os módulos que o Admin lhe deu
- Se o email não estiver confirmado, a mensagem diz isso e permite reenviar

### `OCT-04` · O email de recuperar a password não chega · **P0**
Ligado a: `PRO-08`

**Critérios de aceitação**
- O email de recuperação chega em Gmail, Outlook e domínio empresarial
- O link abre a página de nova password em produção, não em `localhost`
- A nova password funciona; a antiga deixa de funcionar
- Cada envio fica registado com estado de entrega (enviado, entregue, devolvido)

**Verificar primeiro:** o mesmo do `OCT-01` (*Redirect URLs*) e os registos do Resend. O remetente tem de ter **um só endereço** (foi a causa dos emails devolvidos em setembro). Confirmar se o Supabase Auth está a usar o SMTP do Resend ou o SMTP de testes do Supabase, que tem limite de envios.

### `OCT-05` · Conta pendente: entrar e poder contactar · **P1**
Ligado a: `PRO-09` · Captura: `capturas/OCT-05_conta-pendente.png`

**Hoje:** numa tentativa, a conta pendente entrou e mostrou *Your account is waiting for validation* só com *Sign out*.

**Critérios de aceitação**
- A conta pendente entra e vê "A sua conta está à espera de aprovação"
- No mesmo ecrã: opção para enviar uma mensagem à equipa WeeFly (formulário curto) ou um email de contacto
- Texto na língua do utilizador, português por defeito
- Não vê nenhum módulo até ser aprovada

### `OCT-06` · Retirar a opção de alterar o email no ecrã de verificação · **P1**
Ligado a: `PRO-07` · Captura: `capturas/OCT-06_alterar-email.png`

**Hoje:** o ecrã deixa escrever outro email e *Guardar e reenviar*, mas dá erro ("This registration can no longer be changed here"). Depois de voltar atrás deste ecrã, a conta deixou de conseguir entrar.

**Critérios de aceitação**
- Retirar, por agora, a opção de alterar o email
- Ficam: o email para onde foi enviado, **Reenviar email** e **Voltar ao início de sessão**
- Voltar atrás deste ecrã não estraga a conta

### `OCT-07` · Mostrar o email para onde foi enviada a confirmação · **P1**
Ligado a: `PRO-07` · Captura: `capturas/OCT-07_verificar-email.png`

**Critérios de aceitação**
- Texto: "Enviámos um email para **nome@exemplo.com**. Clique no link para ativar a sua conta."
- O endereço aparece por escrito, não numa caixa editável

### `OCT-08` · O estado "Email confirmado" tem de ser real · **P1**
Ligado a: `PRO-09` · Captura: `capturas/OCT-08_validacao-contas.png`

**Hoje:** o cartão da conta pendente, no Admin, diz "Email confirmado", mas o link de confirmação foi parar a `localhost`. Não se sabe se o texto é fixo.

**Critérios de aceitação**
- "Email confirmado" só aparece se `auth.users.email_confirmed_at` estiver preenchido
- Caso contrário mostra "Email por confirmar", com *Reenviar confirmação*

### `OCT-09` · Retirar os travessões "—" de todas as mensagens · **P2**
Ligado a: `T-15` · `T-16` · `T-20`

**Critérios de aceitação**
- Nenhum `—` em emails, WhatsApp, ecrãs do cliente e notificações, nas quatro línguas
- Substituir por ponto final, vírgula ou dois pontos
- Verificar os dicionários (PT, EN, FR, NL) e os modelos de email (incluindo os do Supabase Auth)

---

# 2 · Admin

### `OCT-10` · Recusar uma conta: nota por email e confirmação · **P1**
Ligado a: `PRO-09`

**Critérios de aceitação**
- Recusar abre uma janela com a nota (obrigatória), enviada ao email da pessoa
- Confirmação antes de recusar: "Esta decisão não pode ser desfeita. Recusar a conta de *Nome*?"
- Fica no *Registo de decisões* com data, hora, quem decidiu e a nota

### `OCT-11` · Aprovar envia um email de aprovação · **P1**
Ligado a: `PRO-09`

**Critérios de aceitação**
- Ao aprovar, a pessoa recebe "A sua conta WeeFly PRO foi aprovada", com botão para entrar
- O link abre o login de produção
- Fica no *Registo de decisões*

### `OCT-12` · Subdomínio da empresa: verificar se está livre enquanto se escreve · **P1**
Ligado a: `DOM-01` · `TEN-04`

**Critérios de aceitação**
- Enquanto se escreve, o sistema diz **disponível** ou **ocupado**
- Só letras minúsculas, números e hífen; sem espaços nem acentos; 2 a 30 caracteres
- Nomes reservados recusados: `pro`, `www`, `admin`, `api`, `mail`, `dev`, `app`, `pc`, `static`, `assets` e os já usados
- Não é possível aprovar com um nome ocupado, mesmo com dois Admin em simultâneo: **índice único na base de dados**

### `OCT-13` · Parceiros: editar a empresa e pôr o logótipo · **P1**
Ligado a: `ADM-01` · `TEN-02` · Captura: `capturas/OCT-13_parceiros.png`

**Critérios de aceitação**
- Em Editar: carregar o **logótipo** (PNG ou SVG, até 2 MB) com pré-visualização
- Também: **ícone** e **imagem de partilha** (ver `SEO-04`), cores principal e de destaque, nome do remetente, WhatsApp de apoio
- O logótipo aparece logo no backoffice, nos emails e no price checker dessa empresa

### `OCT-14` · Criar a Alô como parceiro · **P1**
Ligado a: `ADM-01` · `TEN-02`

**Hoje:** só existem *WeeFly* e *Empresa Teste*.

**Critérios de aceitação**
- A Alô existe: **Alô Cabo Verde Tour**, white label, B2G, subdomínio `alo`
- Logótipo `assets/alo/alo-logo.png`, ícone `assets/alo/alo-icon.png`, cores azul `#02A9FF` e laranja `#FF6A02`
- Se o criador de parceiros não o permitir, corrigir o criador (mesmo problema do `OCT-13`)
- ⚠ Dados em falta (NIF, morada, remetente, WhatsApp) ficam para preencher no ecrã, sem código

### `OCT-15` · O primeiro menu do Admin é o Dashboard · **P2**
Ligado a: `ADM-03`

**Critérios de aceitação**
- Primeiro menu **Dashboard**, aberto por defeito
- Mostra: contas à espera de aprovação, parceiros ativos, casos abertos, passagens emitidas no mês, alertas de saldo
- Cada número abre a lista correspondente

### `OCT-16` · Seletor de módulo como lista que abre ao clicar · **P2**
Ligado a: `PRO-02` · Captura: `capturas/OCT-16_seletor-modulo.png`

**Hoje:** Fornecedor, Agente e Admin lado a lado; o Admin fica cortado.

**Critérios de aceitação**
- O módulo atual é um botão; ao clicar abre a lista dos outros
- Fornecedor continua com cadeado e *Brevemente*

### `OCT-17` · O Admin vê todos os clientes · **P1**
Ligado a: `PRO-05` · `ADM-04`

**Critérios de aceitação**
- Menu **Clientes** no Admin, com clientes de todos os parceiros
- Filtro por parceiro; pesquisa por nome, telefone e email
- Só o perfil Admin WeeFly vê clientes de mais de um parceiro (`TEN-03`, row-level security)

### `OCT-18` · Depois de entrar, a primeira página é /modulo · **P2**
Ligado a: `PRO-02` · `TEN-06`

**Critérios de aceitação**
- Depois de entrar, abre sempre `/modulo`
- O último módulo usado fica destacado
- Substitui a regra "o login abre o Concierge por defeito" do `TEN-06`

---

# 3 · Agente e backoffice

### `OCT-19` · Menu lateral sempre visível; em Passagens fica só com ícones · **P2**
Captura: `capturas/OCT-19_area-agente.png`

**Critérios de aceitação**
- Menu lateral presente em todos os ecrãs
- Dentro de Passagens recolhe para ícones; ao passar o rato ou carregar, mostra os nomes
- A escolha (aberto ou recolhido) fica guardada

### `OCT-20` · O link do price checker demora muito a abrir · **P1**
Ligado a: `MIN-01`

**Critérios de aceitação**
- Primeiro ecrã visível em menos de 3 segundos num telemóvel com 4G
- Medido com Lighthouse em modo telemóvel; registar antes e depois no resumo
- Nenhum código ou dado do backoffice carregado no link do cliente

**Verificar primeiro:** tamanho do primeiro carregamento (bundle), imagens sem compressão (usar `next/image`), pedidos à base de dados em série, e a latência do servidor na Irlanda.

### `OCT-21` · Notificações: abrir o painel ainda marca tudo como visto · **P1**
Ligado a: `PRO-11` · `PRO-12` · Captura: `capturas/OCT-21_notificacoes.png`

**Hoje:** depois de abrir, o painel mostra "40 · 0 por ver".

**Critérios de aceitação**
- Abrir o painel não marca nada como lido
- Cada notificação fica lida só quando se carrega nela; o contador desce uma a uma
- **Marcar todas como lidas** e **Limpar**, ambas com confirmação
- Estado de lido guardado por utilizador, sobrevive a recarregar

### `OCT-22` · Arquivar um caso fechado fora da plataforma · **P2**
Ligado a: `PRO-10` · `T-21` · Captura: `capturas/OCT-22_fila-price-checker.png`

**Critérios de aceitação**
- **Arquivar** nas opções de cada caso, com motivo obrigatório; um dos motivos é *fechado fora da plataforma*
- O caso sai das filas e aparece em *Casos fechados*; um administrador pode reabrir, e fica registado

### `OCT-23` · Botão do tutorial ao lado das notificações · **P2**
Ligado a: `PRO-14` · Captura: `capturas/OCT-23_tutorial.png`

**Critérios de aceitação**
- Ícone do tutorial no topo, ao lado do sino
- Abre o tutorial guiado do ecrã atual
- Textos em português por defeito, seguindo a língua do utilizador

### `OCT-24` · Perfil básico do utilizador · **P2**
Ligado a: `PRO-13`

**Critérios de aceitação**
- Nome, email, telefone, empresa e perfil de acesso, no menu em cima à direita
- O utilizador edita nome e telefone e muda a password
- Empresa e perfil de acesso visíveis, só o Admin altera

---

# 4 · Domínios e endereços finais

### `DOM-01` · Nova estrutura de endereços de produção · **P1**
Ligado a: `TEN-04` · `MIG-02` · `ENV-01`. **Substitui** o esquema `alo.weefly.africa/m/<ministério>` do `TEN-04` e o `concierge.weefly.africa`.

| Endereço | Para quê | Quem usa |
|---|---|---|
| `pro.weefly.africa` | Backoffice WeeFly PRO: Admin e todos os utilizadores de serviços | Admin, agentes WeeFly, fornecedores |
| `weefly.africa/pc` | Price checker público da WeeFly Global | Clientes da WeeFly Global |
| `<empresa>.weefly.africa/pc` | Price checker de cada empresa, incluindo as sedes WeeFly noutros países | Clientes das empresas |
| `<empresa>.weefly.africa/admin` | Backoffice das empresas white label, com a marca delas | Equipa da empresa (ex.: Alô) |
| `<empresa>.weefly.africa/ministerios` | Aplicação dos ministérios (B2G) | Secretárias dos ministérios |

Exemplo Alô: `alo.weefly.africa/admin` · `alo.weefly.africa/pc` · `alo.weefly.africa/ministerios/saude` (um endereço por ministério, decisão Q1)

**Critérios de aceitação**
- DNS e certificado wildcard para `*.weefly.africa` (pedido ao Sarin)
- O subdomínio identifica a empresa (resolvido no `middleware` a partir do `Host`); é o que o Admin escolhe na aprovação (`OCT-12`)
- **É sempre o mesmo backoffice WeeFly** (decisão Q2): uma empresa entra por `pro.weefly.africa` ou por `<empresa>.weefly.africa/admin` e chega ao mesmo sítio, com os mesmos dados
- Uma conta só vê a sua empresa; em `<outra>.weefly.africa/admin` recebe 404
- `weefly.africa/pc` funciona ao lado do site público (pesquisa Amadeus) sem o afetar. O site público está no mesmo servidor (decisão Q4, a confirmar no NGINX): `/pc` é encaminhado para a aplicação, o resto continua no site atual
- **`concierge.weefly.africa` deixa de existir** (decisão Q3): a plataforma pública ainda não foi lançada, por isso não há links de clientes a manter. Retirar o endereço do NGINX, do certificado e de toda a configuração, e garantir que nenhum link gerado o usa
- **Sedes noutros países** (decisão Q5): a estrutura tem de aceitar uma empresa por país sem código novo, ex.: `mz.weefly.africa/pc` ou `mocambique.weefly.africa/pc`. Ver a nota em Q5
- Empresa inexistente → página "não encontrado" com a marca WeeFly, nunca um erro técnico
- Todos os links gerados (emails, WhatsApp, PDF) usam a nova estrutura, lida da configuração (`MIG-02`)
- O desenvolvimento tem a mesma estrutura sobre `weefly.duckdns.org` (`ENV-01`)

---

# 5 · Favicon, ícones e SEO (`OCT-25`)

**Estado hoje (verificado a 2 de outubro em `concierge.weefly.africa/login`):** **não há favicon nem imagem de partilha** (`favicon` e `og:image` ausentes). O título muda com a língua do browser ("WeeFly PRO — Plataforma B2B para fornecedores de serviços" / "WeeFly PRO — B2B Platform for Service Providers") e usa travessão.

**O que já está pronto neste pacote:**

| Pasta | Conteúdo |
|---|---|
| `assets/weefly/` | **Marca por defeito.** Logótipo em vetor (`weefly-logo.svg`, versão branca), ícone em vetor (`favicon.svg`), `favicon.ico` (16/32/48), PNG 16/32/48, `apple-touch-icon.png` (180, fundo laranja), `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `site.webmanifest`, `site-pro.webmanifest`, `og-image.jpg` (price checker público) e `og-image-pro.jpg` (WeeFly PRO), ambos 1200 × 630 |
| `assets/alo/` | **Alô.** `alo-logo.png`, `alo-icon.png` (só o globo, fundo transparente), `favicon.ico`, PNG 16/32/48, `apple-touch-icon.png`, ícones 192/512/maskable, `site.webmanifest`, `og-image.jpg` (1200 × 630) e `head-snippet.html` de exemplo |

Cores: WeeFly `#EF5129` · Alô `#02A9FF` (principal) e `#FF6A02` (destaque).

> ⚠ O logótipo da Alô veio em PNG com as margens serrilhadas. Os ficheiros servem para já; quando a Alô enviar o vetor (SVG/PDF), substituir.

### `SEO-01` · Favicon e ícones por defeito (WeeFly) · **P1**

**Critérios de aceitação**
- `pro.weefly.africa`, `weefly.africa/pc` e qualquer empresa sem ícone próprio servem os ficheiros de `assets/weefly/`
- No `<head>`: `favicon.ico`, `favicon.svg`, PNG 16/32, `apple-touch-icon`, `manifest` e `theme-color` `#EF5129`
- `pro.weefly.africa` usa `site-pro.webmanifest` (nome "WeeFly PRO")

Exemplo de `<head>` (WeeFly público):

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#EF5129">
```

### `SEO-02` · Metadados por página e por empresa · **P1**

**Critérios de aceitação**
- Cada página pública tem: `title`, `description`, `canonical`, `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image` (+ `width`, `height`, `alt`), `og:locale` e `twitter:card = summary_large_image`
- Os valores vêm da empresa resolvida pelo subdomínio (nome, descrição, imagem), nunca escritos no código
- `og:locale` e o texto seguem a língua da página: `pt_PT`, `en_GB`, `fr_FR`, `nl_NL`
- `og:image` com **URL absoluto** (o WhatsApp não aceita relativo)
- Título e descrição de `pro.weefly.africa` em português por defeito, sem travessão (`OCT-09`)

**Textos por defeito** (⚠ podem ser alterados no Admin):

| Onde | `title` | `description` | `og:image` |
|---|---|---|---|
| `weefly.africa/pc` | Encontre o melhor preço para o seu voo · WeeFly | Peça a sua viagem à WeeFly e receba as melhores ofertas por WhatsApp e email. | `assets/weefly/og-image.jpg` |
| `pro.weefly.africa` | WeeFly PRO · Plataforma B2B para fornecedores de serviços | Plataforma B2B para fornecedores de serviços e agentes em Cabo Verde. | `assets/weefly/og-image-pro.jpg` |
| `alo.weefly.africa/pc` | Alô Cabo Verde Tour · Agência de viagens e turismo | Peça a sua viagem à Alô Cabo Verde Tour. Passagens aéreas com o apoio da nossa equipa. | `assets/alo/og-image.jpg` |

**Nota de implementação (Next.js 14):** se o projeto usa o App Router, gerar os metadados com `generateMetadata()` a partir do `Host` (via `headers()`), definir `metadataBase` com o endereço da empresa, e servir os ícones da empresa por uma rota (ex.: `/favicon.ico` e `/icon` resolvidos por empresa) em vez de ficheiros estáticos únicos em `public/`. Se usa o Pages Router, o mesmo com `next/head` e `getServerSideProps`. Confirmar qual é antes de escolher.

### `SEO-03` · Indexação: só as páginas públicas · **P1**

**Critérios de aceitação**
- **Indexadas:** `weefly.africa/pc` e `<empresa>.weefly.africa/pc` (página inicial do price checker)
- **`noindex, nofollow`** (meta `robots` e cabeçalho `X-Robots-Tag`): `pro.weefly.africa` inteiro, `/admin`, `/ministerios`, os links privados de clientes `/pc/<código>`, as páginas de login, registo e recuperação, e **todo o ambiente de desenvolvimento** (`ENV-01`)
- Os links privados não são indexados, **mas mostram a imagem de partilha da empresa** quando enviados por WhatsApp ou email (o `og:image` mantém-se)
- `robots.txt` e `sitemap.xml` por subdomínio; o sitemap só lista páginas indexáveis
- Em desenvolvimento, `robots.txt` com `Disallow: /`

### `SEO-04` · Cada empresa carrega o seu ícone e a sua imagem de partilha · **P1**
Ligado a: `OCT-13` · `TEN-02` · `MIN-06`

**Critérios de aceitação**
- Em Admin › Parceiros › Editar: carregar o **ícone** (quadrado, PNG de pelo menos 512 × 512, ou SVG) e a **imagem de partilha** (1200 × 630, JPG ou PNG, até 1 MB)
- Pré-visualização de como fica no separador do browser e numa mensagem de WhatsApp
- A partir do ícone, o sistema gera sozinho: `favicon.ico` (16/32/48), PNG 16/32, `apple-touch-icon` 180 (fundo branco ou cor da empresa), ícones 192 e 512, ícone *maskable* (símbolo dentro de 60% do centro) e o `site.webmanifest` com o nome e a cor da empresa
- Sem ícone carregado, usa os da WeeFly (`SEO-01`)
- Os ficheiros ficam no Supabase Storage, por empresa, com cache longo e nome versionado (trocar o ícone não fica preso em cache)
- A Alô fica configurada já com os ficheiros de `assets/alo/`

### `SEO-05` · Imagens leves e com texto alternativo · **P2**
Ligado a: `OCT-20`

**Critérios de aceitação**
- Todas as imagens com `alt` descritivo
- Imagens servidas comprimidas e no tamanho certo (`next/image`, WebP/AVIF)
- Logótipos em SVG sempre que existir

---

# 6 · Teste de fecho

Em produção, depois das correções, com uma conta nova e um email real (Gmail). Se um passo falhar, a entrega não fecha.

| # | Passos | Resultado esperado |
|---|---|---|
| T1 | Criar conta nova em `/registro` | O ecrã diz para que email foi enviada a confirmação. Sem opção de alterar o email |
| T2 | Abrir o email e carregar em confirmar | Abre a página de email confirmado em produção. Nunca `localhost` |
| T3 | Entrar com a conta ainda pendente | Entra e vê "Conta à espera de aprovação", com opção de contactar |
| T4 | No Admin, ver a conta pendente | "Email confirmado" verdadeiro. Ao escrever o subdomínio, diz se está livre |
| T5 | Aprovar a conta | A pessoa recebe o email de aprovação |
| T6 | Entrar com a conta aprovada | Entra e abre `/modulo` com os módulos dados pelo Admin |
| T7 | Entrar com a password errada | Mensagem de erro clara. O botão nunca fica sem resposta |
| T8 | Esqueci-me da password | O email chega; a nova password funciona e a antiga não |
| T9 | Recusar outra conta nova | Pede nota e confirmação; a pessoa recebe a nota por email |
| T10 | Abrir o link do price checker num telemóvel 4G | Primeiro ecrã em menos de 3 segundos |

### Testes de favicon e SEO

| # | Passos | Resultado esperado |
|---|---|---|
| S1 | Abrir `pro.weefly.africa` no Chrome | Favicon WeeFly no separador; título em português |
| S2 | Abrir `alo.weefly.africa/pc` | Favicon da Alô (globo); título da Alô |
| S3 | Enviar `weefly.africa/pc` por WhatsApp | Pré-visualização com `og-image.jpg` da WeeFly |
| S4 | Enviar `alo.weefly.africa/pc` por WhatsApp | Pré-visualização com a imagem da Alô |
| S5 | Enviar um link privado `/pc/<código>` da Alô por WhatsApp | Mostra a imagem da Alô; a página tem `noindex` |
| S6 | Adicionar ao ecrã inicial no iPhone e no Android | Ícone da empresa certa |
| S7 | `pro.weefly.africa/robots.txt` e `weefly.duckdns.org/robots.txt` | Ambos `Disallow: /` |
| S8 | Facebook Sharing Debugger em `weefly.africa/pc` e `alo.weefly.africa/pc` | Título, descrição e imagem certos, sem avisos |

---

# 7 · Decisões

## Respondidas a 2 de outubro

| # | Pergunta | Decisão |
|---|---|---|
| Q1 | Um endereço por ministério? | **Sim.** `alo.weefly.africa/ministerios/<ministério>`, ex.: `/ministerios/saude`. Cada ministério tem o seu link e o seu brasão |
| Q2 | As empresas white label entram onde? | **Nas duas:** `pro.weefly.africa` e `<empresa>.weefly.africa/admin`. É sempre o mesmo backoffice WeeFly |
| Q3 | O que acontece a `concierge.weefly.africa`? | **Deixa de existir.** A plataforma pública ainda não foi lançada; começa já nos endereços novos |
| Q4 | `weefly.africa` (site público Amadeus) está no mesmo servidor? | **Sim**, pelo que se sabe. Confirmar no NGINX antes de encaminhar `/pc` |
| Q5 | Como se chamam as sedes noutros países? | **Ainda não abertas.** A ideia é o código do país ou o nome, ex.: Moçambique. Ver nota abaixo |

> **Nota sobre Q5.** Um endereço como `weefly.africa.mz` ou `weefly.africa.mocambique` não é possível: o país tem de vir **antes** de `weefly.africa` (subdomínio) ou ser um domínio próprio do país. As duas opções que funcionam:
> - **Subdomínio**, já coberto pelo certificado wildcard: `mz.weefly.africa` ou `mocambique.weefly.africa`. Recomendado: o código do país (`mz`), curto e igual em todas as línguas
> - **Domínio do país**, ex.: `weefly.co.mz` ou `weefly.mz`, comprado à parte, com DNS e certificado próprios. Para isso a plataforma teria de aceitar **domínios próprios por empresa**; não é preciso agora, mas o modelo de dados não o deve impedir

## Ainda em aberto

| # | Pergunta | Proposta |
|---|---|---|
| S2 | Os links antigos `weefly.duckdns.org/pc/…` redirecionam para a produção? | Como a plataforma ainda não foi lançada, provavelmente não é preciso: `weefly.duckdns.org` fica só como desenvolvimento. ⚠ Confirmar |
