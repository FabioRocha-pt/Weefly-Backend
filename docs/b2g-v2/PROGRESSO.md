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
