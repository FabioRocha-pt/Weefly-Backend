# O que precisamos do lado da WeeFly

> Documento de trabalho. A **Parte A** é para reencaminhar a quem gere o domínio
> `weefly.africa`. As partes B a D são pedidos internos, não os envies na mesma
> mensagem — cada um vai para pessoas diferentes.

---

## Antes de enviar a Parte A

A tabela de registos vai em branco de propósito: **os valores são gerados para
este domínio** e só aparecem depois de o domínio ser adicionado no Resend.

1. Entrar em <https://resend.com/domains> → **Add Domain** → `weefly.africa`
2. O Resend mostra 3 registos. Copiar os valores para a tabela da Parte A
3. Só depois reencaminhar

Enviar a mensagem com a tabela vazia obriga a uma segunda ronda de emails.

---

# PARTE A — mensagem a reencaminhar

**Assunto:** weefly.africa — 3 registos DNS para envio de email transacional

---

Olá,

Estamos a pôr no ar a plataforma de pedidos de viagem da WeeFly. Ela precisa de
enviar emails automáticos aos clientes (confirmação de pedido) e à equipa (aviso
de novo pedido), e para isso é preciso autorizar o serviço de envio — o
**Resend** — a enviar em nome de **weefly.africa**.

Verificámos que o DNS do domínio está alojado na **GoDaddy**
(`ns47.domaincontrol.com` / `ns48.domaincontrol.com`) e que o email está no
**Microsoft 365**. Precisamos de acrescentar três registos.

## Registos a adicionar

| # | Tipo | Nome / Host | Valor | Prioridade | TTL |
|---|------|-------------|-------|------------|-----|
| 1 | `TXT` | `resend._domainkey` | _(colar do painel Resend — chave longa iniciada por `p=MIGfMA0GCSq…`)_ | — | 1 hora |
| 2 | `MX` | `send` | _(colar do painel — algo como `feedback-smtp.eu-west-1.amazonses.com`)_ | `10` | 1 hora |
| 3 | `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | — | 1 hora |

## Isto não afeta o email atual — porquê

Esta é a preocupação legítima de quem administra um domínio com Microsoft 365,
por isso vale a pena ser explícito:

- **Os registos MX do domínio raiz não são tocados.** O
  `weefly-africa.mail.protection.outlook.com` fica exatamente como está, e as
  caixas `@weefly.africa` continuam a receber normalmente. O registo MX número 2
  acima é para o host `send`, um subdomínio separado, e serve apenas para o
  Resend receber devoluções.

- **O SPF atual não é alterado.** O domínio tem hoje
  `v=spf1 include:spf.protection.outlook.com -all` na raiz, e esse fica
  intacto. O registo número 3 é um SPF **separado**, no host `send`. Um domínio
  não pode ter dois registos SPF no mesmo host — é precisamente por isso que
  este vai para `send` e não para a raiz.

- **Não existe DMARC** configurado neste momento, portanto não há política a
  ajustar. Se pretenderem criar um no futuro, avisem-nos: os registos 1 e 3
  garantem alinhamento SPF e DKIM, por isso o envio passa em qualquer política.

## Notas práticas para a GoDaddy

- No campo **Name**, a GoDaddy acrescenta o domínio automaticamente. Escrever
  apenas `send` e `resend._domainkey` — **não** `send.weefly.africa`, senão fica
  `send.weefly.africa.weefly.africa`.
- A chave DKIM do registo 1 é muito longa. Colar como valor único, sem espaços
  nem quebras de linha. Se o campo parecer cortar, colar à mesma e gravar — a
  GoDaddy aceita.
- Não substituir nenhum registo existente. Estes três são novos.

## Depois de inserirem

Avisem-nos e validamos do nosso lado. A propagação costuma demorar entre alguns
minutos e uma hora.

Obrigado!

---

# PARTE B — acessos que nos facilitam a vida

Não são bloqueantes, mas cada um poupa uma ronda de emails de ida e volta.

- **Acesso de leitura ao DNS da GoDaddy**, ou o contacto direto de quem o gere.
  Sempre que for preciso um registo novo (um segundo domínio de envio, um
  DMARC), o ciclo repete-se.
- **Quem administra o Microsoft 365** do `weefly.africa`. Não é preciso agora,
  mas é a pessoa a contactar se um dia quisermos enviar diretamente pelo M365
  em vez do Resend.

---

# PARTE C — WhatsApp

Para os avisos automáticos passarem a chegar por WhatsApp em vez de email
(que é como os clientes em Cabo Verde efetivamente comunicam):

- **Confirmar em que estado está o número atual.** Teste de dez segundos: se um
  vendedor abre a app WhatsApp Business no telemóvel e vê as conversas, o número
  está na aplicação. Um número na Cloud API é impossível de usar na app.
- **Um número novo, dedicado**, para os avisos automáticos. Tem de conseguir
  receber uma SMS ou chamada **uma única vez**, para verificação. Não pode ser um
  número já registado em nenhuma app do WhatsApp.
- **Acesso ao Meta Business Suite** da WeeFly, ou que criem lá uma app de
  WhatsApp e nos passem as credenciais.
- **Dados para a verificação de negócio na Meta**: nome legal da empresa, morada,
  website, e documento comprovativo. A Meta exige isto antes de libertar envios
  para números reais, e demora dias.

> O número atual dos vendedores **não** deve ser migrado sem antes existir uma
> caixa de entrada no back-office. Migrar tira o número da aplicação do
> telemóvel, e a Cloud API não tem interface nenhuma — a equipa ficaria sem onde
> atender.

---

# PARTE D — pagamentos e confirmações

- **WeePay**: URL da API e chave (`WEEPAY_API_URL`, `WEEPAY_API_KEY`). Sem isto o
  sistema funciona à mesma, mas o pagamento é registado à mão pelo back-office
  em vez de gerar link automático.

- **Três perguntas sobre o webhook da WeePay.** O manual
  (`WeePay_Board_Developer_Manual_v1`) documenta o webhook que a WeePay *recebe*
  dos fornecedores (`POST /api/v1/webhooks/stripe`), mas nunca diz o que ela
  *envia* a quem a consome. O nosso lado está escrito a assumir que reenvia o
  `NormalizedEvent` do §4.5 tal e qual, assinado com HMAC-SHA256 à maneira da
  Stripe. Precisamos de confirmação de quem gere a WeePay:

  1. A WeePay chama um webhook nosso quando uma transação muda de estado? Com
     que corpo?
  2. Como assina o pedido — que cabeçalho, e sobre que bytes?
  3. Reenvia em caso de falha? Quantas vezes, e com que intervalo?

  O endereço a registar do nosso lado é `{site}/api/weepay/webhook`, e o segredo
  entra em `WEEPAY_WEBHOOK_SECRET`. Enquanto não houver resposta, o back-office
  pergunta o estado à WeePay por sondagem (`GET /api/v1/payments/{txn}/status`),
  que é o que o manual garante — funciona, mas obriga alguém a carregar num
  botão em vez de o estado chegar sozinho.

- **Como é que os clientes pagam hoje, sem WeePay?** Transferência bancária,
  Vinti4, numerário ao balcão, combinado no WhatsApp? A página do link 3 mostra
  neste momento só o valor e diz que o vendedor entra em contacto, porque
  inventar um método seria pior. Assim que soubermos, entra ali o bloco com as
  instruções — e se for transferência, precisamos dos dados da conta (banco,
  IBAN, titular).
- **Confirmar quem recebe os avisos internos.** Neste momento está configurado
  para `info@weefly.africa` e `info@weefly.cv`. Se forem outros endereços, ou se
  cada vendedor dever receber os seus, é preciso dizer.
- **Confirmar o endereço de envio.** A proposta é
  `concierge@weefly.africa`. Não precisa de ser uma caixa real que alguém leia,
  mas convém que as respostas dos clientes cheguem a algum lado — indiquem para
  onde encaminhar.

---

## Estado atual, para contexto

| Peça | Estado |
|---|---|
| Conta Resend + API key | ✅ criada, a funcionar |
| Envio de email | ⚠️ só entrega no email dono da conta Resend |
| Domínio `weefly.africa` verificado | ❌ **bloqueado na Parte A** |
| Base de dados e back-office | ✅ a funcionar |
| Fluxo dos 3 links | ✅ a funcionar |
| Compositor de ofertas e link 2 do cliente | ✅ a funcionar |
| Pagamento manual (cliente declara, admin confirma) | ✅ a funcionar |
| Avisos por WhatsApp | ❌ bloqueado na Parte C |
| Pagamento automático WeePay | ⚠️ escrito, à espera das credenciais |
| Webhook da WeePay | ⚠️ escrito às cegas, à espera do contrato |
| Instruções de pagamento na página do cliente | ❌ à espera de sabermos como cobram |

`info@weefly.cv` **recebe** os avisos internos sem qualquer configuração —
receber nunca exige verificação. A Parte A só é necessária para *enviar*.
