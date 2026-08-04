# WeeFly Concierge — pedido de registos DNS para envio de email

> Documento para reencaminhar a quem gere o DNS de **weefly.africa**.
> Contexto interno: o formulário de pedidos online (`/concierge`) passa a enviar
> cada lead para `info@weefly.africa` e `info@weefly.cv`, e uma confirmação ao
> cliente. Falta autorizar o serviço de envio (Resend) a enviar em nome do domínio.

---

## Antes de enviar este pedido

1. Entrar em <https://resend.com/domains> → **Add Domain** → `weefly.africa`.
2. O Resend mostra um ecrã com 3 a 4 registos DNS. **Os valores são gerados para
   este domínio** — não são os mesmos de outro projeto, e a chave DKIM é única.
3. Copiar os valores desse ecrã para a tabela em branco abaixo e só depois
   reencaminhar. Sem isso, quem gere o DNS não tem o que inserir.

---

## Mensagem a reencaminhar

**Assunto:** weefly.africa — adicionar 3 registos DNS para envio de email transacional

Olá,

Precisamos de autorizar um serviço de envio de email transacional (Resend) a
enviar em nome de **weefly.africa**. É necessário adicionar os registos abaixo
na zona DNS do domínio.

### Registos a adicionar

| # | Tipo | Nome / Host | Valor | Prioridade | TTL |
|---|------|-------------|-------|------------|-----|
| 1 | `TXT` | `resend._domainkey` | _(colar a chave DKIM do painel Resend — string longa iniciada por `p=MIGfMA0GCSq...`)_ | — | Auto |
| 2 | `MX` | `send` | _(colar do painel, tipicamente `feedback-smtp.<região>.amazonses.com`)_ | `10` | Auto |
| 3 | `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | — | Auto |

> Se o painel do Resend mostrar um 4º registo (DMARC, normalmente `TXT` em
> `_dmarc` com `v=DMARC1; p=none;`), adicionar também — mas ver a nota sobre
> DMARC mais abaixo antes de mexer, caso já exista um.

### Notas importantes

- **Isto não afeta a receção de email.** Os registos vivem no subdomínio `send.`
  e em `resend._domainkey`. Os registos **MX do domínio raiz — os que entregam
  o correio para `info@weefly.africa` — não são tocados.** As caixas de correio
  atuais continuam a funcionar exatamente como estão.
- **Não substituir registos existentes.** Se já existir um registo `TXT` de SPF
  no domínio raiz (`v=spf1 ...`), **não o alterar**: o registo #3 acima é para o
  host `send`, é um registo separado e coexiste com o do raiz. Um domínio não
  pode ter dois registos SPF no *mesmo* host — daí ir para `send`.
- **Se já existir DMARC** (`_dmarc`) com política `p=quarantine` ou `p=reject`,
  avisar-nos antes de alterar. Os registos #1 e #3 garantem alinhamento
  SPF/DKIM, por isso o envio deve passar — mas queremos confirmar a política
  atual em vez de a modificar às cegas.
- Alguns painéis (cPanel, Cloudflare) acrescentam automaticamente o domínio ao
  campo "Nome". Se assim for, inserir apenas `send` e não `send.weefly.africa`,
  para evitar `send.weefly.africa.weefly.africa`.
- A chave DKIM é longa. Alguns painéis partem-na em várias linhas — colar como
  valor único, sem espaços nem quebras de linha.

### Confirmação

Depois de inserir, avisem-nos. A propagação costuma demorar entre alguns minutos
e uma hora; validamos do nosso lado no painel do Resend.

Obrigado!

---

## Depois de o domínio ficar "Verified"

Do lado da aplicação, em `.env.local` (e nas variáveis de ambiente de produção):

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx          # https://resend.com/api-keys
CONCIERGE_FROM_EMAIL="WeeFly Concierge <concierge@weefly.africa>"
# Opcional — por omissão já vai para info@weefly.africa,info@weefly.cv
CONCIERGE_TEAM_EMAIL=info@weefly.africa,info@weefly.cv
```

Reiniciar o servidor e confirmar em:

```
http://localhost:3000/api/concierge/diagnose
```

O campo `blockers` deve vir vazio. Depois, para um envio real de teste:

```
http://localhost:3000/api/concierge/diagnose?send=o.teu.email@exemplo.com
```

### Nota sobre weefly.cv

`info@weefly.cv` **recebe** as notificações sem qualquer configuração — receber
não exige verificação. Só é preciso repetir este processo para `weefly.cv` se um
dia quisermos **enviar** a partir desse domínio.
