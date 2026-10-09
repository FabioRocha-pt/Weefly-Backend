# B2G v2 · Progresso

## Bloco 1 · Master e empresas (B2G-01, B2G-02, B2G-20) + 0.1

### Feito

**0.1 · teste de base.** `supabase/tests/test_tenancy.sql` usava o slug `alo`, que a 0031 já semeia: passou a `alo-ten`. `bash supabase/tests/run.sh` verde antes de qualquer mudança.

**Migração `0032_b2g_v2_channels.sql`** (idempotente, corre duas vezes no `run.sh`):
- `partners.channels` e `product_sellers.channels` aceitam `B2C` (Público), `VIP` e `B2G` (Ministérios).
- `partner_has_channel(uuid, text)` · security definer, só responde sim/não (não abre a linha de `partners`).
- `booking_cases.channel` (`publico` | `vip` | `ministerio`, por omissão `publico`), com backfill `ministerio` onde há `organisation_id`, gatilho `booking_cases_force_channel` (com ministério é sempre `ministerio`; sem ministério nunca o é; `vip` fica como vier — o bloco 2 liga-o ao cliente VIP) e índice `(partner_id, channel)`.
- `concierge` entra nos subdomínios reservados (`partners_slug_not_reserved`, `not valid`, como na 0031).
- `access_audit.action` aceita, além do que já aceitava: `vip_created/updated/deactivated/reactivated`, `secretary_created/updated/pin_generated/pin_locked/deactivated/reactivated`, `ministry_requested`, `ministry_request_approved/rejected`, `case_claimed`, `case_released`, `urgency_changed`, `proposal_review_requested`.
- Teste novo `supabase/tests/test_channels.sql` (K1–K6). Sonda nova em `scripts/check-migrations.mjs`.

**B2G-02 · canais ligados empresa a empresa**
- `src/lib/channels.ts` (sem imports de servidor: tipos, `hasChannel`, `normaliseChannels`) e `src/lib/channel-gate.ts` (servidor: `partnerChannels`, `partnerHasChannel`, `requirePartnerChannel` → 404).
- Admin › Parceiros: três caixas **Público · VIP · Ministérios** (`partners-admin.tsx`), validadas em `actions/partners.ts` (`B2C | VIP | B2G`). Ligar/desligar é um `update`: vale no pedido seguinte, sem versão nova.
- Menu lateral: a entrada Ministérios continua a depender de B2G (agora via `hasChannel`), no Pro e no price checker.
- `/agente/ministerios/**`: `layout.tsx` novo com `requirePartnerChannel("B2G")` → 404 com o canal desligado (lista, ministério, ficha do viajante).
- Carteira e Finanças: a bolsa e o quadro por ministério só aparecem com B2G.
- Server actions B2G recusam com o canal desligado: `visibleOrg` (rotate, secretária, crédito, ajuste, limite, editar ministério), criar ministério, confirmar pagamento externo, novo destinatário de alertas (`actions/b2g.ts`) e editar ficha de viajante (`actions/travellers.ts`). Erro novo `bo.b2g.errors.channelOff` (PT/EN).
- Espaço da secretária (`lib/ministry.ts`) não abre e o intake (`lib/pc/intake.ts`) não aceita pedido de ministério de uma empresa sem B2G. Um pedido com `ministryToken` que já não resolve deixa de cair como pedido público: não se guarda.

**B2G-01 · master sem empresa.** Para contas `cross_partner`, o menu lateral (Pro e price checker) não mostra o nome nem o logótipo da empresa. Os três módulos continuam (Fornecedor com cadeado, Agente, Admin). O parceiro operador não foi renomeado (decisão 6).

**B2G-20 · três empresas.** Nada de código: o Admin já lista as empresas; a WeeFly Moçambique (`mz`) nasce no script de dados (bloco 8). Os canais de cada uma escolhem-se agora nas três caixas.

**B2G-04 · regressão.** O fluxo público (`/pc`, `/pc/[token]`, link do agente, subdomínio) não foi tocado; o canal B2C **não** foi usado para fechar nada (ver decisões).

Verificação: `bash supabase/tests/run.sh` OK · `npm run build` OK · `npm run i18n:check` OK.

### Falta (fica para os blocos seguintes)
- `/agente/publico` e `/agente/vip` (com a fila de cada canal) e os três menus no lateral: **bloco 2**. Não criei páginas vazias.
- Construtor de links com as três opções, limitado aos canais ligados: **bloco 2** (hoje `topbar-actions.tsx` só tem o link público, sem gating).
- `mz` no script de dados e certificado `*.weefly.africa` (ops) para o teste do B2G-20.
- `graphify update .` não correu: o `graphify` não está instalado nesta máquina.

### Para decidir (humano)
1. **Fechar o Público com o canal B2C desligado?** Não o fiz: a Alô está semeada só com `B2G` (0031), e fechar o `/pc` e o link público dela hoje seria uma regressão. Proposta: ligar `B2C` (e `VIP`) à Alô no Admin/seed e, no bloco 2, esconder o menu Público e o link quando B2C está desligado — deixando o `/pc` público aberto.
2. **RLS por canal.** O gating é na aplicação (páginas e actions). Não acrescentei `partner_has_channel` às políticas de `organisations`: a Beta do `test_tenancy` tem um ministério sem B2G, e a defesa em profundidade pode entrar quando os dados de teste estiverem limpos.
3. **Reverter um pagamento externo com o canal desligado** continua possível, de propósito (não prender dinheiro na bolsa). Confirmar não.
4. A WeeFly (operador) continua com `B2C, B2G`; ligar `VIP` é um clique no Admin.
