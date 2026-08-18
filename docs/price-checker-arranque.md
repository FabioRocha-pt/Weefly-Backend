# Price Checker — arranque em três passos

> O Price Checker deixou de ser mockup. O fluxo do cliente (P1 → P9) e o
> back-office vivem em React, ligados à mesma base de dados, e o pagamento só
> fecha quando alguém do back-office marca a caixa que diz que o dinheiro entrou.
>
> Falta correr três coisas — nenhuma delas se faz a partir do código.

---

## 1. Aplicar a migração

`supabase/migrations/0009_price_checker.sql`. Colar no **SQL Editor** do Supabase
(o mesmo caminho das anteriores) e correr. Pode ser corrido mais do que uma vez.

O que acrescenta:

| Onde | O quê |
| --- | --- |
| `trip_requests` | moeda, vendedor do link, bebés (assento/colo), IP e dispositivo do consentimento, `intake` |
| `trip_request_legs` | os 2–3 voos de um pedido multi-destino |
| `case_passengers` | tratamento, país emissor, nº de bilhete, lugares |
| `case_payments` | prazos (cliente e nosso), a caixa de confirmação, valor recebido, referência do banco, estado da prova |
| `case_payment_proofs` | cada comprovativo enviado, com o veredicto de quem o abriu |
| `case_events` | o histórico do caso — é o que a aba "Registo" mostra |
| `bo_allowlist` | as duas contas com acesso ao back-office |
| `booking_cases` | PNR e os campos da emissão |
| Storage | bucket **privado** `payment-proofs`, 8 MB, só PDF/JPG/PNG |

Verificar no fim:

```sql
select email, active from public.bo_allowlist;
select id, public, file_size_limit from storage.buckets where id = 'payment-proofs';
```

## 2. Pôr a chave de serviço no `.env.local`

Supabase Dashboard → **Project Settings → API → `service_role`**.

```
SUPABASE_SERVICE_ROLE_KEY=...
```

Sem ela o cliente não consegue submeter pedidos nem enviar comprovativos (não tem
sessão — é a chave de serviço que escreve por ele), e o back-office não consegue
abrir os ficheiros. A app não estoura: mostra que não consegue abrir o pedido.

## 3. Criar as duas contas

```
npm run bo:seed
```

Cria (ou repõe a password de) `fapi.rocha@gmail.com` e `gocgo2008@gmail.com`,
liga-as a `platform_staff` e a `bo_allowlist`, e escreve as passwords geradas no
`.env.local`, num bloco marcado. Para as ver no ecrã: `npm run bo:seed --print`.
Para fixar uma password em vez de a gerar:

```
BO_PASSWORD_FAPI_ROCHA='...' npm run bo:seed
```

A entrada é pelo `/login` normal da app. Qualquer outra conta que chegue a
`/admin/price-checker` vê uma página que diz que não está na lista — e diz com que
email entrou, porque o erro mais comum é ter entrado com a conta errada.

---

## Os dois endereços

| Endereço | O quê |
| --- | --- |
| `/pc` | pedido novo. Aceita `?lang=`, `?currency=`, `?cc=`, `?agent=` — é o link que o back-office gera |
| `/pc/{token}` | o pedido do cliente, em qualquer ponto do percurso |
| `/admin/price-checker` | a fila de trabalho |
| `/admin/price-checker/{id}` | a ficha do caso, sete abas |

O `token` é o endereço permanente do cliente: 32 caracteres de um gerador
criptográfico, guardado em `booking_cases.token`. É o que substitui a sessão — o
cliente nunca cria conta.

---

## Como o pagamento fecha

```
cliente escolhe a opção
    └─ nasce o pagamento em PENDING, com 24 h para pagar          (expires_at)
cliente preenche passaportes
cliente paga por fora e carrega o comprovativo (PDF/JPG/PNG, 8 MB)
    └─ o ficheiro vai para o bucket privado
    └─ proof_status = 'recebido', arrancam 48 h para nós          (review_deadline_at)
back-office abre o ficheiro, compara o valor, MARCA A CAIXA
    └─ pagamento COMPLETED · caso 'pago' · cliente avisado por email
    └─ falta emitir — e essa é a aba seguinte
```

Se ninguém marcar a caixa dentro das 48 h, o pagamento **expira**: o link do
cliente fecha-se e ele passa a ver o ecrã de opções expiradas, com o botão para
pedir nova pesquisa. Quem atende pode:

- **Estender** o prazo (+48 h ou +24 h) — quando o atraso é nosso;
- **Rejeitar o comprovativo** com um motivo, que o cliente lê, e abrir-lhe nova
  janela para enviar outro;
- **Fechar o link** antes do prazo;
- **Reabrir** um pagamento já expirado — que nasce como um pagamento novo, para o
  histórico continuar a mostrar a tentativa que morreu.

A expiração é verificada a cada leitura da página do cliente e da ficha do
back-office. Para os casos em que ninguém abre nem uma nem outra durante dias, há
o endpoint:

```
GET /api/pc/expire?token=$PC_CRON_TOKEN
```

Sem `PC_CRON_TOKEN` no ambiente responde 404 — um endpoint que muda estado não
pode ficar aberto. De hora a hora é suficiente para um prazo de 48 h.

---

## Duas diferenças em relação ao mockup, de propósito

**As opções não são inventadas.** O mockup gerava itinerários e preços a partir da
distância entre aeroportos. Aqui as opções são as que o vendedor compõe no
back-office (`case_offers`) e publica — que é o que faz do Price Checker um
produto e não uma calculadora. Enquanto não houver proposta publicada, o cliente
vê o ecrã "estamos a procurar", que é a verdade.

**Os passaportes e o pagamento são dois ecrãs.** No mockup eram um só. O nome no
passaporte é o que se corrige depois com um bilhete novo pago ao preço da
companhia; a atenção de quem preenche não chega para as duas coisas ao mesmo
tempo. Primeiro os nomes, depois o dinheiro.

E uma nota de detalhe: a referência é a da base de dados (`WF-2608-0001`,
sequencial) e não o `WF-7K4M-92XB` aleatório do mockup — o mesmo formato do resto
da plataforma, e sem risco de duas iguais.

---

## O que ficou de fora

**O compositor de propostas** da aba "Propostas" mostra o que está publicado e
liga ao compositor que já existe (`/admin/casos/{id}/ofertas`), com importação do
Amadeus, itinerário, preço e pré-visualização. Não foi reconstruído no desenho
escuro do Price Checker: é o mesmo compositor, com outro aspeto. Se valer a pena
uni-los, é um trabalho por si.

**Os PDF dos bilhetes.** O P9 mostra o PNR e o número de bilhete de cada
passageiro, e diz ao cliente que o agente lhe envia os documentos. Gerar o PDF do
bilhete e do guia de viagem não está feito.
