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

## Bloco 2 · Terminal de vendas (B2G-21, B2G-03, B2G-22)

### Feito

**Migração `0033_vip_clients.sql`** (idempotente, corre duas vezes no `run.sh`):
- `vip_clients` (empresa, nome, email, telefone, nível em texto livre, `link_token` único de 192 bits — formato verificado —, activo, `deactivated_at/by`, `created_by_email`, datas). Gatilho `vip_clients_guard`: um VIP não muda de empresa e o link não muda ("permanente"). `active = (deactivated_at is null)`.
- RLS: leitura por `can_see_partner(partner_id) and is_bo_allowed()` (a secretária não vê VIP); sem políticas de escrita e `revoke insert/update/delete` a `anon`/`authenticated`. Escreve-se pela service role.
- `booking_cases.vip_client_id` com chave composta `(vip_client_id, partner_id) → vip_clients(id, partner_id)`: o VIP é da empresa do caso; `on delete restrict` (um VIP com pedidos não se apaga — o histórico fica).
- O gatilho de canal da 0032 passa a decidir também o VIP: ministério → `ministerio`, VIP → `vip`, nenhum → nunca um destes. Restrição `booking_cases_vip_channel_check`: `channel = 'vip'` se e só se há VIP (recusa também ministério + VIP no mesmo caso). Casos `vip` sem VIP (a 0032 deixava) voltam a `publico`.
- Teste novo `supabase/tests/test_vip.sql` (V1–V7: isolamento entre empresas, master vê todas, sessão não escreve, token único/curto recusado/permanente, canal do caso, VIP de outra empresa recusado, desactivar guarda o histórico, secretária não vê). `test_channels.sql` K4 actualizado (`vip` sem cliente VIP passa a `publico`). Sondas novas em `scripts/check-migrations.mjs`.

**B2G-22 · VIP**
- Terminal `/vip/[token]` (`src/app/vip/`): o formulário do price checker com o contacto do VIP preenchido (editável; o passo do contacto mantém-se por causa do consentimento), marca da empresa e "Powered by WeeFly" pelo mesmo `PcFooter` do `/pc`. VIP desactivado, empresa suspensa ou sem canal VIP, ou endereço de outra empresa → 404. Middleware: `/vip/` é público como `/pc` e `/ministerios`.
- Intake (`lib/pc/intake.ts`): `vipToken` resolvido como o do ministério; a empresa vem da linha do VIP (ganha ao subdomínio e ao link); grava `vip_client_id` + `channel='vip'`. Token que já não resolve, ou ministério e VIP juntos → não se guarda. A deduplicação de duplo clique, num pedido VIP, só junta pedidos desse VIP (o caminho público ficou exactamente igual).
- Server actions `src/actions/vip.ts`: criar, editar, desactivar/reactivar. Qualquer conta do back-office da empresa (decisão 5), sempre na empresa da sessão e só com o canal VIP ligado. Cada uma no `access_audit` (`vip_created/updated/deactivated/reactivated`, com antes/depois).
- Admin › **VIP** (`/gestao/vip`, só `crossPartner`): os VIP de todas as empresas, com a empresa, filtro por empresa e pesquisa. Só leitura.

**B2G-21 · três menus.** Secção "Terminal de vendas" no menu lateral (Pro e Concierge): **Público** (`/agente/publico`), **VIP** (`/agente/vip`, `/agente/vip/[id]`), **Ministérios** (o que já existia, agora terceiro). Cada um só com o canal ligado (`B2C`, `VIP`, `B2G`) e cada página com `requirePartnerChannel` → 404. Cada menu tem a sua fila (`components/channels/channel-queue.tsx`), ligada à ficha do caso no Concierge. `loadBoQueue` ganhou filtros `channel`, `vipClientId`, `organisationId`, e as linhas trazem `channel`, `partnerName`, `organisationName`, `vipClientId`, `vipName` (com recuo se a base não tiver a 0033). Na fila do Concierge: coluna de origem mostra WEB/VIP/MIN com o nome do VIP ou do ministério, e um filtro `?canal=` quando a empresa tem mais de um canal.

**B2G-03 · construtor de links.** `LinkDrawer` com as opções **Público / VIP / Ministério**, só as dos canais ligados (lidos no servidor da empresa da sessão). VIP: escolhe-se o cliente activo → link pessoal + mensagem PT/EN/FR + WhatsApp. Ministério: aparece desactivado com a nota "chega com as secretárias". **Gancho para o bloco 3:** passar `ministries: LinkMinistry[]` (`{ id, name, secretaries: { id, name, path }[] }`) a `BoTopbarActions` em `src/app/(bo)/admin/price-checker/layout.tsx` — a opção liga-se sozinha quando houver uma secretária.

**Decisão do bloco 1 aplicada:** com B2C desligado, o menu Público e a opção Público do construtor escondem-se; o `/pc` público **não** foi fechado.

Verificação: `bash supabase/tests/run.sh` OK · `npm run build` OK · `npm run i18n:check` OK (o back-office é PT/EN; os textos novos estão numa parte nova `src/i18n/bo/parts/vip.{pt,en}.json`; o dicionário público não mudou).

### Falta
- Colunas `urgency` e `claimedByLabel` na fila (o plano punha-as aqui; a urgência só existe na 0035, bloco 4; "reclamado por X" fica com o bloco 5).
- Opção Ministério do construtor: dados das secretárias (bloco 3).
- O terminal VIP não foi aberto num browser: não há base local com dados e o `.env.local` aponta para o Supabase real (não usado). Testar com o script de dados do bloco 8.
- `graphify update .` não correu (não está instalado).

### Para decidir (humano)
1. **Ligar B2C (e VIP) à Alô nos dados.** A 0031 semeia a Alô só com `B2G`; com esta regra, os agentes da Alô deixam de ver o menu Público e a opção Público no construtor até alguém ligar B2C no Admin (um clique) ou o script do bloco 8 o fazer. Não o pus numa migração para não escrever `alo` no código.
2. A mensagem do link público continua a dizer "da WeeFly" (já era assim): num white label devia dizer o nome da empresa. A mensagem do link VIP já é neutra.
3. O VIP tem de voltar a marcar o consentimento a cada pedido (o contacto vem preenchido). Se preferirem saltar o passo como na secretária, é uma linha no `RequestWizard`.

## Bloco 3 · Ministérios e secretárias (B2G-05, B2G-23, B2G-06, B2G-07)

### Feito

**Migração `0034_ministry_secretaries.sql`** (idempotente, corre duas vezes no `run.sh`):
- `organisations.crest_url` (B2G-05). `organisations.link_token` fica, mas **deixou de ser credencial** (comentário na coluna).
- D-10 · `organisations_manage` substituída por `organisations_insert`/`_delete` (só `cross_partner`) e `organisations_update` (`can_manage_partner`), mais o gatilho `organisations_guard_identity`: uma sessão que não seja da WeeFly não muda empresa, nome, slug, logótipos nem `active` (muda limites e `secretary_sees_balance`). A service role passa.
- `organisation_requests` (pendente/aprovado/recusado, motivo obrigatório na recusa, `decided_by_email/at`, `organisation_id` obrigatório na aprovação, caminhos dos logótipos no bucket `brand`, `requested_by_email`). RLS: a empresa lê os seus, o master todos; nenhuma escrita por sessão. Um nome só fica pendente uma vez por empresa.
- `ministry_secretaries` (empresa forçada pelo gatilho a partir do ministério; ministério e link imutáveis; `link_token` ≥ 192 bits e único; `active = (deactivated_at is null)`; `created_by_email`, `last_access_at`). Leitura: back-office da empresa e master; sem escrita por sessão.
- `ministry_secretary_secrets` (hash do PIN, `pin_version`, quem/quando, falhas, `locked_until`) e `ministry_secretary_sessions` (só o sha256 do token): RLS sem políticas e `revoke all` a `anon`/`authenticated`.
- Funções SECURITY DEFINER, só `service_role`: `secretary_pin_failure` (atómica, 5 seguidas → 15 min; o prazo não estica; expirado recomeça), `secretary_pin_success`, `secretary_set_pin` (só aceita hash `scrypt$…`, sobe a versão, limpa o bloqueio e apaga as sessões), `secretary_session_check` (12 h absolutas, 30 min sem uso, versão do PIN, secretária/ministério/empresa activos; refresca ou apaga). Desactivar uma secretária apaga as sessões dela (gatilho).
- `booking_cases.secretary_id` com chave composta `(secretary_id, organisation_id)` (a secretária é do ministério do caso) e `check` "sem ministério não há secretária". **Já feito para o bloco 4** (a 0035 não precisa de o criar).
- Dados antigos: a secretária de `organisations.secretary_*` e cada conta `secretary` da allowlist passam a uma linha de `ministry_secretaries` **sem PIN** (as suspensas entram desactivadas). Provado à parte num Postgres descartável (idempotente).
- Testes novos: `supabase/tests/test_secretaries.sql` (S1–S9) e `test_ministry_requests.sql` (R1–R7). Sondas novas em `scripts/check-migrations.mjs`.

**Servidor** · `src/lib/secretary-auth.ts`: PIN `crypto.randomInt` de 6 dígitos (recusa 000000/123456 e afins), scrypt com sal de 16 bytes, comparação `timingSafeEqual`; sem hash, compara contra um hash fictício (mesmo tempo). Token de sessão de 32 bytes no cookie `wf_sec`: httpOnly, SameSite=Strict, Secure em produção, `path=/ministerios/<org>/<token>` (o cookie de uma secretária nunca vai no link de outra), 12 h. Travão leve por IP (30 tentativas / 15 min, em memória). O PIN não vai para logs, `access_audit` nem email.

**B2G-06 · secretárias** (`src/actions/secretaries.ts`, `components/b2g/secretaries.tsx`): criar (link + PIN mostrado uma vez, com copiar; email opcional só com o link), gerar PIN novo (quem criou, Admin da empresa ou WeeFly; a versão sobe e as sessões morrem), editar, desactivar/reactivar, reenviar link. Quem gere: WeeFly e qualquer conta do back-office da empresa do ministério (decisão 5), com o canal B2G. Cada acção no `access_audit` (`secretary_created/updated/pin_generated/deactivated/reactivated`; `secretary_pin_locked` quando o bloqueio dispara). Na ficha do ministério (empresa e Admin): quem gerou o PIN e quando, último acesso, bloqueio, quem desactivou. O email de boas-vindas (`lib/emails/ministry-welcome.ts`) passou a ser por secretária e diz que o PIN é entregue pela empresa.

**B2G-07 · sem PIN não há pedido**
- `resolveMinistry` (`lib/ministry.ts`) resolve pelo link da secretária (activa, ministério activo, empresa activa com B2G, subdomínio da empresa). O link antigo do ministério dá 404.
- `/ministerios/[org]/[token]`: a moldura mostra o ecrã do PIN (`components/ministry/pin-screen.tsx`) enquanto não houver sessão **desta** secretária; as páginas (Novo pedido, Minhas passagens) verificam por si e não renderizam nada sem sessão. Botão "Terminar sessão neste dispositivo".
- Mensagem igual para link desconhecido e PIN errado (e o scrypt corre sempre); só o bloqueio tem mensagem própria.
- `submitPcRequest` (`actions/pc.ts`): um pedido com `ministryToken` exige a sessão da secretária dona desse link; o intake (`lib/pc/intake.ts`) volta a verificar a cadeia e grava `secretary_id` no caso, com o nome dela no `case_events` ("Pedido submetido por …").
- `/ministerios/[org]` (sem token): página de passagem, igual para qualquer slug, sem formulário nem acção.
- O caminho de volta da ficha `/pc/[token]` de um caso de ministério é o link pessoal da autora (`lib/pc/state.ts`).

**B2G-23 · pedir um ministério** (`src/actions/ministry-requests.ts`, `components/b2g/ministry-requests.tsx`): no menu Ministérios a empresa deixa de ter "Novo ministério" e passa a ter **Pedir ministério novo** (nome, logótipo horizontal obrigatório, brasão opcional; PNG/JPEG até 2 MB com a assinatura do ficheiro verificada; sobem para `brand/ministry-requests/<empresa>/<pedido>/` pela service role) e a lista dos seus pedidos com estado e motivo (o aviso na aplicação). Admin › B2G: pedidos pendentes de todas as empresas, **aprovar** (nome e slug editáveis; cria o ministério pela sessão do master com `logo_url`/`crest_url`) ou **recusar com motivo**; quem pediu recebe email (`lib/emails/ministry-request-decision.ts`). O master continua a criar directamente ("Novo ministério" em Admin › B2G › empresa). Editar um ministério: a empresa só edita os limites (nome/slug/logótipos desligados, e recusados no servidor e na base).

**B2G-05 · B2G-24** · o brasão aparece sempre ao lado do nome: lista de ministérios, pedidos, ficha, construtor de links. Formulário com "Logótipo horizontal" e "Brasão".

**B2G-03 · construtor de links** · `ministries: LinkMinistry[]` (ministérios activos da empresa, secretárias activas, `path` pessoal, `crestUrl`) passado em `src/app/(bo)/admin/price-checker/layout.tsx`; a opção Ministério liga-se quando há uma secretária.

Verificação: `bash supabase/tests/run.sh` OK · `npm run build` OK · `npm run i18n:check` OK (textos novos em `src/i18n/bo/parts/ministries.{pt,en}.json`; `ministry.pin.*`, `ministry.landing.*` e `pc.errors.ministrySession` em PT/EN/FR). Teste à parte do PIN (formato, sal, certo/errado, mesmo tempo com e sem hash).

### Falta
- **Os passos dentro de `/pc/[token]` de um caso de ministério** (escolher a opção, passageiros, `findMinistryTraveller`) continuam autorizados pelo token do caso, como antes. O bloco 6 leva a ficha do caso para dentro do espaço do ministério (com sessão) e redirecciona o `/pc/{token}`.
- `actor_kind = 'secretary'` no `case_events` e a urgência: bloco 4 (a autora já está em `booking_cases.secretary_id` e no título/payload do evento).
- A deduplicação de duplo clique e o limite por IP do intake ainda se aplicam a pedidos de ministério (B2G-10, bloco 4).
- Os alertas de passaporte e de saldo ainda vão para `organisations.secretary_email` (o contacto antigo); "todas as secretárias activas" (decisão 8) entra com as notificações do bloco 6.
- Não há campainha para a decisão de um pedido de ministério (a campainha é por caso): fica o email e o estado na lista do menu Ministérios.
- O espaço do ministério não foi aberto num browser (sem base local com dados; `.env.local` aponta para o Supabase real, não usado). Testar com o script de dados do bloco 8.
- `graphify update .` não correu (não está instalado).

### Para decidir (humano)
1. **As secretárias que já existem ficam sem acesso** até alguém lhes gerar um PIN e enviar o link novo (o antigo, do ministério, deixou de abrir). É o que a especificação pede ("sem PIN não há pedido"), mas tem de ser avisado antes de aplicar a 0034.
2. Cookie SameSite=Strict (decisão 4): ao abrir o link a partir do email, a secretária volta a ver o ecrã do PIN mesmo com sessão aberta. Se incomodar, `Lax` resolve sem abrir o envio de pedidos a outros sites (as server actions são POST).
3. O ecrã do PIN diz "Olá, <nome>" a quem tiver o link. Se preferirem não mostrar o nome antes do PIN, é uma linha.
4. Brasão opcional no pedido de ministério (os três brasões são o mesmo emblema). Se for obrigatório, é uma linha.
5. O travão por IP é em memória (por processo); com várias instâncias, o travão a sério continua a ser o bloqueio por secretária na base.

## Bloco 4 · Espaço da secretária (B2G-08, B2G-24, B2G-09, B2G-10)

### Feito

**Migração `0035_b2g_requests.sql`** (idempotente, corre duas vezes no `run.sh`):
- `booking_cases.urgency` (`smallint`, 0 Normal · 1 Urgente · 2 Muito urgente, por omissão 0, `check` 0–2), `urgency_changed_at`, `urgency_changed_by_email`; índice `(partner_id, channel, closed_at, urgency desc, created_at)` para a fila do bloco 5.
- `trip_requests.adults` passa de 1–9 a **1–50** (D-7: o pedido do ministério guarda só N, como adultos). O formulário público continua a limitar a 9 no servidor.
- `case_events.actor_kind` aceita `secretary`, com `actor_secretary_id` (FK); `check`: `secretary` ⇔ há secretária; gatilho `case_events_secretary_scope`: a secretária é do ministério do caso.
- `ministry_travellers.created_by_secretary_id` / `updated_by_secretary_id` e `ministry_traveller_changes.changed_by_secretary_id`, com chave composta `(secretária, ministério)`. A autora não muda; uma alteração com `last_source='backoffice'` nunca fica em nome de uma secretária; o gatilho do histórico (`ministry_traveller_log`) grava a secretária e não conta as colunas novas como dados da ficha.
- Teste novo `supabase/tests/test_b2g_requests.sql` (Q1–Q6: urgência, 50/51 pessoas, três pedidos iguais seguidos ficam os três e são do ministério, `actor_kind` da secretária e isolamento por ministério, autoria das fichas, índice). Sondas novas em `scripts/check-migrations.mjs`.

**B2G-09 · formulário simples** (`components/ministry/request-form.tsx`, `actions/ministry-space.ts`): substitui o `RequestWizard` em `/ministerios/[org]/[token]`. Só: pessoas (1–50), de onde (Praia/RAI por omissão, editável, D-1), para onde (o mesmo `AirportField` + `/api/airports` do Price Checker, agora exportado), ida (não no passado), volta (opcional, não antes da ida), urgência (Normal por omissão, D-6), notas. Os obrigatórios em falta e os inválidos aparecem listados por cima do botão e destacados no campo; o servidor repete as regras e devolve a lista. Enviar mostra a referência.
- A acção exige a sessão do PIN da secretária dona do link (`secretaryForLinkToken` + `resolveMinistry`, como no bloco 3) e cria o caso pelo intake de sempre (`createPriceCheckerCase`): canal `ministerio`, ministério, `secretary_id`, `urgency`, `adults = N`, `special_requests = notas`, contacto = a secretária (nome, email, telefone; sem email fica um endereço `…@ministerio.invalid` que nunca recebe nada — `lib/emails/send.ts`). Os mesmos avisos (email à secretária, alerta à equipa) e o `request_submitted` que acende a campainha e o pulso.
- `request_submitted` com `actor_kind='secretary'` + `actor_secretary_id` (`logCaseEvent` ganhou `actorSecretaryId`); se a base ainda não tiver a 0035, cai para `client` em vez de se perder. A campainha mostra o nome da secretária nesses acontecimentos.

**B2G-10 · sem limite** · um pedido de ministério não passa pela deduplicação de 15 min nem pelo limite por IP (no formulário novo e no `submitPcRequest`, se um pedido antigo chegar por lá). Fica um travão **por secretária**: 30 pedidos por hora (`SECRETARY_FLOOD`, erro `pc.errors.ministryFlood`).

**B2G-08 · três áreas** (`components/ministry/tab-bar.tsx`): **Novo pedido · Os meus pedidos · Passageiros**.
- `/pedidos` (`listMinistryRequests`): todos os pedidos do ministério (D-4: as colegas veem os pedidos umas das outras), com referência, rota, datas, pessoas, urgência, estado (recebido, em tratamento, opções disponíveis, opção escolhida, emitido, viagem feita, fechado, cancelado), autora e o registo de actividade. O registo é uma **lista fechada** de acontecimentos (`PUBLIC_TIMELINE_KINDS`) com frases do dicionário: nunca o título, o detalhe nem o payload gravados (notas internas, custos, emails de agentes não saem). O saldo (decisão O2) e o cartão de instalar passaram para aqui. `/passagens` redirecciona para `/pedidos`.
- `/passageiros` (`listMinistryTravellers`): os passageiros guardados do ministério, pesquisa por nome ou passaporte (sem acentos), passaporte só pelos últimos 3 caracteres, aviso "expirado" / "expira em menos de 6 meses". Só leitura (editar e escolher: bloco 6).
- Textos novos `ministry.form.*`, `ministry.urgency.*`, `ministry.requests.*`, `ministry.timeline.*`, `ministry.travellers.*`, `ministry.tabs.*` em PT/EN/FR (saíram `ministry.trips.*` e `ministry.status.*`). Email de boas-vindas actualizado com as três áreas.

**B2G-24 · marca**
- Cabeçalho: logótipo da empresa e logótipo horizontal do ministério lado a lado, **separados por uma linha fina** (`BrandLogo` em `components/pc/chrome.tsx`). "Powered by WeeFly" continua no rodapé (`PcFooter`, segundo `powered_by_weefly` da empresa).
- Título da página = **nome do ministério**; `applicationName` e `appleWebApp.title` também.
- Manifesto: `name` = ministério, `short_name` = a última palavra com sentido ("Saúde"), `id`/`start_url`/`scope` no link pessoal. Ícones = o **brasão** (`organisations.crest_url`), gerados com `sharp` nos tamanhos declarados (192, 512, 512 maskable, 180 apple, 32 favicon) pela rota nova `/ministerios/[org]/[token]/icon/[file]` — sem brasão, os ícones da empresa (ou da WeeFly). O carregador de ficheiros de marca saiu de `api/brand/[file]` para `lib/brand-asset-load.ts` (o mesmo código).
- O brasão aparece sozinho só no ícone; no ecrã do PIN vai com o nome.

**Fila** · `loadBoQueue` devolve `urgency` em cada linha (com recuo numa base sem a 0035). A ordenação e o "reclamar" ficam para o bloco 5.

Verificação: `bash supabase/tests/run.sh` OK · `npm run build` OK · `npm run i18n:check` OK. Geração dos ícones testada à parte com o brasão da Saúde (192/512/512/180, PNG).

### Falta
- O espaço do ministério não foi aberto num browser (sem base local com dados; `.env.local` aponta para o Supabase real, não usado). Testar com o script de dados do bloco 8: B2G-09 (3 pessoas, Praia → Lisboa, ida e volta, nota), B2G-10 (três seguidos, as duas secretárias), instalação no telemóvel.
- "Abrir o pedido" em *Os meus pedidos* continua a levar ao `/pc/{token}` (autorizado pelo token do caso). O bloco 6 traz a ficha para dentro do espaço com sessão; até lá a colega do mesmo ministério também abre o `/pc` dos pedidos da outra (D-4 diz que pode ver).
- `urgency_changed` já está na lista do registo público, mas só o bloco 5 o escreve (mudança pelo agente).
- `listMinistryTrips` (lib) ficou sem uso; pode servir às passagens emitidas do bloco 6.
- `graphify update .` não correu (não está instalado).

### Para decidir (humano)
1. **A 0035 tem de ir antes do código**: sem ela, o pedido do ministério não se grava (a coluna `urgency` e o limite de 50 pessoas). O resto (fila, campainha, Público, VIP) tem recuo e continua a funcionar.
2. **Secretária sem email**: o lead do caso fica com `secretaria-<id>@ministerio.invalid` (o lead exige email). Ela não recebe a confirmação por email; vê o pedido em *Os meus pedidos*. Alternativa: tornar o email obrigatório ao criar a secretária.
3. **Travão de 30 pedidos/hora por secretária**: valor escolhido por mim; ajustável em `SECRETARY_FLOOD` (`lib/pc/intake.ts`).
4. **"Powered by WeeFly" no espaço do ministério** segue o interruptor da empresa (`powered_by_weefly`). A especificação diz "em todos os terminais da Alô": confirmar que está ligado na Alô.
5. O número de passaporte na lista *Passageiros* aparece só pelos 3 últimos caracteres; o bloco 6 (editar) mostra-o inteiro na ficha.

## Bloco 5 · Filas (B2G-11, B2G-12, B2G-13, B2G-14)

### Feito

**Migração `0036_case_claim.sql`** (idempotente, corre duas vezes no `run.sh`). **Atenção: o plano punha a migração do bloco 6 em "0036"; passa a 0037.**
- `claim_case(p_case)` · SECURITY DEFINER, pela sessão (`auth.uid()`): exige `is_bo_allowed()` e `can_see_case` (a empresa da sessão; o master vê todas — D-12, decisão 2); `update … where created_by is null` decide a corrida; grava `claimed_at`, `claimed_by_email`, passa o pedido a `em_tratamento`, escreve `case_claimed` no `case_events` (com "esteve X sem dono") e no `access_audit` (com `cross_partner`: para o master é o registo da intervenção). Devolve `claimed | already_yours | taken | not_found`; quem perde recebe o email e o nome de quem ganhou. Um caso de outra empresa responde `not_found` (sem dizer de quem é).
- White label: o master que reclama um caso de uma empresa que **não** é o operador não escreve `seller_*` (o vendedor aparece ao cliente). Num caso da WeeFly passa a vendedor como antes.
- `release_case(p_case, p_reason)` · só quem supervisiona casos (`access_roles.supervises_cases`: Admin do parceiro do caso, Admin WeeFly) e vê o caso; motivo ≥ 3 caracteres; `case_released` nos dois registos (antes: quem tinha e desde quando).
- `set_case_urgency(p_case, p_urgency)` · qualquer conta do back-office que veja o caso, só no canal `ministerio`, 0–2; `urgency_changed` nos dois registos, `urgency_changed_at/_by_email` no caso.
- Auxiliares `case_actor()`, `case_owner_label()` (sem `execute` para sessões) e `case_elapsed_label()` (o mesmo texto que `elapsedSince`). As três funções: `revoke` a `public`/`anon`, `grant` a `authenticated`.
- Teste novo `supabase/tests/test_b2g_claim.sql` (C1–C8): o segundo perde e sabe quem ganhou; registos; Beta/Alô/agente WeeFly não reclamam fora da sua empresa; master reclama em todas; white label mantém o vendedor; só administradores libertam, com motivo; urgência registada, recusada fora do ministério/fora de 0–2/noutra empresa; sem sessão, secretária e `anon` não fazem nada.

**B2G-13 · reclamar regista e bloqueia**
- `boClaimCase` (`actions/bo-price-checker.ts`) chama `claim_case` pelo cliente da sessão, depois do `boCaseIdentity` de sempre. Numa base sem a 0036 (PGRST202/42883) cai no caminho antigo (que também deixou de escrever o vendedor num caso de outra empresa). Acções novas `boReleaseCase` e `boSetCaseUrgency`.
- "Reclamado por <nome>": `loadBoQueue` traz `claimedByEmail`/`claimedByLabel` (nome da allowlist, lido pela service role só para os emails das linhas que a sessão já vê) e `partnerId`. Aparece na fila do Concierge (debaixo do cliente; "Seu" quando é seu; o erro de quem perde a corrida mostra quem ganhou), nas filas Público/VIP/Ministérios (coluna Dono, com botão Reclamar nos sem dono), no cabeçalho do caso (Dono), na ficha ao lado de "Editar proposta" e por cima do compositor (`BoClaimGate` com `takenBy`, sem botão).
- **Libertar** no cabeçalho do caso, só para quem supervisiona casos, com motivo (a base repete a verificação).

**B2G-11 · ordem** · `loadBoQueue({ order: "urgency" })` — e por omissão em `channel: "ministerio"` — ordena abertos primeiro, urgência desc, depois o mais antigo. Vale no menu Ministérios, no Concierge com `?canal=ministerio` e no concierge do master. A fila pública não mudou. Selector de urgência no cabeçalho dos casos de ministério; etiqueta Urgente/Muito urgente nas filas.

**B2G-14 · D-12 · o master**
- `getBoScope({ workspace: "all" })` → `partnerId: null` só para `isCrossPartner(identity)` (allowlist `cross_partner` **e** perfil Admin WeeFly); uma conta de parceiro que peça "all" recebe o seu parceiro. `getBoScope()` sem argumentos não mudou.
- `caseInScope`: para o master, qualquer caso que o RLS lhe mostre (decisão 2); para os outros, igual. `scopeForCase` lê a ficha do master sem filtro de parceiro; a página `/ofertas` passou a usá-lo (antes usava `getBoScope()` e partia com intervenções). As intervenções ADM-04 continuam (banner e Admin › Casos).
- `/gestao/concierge` (Admin, só `cross_partner`, senão 404): fila de todas as empresas e canais (`loadBoQueue` com o âmbito "all"), filtros por empresa (`?empresa=`, só ids de empresas que a sessão vê) e canal (`?canal=`), Em aberto / Sem dono / Os meus, coluna Empresa, Reclamar e abrir a ficha no Concierge. Entrada "Concierge" no menu do Admin. Usa `ChannelQueue` (o estilo do WeeFly Pro) e não `BoQueueTable`, porque o CSS do Concierge (`bo-pc.css`) é global e partia a moldura do Pro.

**B2G-12 · chega à empresa e ao master**
- `/api/bo/pulse?workspace=all` (só honrado para o master). Para o master no Concierge da WeeFly, a assinatura junta o último pedido de ministério de qualquer empresa; `BoLiveUpdates` ouve também `INSERT` em `booking_cases` com `channel=eq.ministerio` (prop `allMinistries`, só master).
- `QueueLive` (novo): o batimento de 4 s nas filas do Pro — menu Ministérios da empresa e concierge do master — com `router.refresh()` quando muda.
- Campainha: `loadBoAlerts(userId, { workspace })`; para o master, além da sua empresa, os `request_submitted` do canal ministério de todas. A empresa continua a recebê-los pelo seu parceiro.
- Email: `sendNewRequestAlert` continua para a equipa WeeFly (o master) e, num pedido de ministério, envia à parte aos destinatários de alertas da empresa do caso (`alert_recipients`, lado `partner`, gerais e desse ministério; `dedupeKey` próprio).

Verificação: `bash supabase/tests/run.sh` OK (incluindo `test_tenancy`, `test_rbac`) · `npm run build` OK · `npm run i18n:check` OK (textos novos em `src/i18n/bo/parts/queues.{pt,en}.json`; o dicionário público não mudou).

### Falta
- Nada foi aberto num browser (sem base local com dados; `.env.local` aponta para o Supabase real, não usado). Testar com o script de dados do bloco 8: o Dominik reclama, a Alô vê "Reclamado por Dominik"; três pedidos (Normal, Normal, Urgente); um pedido novo nos dois back-offices em < 5 s.
- O master num caso de outra empresa pode agora fazer tudo o que um agente faz (decisão 2). Publicar a proposta ainda envia directamente à secretária: o "Enviar à empresa para revisão" (B2G-15) é do bloco 6.
- A campainha do master vive no Concierge (barra escura); a página `/gestao/concierge` actualiza-se sozinha mas não tem campainha própria.
- A lista de casos dentro da ficha do ministério (`/agente/ministerios/[id]`, histórico com pagamentos) continua por data; a fila do menu Ministérios é que segue a ordem B2G-11.
- `scripts/check-migrations.mjs` só sonda colunas; a 0036 só cria funções (sem sonda nova).
- `graphify update .` não correu (não está instalado).

### Para decidir (humano)
1. **Agentes também libertam?** Fiz como a especificação: só administradores (Admin do parceiro e Admin WeeFly). Um agente que reclamou por engano tem de pedir ao administrador.
2. **Bloquear o compositor a quem não é dono?** Não o fiz: o compositor continua a abrir para colegas (era assim, e o Admin do parceiro publica propostas alheias); quem não é dono vê "Este caso já tem dono · Reclamado por …" por cima. "Bloqueia" ficou como "mais ninguém reclama".
3. **ADM-04 vs D-12:** com a decisão 2, o master abre e trata qualquer caso sem abrir uma intervenção; o registo é o `case_claimed` (e cada acção no registo do caso). Se quiserem "ler sem reclamar = só leitura", é preciso separar a leitura da escrita em `caseInScope`.
4. O email de pedido novo à empresa sai com o remetente e a marca da WeeFly (como o da equipa); num white label talvez se queira o remetente da empresa.
