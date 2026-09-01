# NT-06 — o que falta fazer fora do código

O Sprint 2 põe todos os envios a passar por um sítio só (`lib/notifications.ts`),
com registo de entrega em `case_notifications` e a bandeira no caso quando um
aviso ao cliente não chega. Isso é a parte que se programa.

O critério do backlog é mais largo do que isso, e de propósito:

> **"Ao vivo e a funcionar" quer dizer tudo o que se segue, e não apenas que o
> código chama uma função de envio.**

Este documento é a outra metade — a que se faz num painel de DNS e numa caixa de
correio, e sem a qual o código continua a mandar emails que caem em spam.

---

## 1 · Domínio autenticado: SPF, DKIM e DMARC

O `weefly.africa` foi verificado no Resend a 5 de agosto de 2026, o que cobre o
SPF e o DKIM. Falta o **DMARC**, que é o registo que diz aos servidores de
destino o que fazer com o que falhar os outros dois.

Registo a acrescentar:

```
Tipo   TXT
Nome   _dmarc.weefly.africa
Valor  v=DMARC1; p=none; rua=mailto:dmarc@weefly.africa; fo=1
```

`p=none` primeiro, de propósito: durante duas ou três semanas os relatórios
mostram quem mais envia em nome do domínio (o Google Workspace, um formulário
antigo, uma newsletter esquecida). Passar directamente a `p=reject` sem olhar
para isso é a forma mais rápida de deixar de receber a própria faturação.

Depois de os relatórios estarem limpos, subir para:

```
v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@weefly.africa; adkim=s; aspf=s
```

**Como confirmar que está a passar:** enviar um pedido de teste pelo
`/pc` e abrir o email recebido no Gmail → menu ⋮ → *Mostrar original*. As três
linhas têm de dizer `PASS`:

```
SPF:   PASS   com domínio weefly.africa
DKIM:  'PASS' com domínio weefly.africa
DMARC: 'PASS'
```

---

## 2 · Remetente real, verificado

Já está: `CONCIERGE_FROM_EMAIL="WeeFly Concierge <concierge@weefly.africa>"`.

O que **não** pode ficar é o valor por omissão do código
(`onboarding@resend.dev`), que existe só para o ambiente de desenvolvimento não
rebentar. Se aparecer em produção, os emails saem de um domínio que não é da
WeeFly e o cliente vê isso no cabeçalho.

---

## 3 · O webhook de entrega

Sem ele, o registo de cada envio pára em `sent` — que só quer dizer "o Resend
aceitou". A pergunta que a equipa faz é outra, e é "chegou?".

1. <https://resend.com/webhooks> → **Add Webhook**
2. Endpoint: `https://<domínio>/api/webhooks/resend`
3. Eventos: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`
4. Copiar o *Signing Secret* (`whsec_…`) para a variável `RESEND_WEBHOOK_SECRET`
5. Reiniciar a aplicação

A rota recusa tudo enquanto o segredo não estiver definido — responde `503`.
É o lado certo em que errar: aceitar eventos não assinados deixaria qualquer
pessoa marcar como entregue um email que nunca saiu.

**Como confirmar:** submeter um pedido de teste e abrir a ficha do caso na aba
**Comunicações**. A linha do aviso passa de `enviado` a `entregue` em poucos
segundos.

---

## 4 · Teste de caixa de entrada

O critério pede Gmail, Outlook e pelo menos um domínio corporativo. O que
interessa em cada um:

| Onde | O que verificar |
|---|---|
| Gmail | Caixa de entrada e não Promoções. SPF/DKIM/DMARC a `PASS` no *Mostrar original*. |
| Outlook / Hotmail | Caixa de entrada e não Lixo. O Outlook é o mais severo com domínios novos. |
| Um corporativo (ex.: `@bcn.cv`, `@enapor.cv`) | Muitos usam filtros com listas próprias. É aqui que aparecem os problemas que os dois primeiros não mostram. |

Fazer o teste com os cinco emails do ciclo, não só com um: pedido recebido,
proposta publicada, instruções de pagamento, pagamento confirmado e bilhetes
emitidos. O último leva anexos e é o que mais facilmente é retido.

---

## 5 · WhatsApp (opcional neste sprint)

A decisão `Q1` do backlog diz que a API de negócios do WhatsApp é uma fase
posterior e **não é uma dependência**. O adaptador está escrito
(`lib/whatsapp.ts`) e ligado ao registo de entrega.

Sem chaves configuradas, cada envio por WhatsApp fica registado como `não
enviado` com a razão à vista, e **o email sai na mesma** — que é literalmente o
critério do NT-02.

Quando houver acesso à Cloud API da Meta:

```
WHATSAPP_PHONE_NUMBER_ID=<id do número emissor>
WHATSAPP_ACCESS_TOKEN=<token permanente da aplicação>
WHATSAPP_API_VERSION=v21.0          # opcional
WHATSAPP_TEAM_NUMBER=+238991xxxxx   # para onde vai o alerta do NT-02
```

Nada mais é preciso: os avisos passam a sair pelos dois canais sem se tocar em
código.

Nota sobre a janela de 24 horas: fora dela a Meta só aceita modelos aprovados.
Quando isso acontecer, a resposta traz o código `131047` e fica escrita no
registo de entrega, em vez de desaparecer.

---

## Variáveis de ambiente novas neste sprint

```
RESEND_WEBHOOK_SECRET=whsec_...      # NT-06 · estado de entrega
WHATSAPP_PHONE_NUMBER_ID=            # NT-02/03/07 · opcional
WHATSAPP_ACCESS_TOKEN=               # opcional
WHATSAPP_API_VERSION=v21.0           # opcional
WHATSAPP_TEAM_NUMBER=                # opcional
```

---

## E a migração

`supabase/migrations/0013_sprint2.sql` tem de ser aplicada antes de o código
deste sprint servir para alguma coisa. Sem ela:

- os envios falham a escrever em `case_notifications` e ficam só no log;
- o seletor de vendedor não grava;
- a emissão não guarda lugares por voo nem o documento do bilhete;
- os pedidos especiais do FE-05 não são guardados.

Aplicar no SQL Editor do Supabase, como as anteriores. A `0012` também tem de
estar aplicada — ver a nota do Sprint 1.
