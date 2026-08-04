# Chatbot no WhatsApp — conversa de planeamento

> Transcrição de uma sessão de Claude Code em 2026-07-27, sobre o repo `weefly-pro`.
> Base: commit `4d955b1` (`-chatbot implementation`), que introduziu o Concierge Chatbot (Fase 2) em `/newhome`.

---

## Pergunta

**Como é que implementamos um chatbot no WhatsApp?**

---

## Contexto levantado do repo

O `graphify-out/GRAPH_REPORT.md` está desatualizado (gerado a 2026-07-23, antes do commit do chatbot), por isso a análise foi feita diretamente sobre os ficheiros do `4d955b1`:

```
src/app/api/chat/parse/route.ts        110 linhas   NLP via Claude Haiku 4.5
src/app/api/flights/search/route.ts     74 linhas   Amadeus + fallback mock
src/lib/amadeus.ts                     399 linhas   cliente Amadeus
src/lib/flight-parse.ts                119 linhas   schemas (zod + zod/v4)
src/types/flights.ts                   165 linhas
src/components/concierge/chat-widget.tsx        334 linhas
src/components/concierge/flight-offer-card.tsx  177 linhas
src/app/newhome/{layout,page}.tsx
```

---

## Resposta

### A boa notícia: o motor já é agnóstico ao canal

O que foi construído na Fase 2 divide-se limpa em duas metades:

| Camada | Ficheiro | Reutilizável no WhatsApp? |
|---|---|---|
| NLP (Claude → `ParsedFlightQuery`) | `src/app/api/chat/parse/route.ts:77` | ✅ tal e qual |
| Pesquisa (Amadeus + mock) | `src/lib/amadeus.ts`, `src/app/api/flights/search/route.ts` | ✅ tal e qual |
| Schemas | `src/lib/flight-parse.ts` | ✅ tal e qual |
| Orquestração + estado | `chat-widget.tsx:37` (`useState`) | ❌ o histórico vive no browser |
| Render das ofertas | `flight-offer-card.tsx` | ❌ HTML/Tailwind |

Só as duas últimas linhas é que são trabalho novo. Portanto ~70% já está feito.

### Refactor prévio (o passo que decide tudo)

Hoje o `chat-widget` orquestra em cliente: chama `/api/chat/parse`, olha para `ready`, chama `/api/flights/search`. O webhook do WhatsApp não pode fazer self-HTTP a essas rotas (lento, frágil, duplica auth).

**Extrair para `src/lib/concierge-engine.ts`:**

```ts
// history vem de onde o canal quiser (React state ou DB)
export async function handleTurn(input: {
  message: string
  history: ChatTurn[]
}): Promise<{
  reply: string
  query: ParsedFlightQuery | null
  result: FlightSearchResponse | null
}>
```

As duas rotas HTTP existentes passam a wrappers finos disto, o `chat-widget` não muda, e o webhook do WhatsApp chama a mesma função. Um cérebro, dois canais.

### O que é genuinamente novo

**1. Setup na Meta** (~1h, burocracia)

Meta Business → WhatsApp Business Platform (Cloud API) → app + número de teste. Sai daqui com:

```
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=      # System User token permanente, não o temporário de 24h
WHATSAPP_VERIFY_TOKEN=      # string inventada por ti
WHATSAPP_APP_SECRET=        # para validar assinatura
```

**2. `src/app/api/whatsapp/webhook/route.ts`**

- `GET` → verificação: devolve `hub.challenge` em `text/plain` se `hub.verify_token` bater certo.
- `POST` → valida `X-Hub-Signature-256` (HMAC-SHA256 do **raw body**, não do JSON re-serializado), responde `200` imediatamente, processa a seguir.

**3. `src/lib/whatsapp.ts`**

Camada de envio: `sendText()`, `sendButtons()`, `sendList()`, `markAsRead()`, todas a POST para `graph.facebook.com/v2X.0/{phone_number_id}/messages` (confirmar a versão atual no dashboard da Meta).

**4. Tabela de conversa**

Não há nada em `supabase/migrations/` para isto (só `0001_companies.sql`). Nova migration:

```sql
create table public.wa_conversations (
  wa_id text primary key,           -- número E.164 do utilizador
  history jsonb not null default '[]',
  last_query jsonb,
  last_offers jsonb,                -- para o botão "Reservar" saber o que foi reservado
  updated_at timestamptz default now()
);

create table public.wa_processed (  -- idempotência: a Meta reenvia
  message_id text primary key,
  seen_at timestamptz default now()
);
```

**5. Renderer de ofertas**

O `FlightOfferCard` vira texto formatado (`*bold*`, `_italic_`) + botões interativos.

### As três armadilhas

**Timeout de ~5s.** A Meta reenvia o webhook se não responderes rápido, e `parse` + Amadeus demora mais que isso. Em Vercel serverless a função morre depois do `return`. Solução para MVP: `waitUntil()` do `@vercel/functions` — respondes 200 e o trabalho continua. Se crescer, meter uma fila (QStash/Inngest). Entretanto enviar `markAsRead` + indicador de "a escrever" para o utilizador não achar que morreu.

**Janela de 24h.** Só é possível enviar mensagem livre até 24h após a última mensagem *do utilizador*. Fora disso é preciso um template aprovado pela Meta (dias de review). Isto mata qualquer ideia de "avisamos quando o preço baixar" sem template pré-aprovado — vale a pena submeter cedo.

**UI pobre.** Máximo 3 botões (20 chars cada) ou uma lista de 10 linhas. As duas ofertas (`cheapest`/`best`) encaixam bem em 2 botões + 1 de "Outras opções". Mas o `FlightOfferCard` com layout de voo escala tem de virar texto — vale a pena desenhar esse formato antes de codificar.

### Faseamento sugerido

1. **Refactor do engine** — sem valor visível, desbloqueia tudo.
2. **Eco** — webhook + assinatura + `sendText`, responde "recebi: X". Prova o canal.
3. **Conversa completa** — persistência + engine ligado. Já é um chatbot funcional com o mock do Amadeus.
4. **Interativos** — botões de reserva, ligação ao fluxo de lead (`/api/concierge` + Resend).
5. **Produção** — número real, verificação de negócio, templates.

Nota: em dev é preciso expor o localhost (ngrok/cloudflared) porque a Meta tem de chegar ao webhook.

### Alternativa considerada e não recomendada

Twilio ou 360dialog abstraem a burocracia da Meta, mas cobram por mensagem além do custo Meta e adicionam um SDK. Como o projeto já tem Next.js com rotas API e a Cloud API é REST puro, ir direto é mais simples e mais barato.

---

## Decisão pendente

Avançar com o passo 1+2 (refactor do engine + webhook a ecoar), ou tratar primeiro do setup na Meta para haver credenciais reais antes de escrever código?
