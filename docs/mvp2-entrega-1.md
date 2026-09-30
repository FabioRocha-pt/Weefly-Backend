# MVP 2 · Primeira entrega para testar (passos 0 a 3)

Base: `WeeFly_MVP2_Para_Developer.md` (30 de setembro). Esta entrega cobre a
*Sequência* 0 a 3 — `MIG-02`, `TEN-01`, `TEN-03`, `TEN-06`, `ADM-02`, `ADM-09`,
`ADM-01` — e prepara os testes dos Blocos A e B (B1 a B6).

## O que mudou

| Item | Onde | O que faz |
|---|---|---|
| `MIG-02` | `src/lib/site-url.ts`, `src/lib/case-partner.ts`, `src/lib/served-hosts.ts`, `src/middleware.ts` | Todos os links gerados leem o endereço da configuração. Deixou de haver links tirados do `origin` do pedido ou do `window.location`: quem abria o back-office pelo endereço antigo gerava links para o endereço antigo. Os links do cliente de um caso de parceiro saem do endereço do parceiro (quando `NEXT_PUBLIC_PARTNER_SITE_URL` existir). `SERVED_HOSTS` faz a aplicação responder 404 a qualquer outro endereço. |
| `MIG-02` | `deploy/nginx/weefly-duckdns-off.conf` | Substitui o redireccionamento do `MIG-01`: o duckdns deixa de responder (444, e recusa do TLS). |
| `TEN-01` | 0020 (já aplicada) | Sem alterações. `partner_id` nunca nulo, organização opcional. |
| `TEN-03` | `src/lib/bo-scope.ts` | As listas do back-office (fila, pesquisa, campainha, clientes, batimento) leem pelo **cliente da sessão**: é o RLS que decide. Cada acção sobre um caso pergunta primeiro ao RLS se a sessão o vê (`caseInScope`); um caso de outro parceiro dá 404. Um pagamento tem de ser do caso que a acção diz. A trava que recusava todas as contas que não fossem da WeeFly saiu. |
| `TEN-06` · `ADM-02` | 0026, `src/lib/access-roles.ts`, `src/lib/bo-access.ts`, `src/lib/pro-account.ts` | Cinco perfis fixos guardados como dados (`access_roles`). O perfil vive na `bo_allowlist`, a mesma linha que o RLS lê. O Admin aparece a quem tem o perfil *Admin WeeFly*, e não só ao Dominik. Um Admin do parceiro não pode dar o perfil Admin WeeFly — imposto pelo RLS (`can_manage_access`) e por trigger, não só no ecrã. O login abre o Concierge por defeito (`/entrar`). |
| `ADM-02` | `/gestao/utilizadores`, `/agente/equipa`, `src/actions/access.ts` | Criar, editar, suspender e reactivar. Não se apaga nada. Suspender termina as sessões abertas (sessões apagadas no GoTrue + conta banida) e o RLS deixa de reconhecer a conta no pedido seguinte. Cada alteração fica em `access_audit` (autor, data, antes e depois), escrita por trigger. |
| `ADM-09` | 0026 | `admilsonborges@bonako.com` com o perfil Admin WeeFly. |
| `ADM-01` | `/gestao/parceiros`, `src/actions/partners.ts` | Criar, editar a marca (`TEN-02`, campos do parceiro), suspender e reactivar. Criar um parceiro cria o primeiro Admin do parceiro e envia o convite. Suspender bloqueia o login e congela os links do `/pc` (e o bilhete). |
| `ADM-07` | 0026 | `booking_cases.commission_rate` e `commission_amount`, nulos. Nada é calculado. |
| Admin | menu lateral | Contas · Utilizadores e permissões · Parceiros · B2G · Números · Receita. Os três últimos com *Brevemente* e o item a que pertencem. |

Os ecrãs novos estão em português, como o resto do back-office: o `I18N-01` é
do passo 4.

## Antes de fazer deploy

1. **Aplicar a 0026** no SQL Editor (`supabase/migrations/0026_mvp2_rbac.sql`).
   É idempotente. Foi provada no Postgres de teste (`bash supabase/tests/run.sh`:
   0001–0026, a 0026 duas vezes, e os três ficheiros de testes).
   Confirmar depois com `node scripts/check-migrations.mjs`.

   O código funciona sem ela (os perfis são deduzidos como a 0026 os deduz, e os
   ecrãs de gestão respondem 404), mas o Admilson, os ecrãs de gestão e o
   registo precisam dela.

2. **Ambiente no EC2** (`.env.production`):

   ```
   NEXT_PUBLIC_SITE_URL=https://concierge.weefly.africa
   SERVED_HOSTS=concierge.weefly.africa
   # Só quando o DNS e o certificado wildcard existirem (TEN-04):
   # NEXT_PUBLIC_PARTNER_SITE_URL=https://{slug}.weefly.africa
   # E, se o site público for outro servidor:
   # NEXT_PUBLIC_WEBSITE_URL=https://weefly.africa
   ```

   ⚠ O ficheiro local `env.production.extra` tem
   `NEXT_PUBLIC_SITE_URL= https://weefly.duckdns.org`. Se o do servidor for
   igual, todos os emails saem com links para o duckdns. Confirmar no servidor.
   As `NEXT_PUBLIC_` são lidas no build: mudar uma obriga a `npm run build`.

   `SERVED_HOSTS` tem de ter **todos** os endereços que este servidor serve.
   Sem a variável, a aplicação serve tudo; com ela errada, responde 404 a tudo.

3. **NGINX**: instalar `deploy/nginx/weefly-duckdns-off.conf` (instruções no
   ficheiro), tirar `weefly.duckdns.org` de qualquer outro `server_name`, e
   desligar o actualizador do DuckDNS (ou apagar o domínio na conta DuckDNS).
   Verificar com os dois `curl` do ficheiro.

4. **Admilson**: depois da 0026, em *Admin › Utilizadores e permissões*,
   *Reenviar convite* na linha dele (ou ele regista-se com esse email e entra
   aprovado).

## Como testar (Bloco A e B1–B6)

Precisa de: a 0026 aplicada, uma conta Admin WeeFly (Dominik ou Admilson), e o
parceiro de teste criado em *Admin › Parceiros* (B2), com o primeiro
administrador num email de teste.

- **A1–A8** entram com uma conta da Alô. As listas e as acções leem pelo RLS; um
  endereço de um caso da WeeFly dá 404. Não há exportação ainda (é o `ADM-03`),
  por isso o A6 não tem o que exportar.
- **A9**: o Admin vê os dois parceiros em *Parceiros* e *Utilizadores*. A vista
  dos casos de todos os parceiros é o B2G (`ADM-08`, passo 5): no Concierge,
  mesmo o Admin WeeFly vê só os casos da WeeFly (é o que faz o A7 passar).
- **A10** (`alo.weefly.africa/m/nao-existe`) depende do `TEN-04`: o subdomínio
  ainda não existe no DNS.
- **B1–B6** no ecrã *Utilizadores e permissões*. O B4 e o B5 estão também
  provados na base de dados (`supabase/tests/test_rbac.sql`).

## O que fica para os passos seguintes

- `TEN-04`: DNS e certificado wildcard para `*.weefly.africa`, e o
  encaminhamento por subdomínio. Até lá os casos novos dos links públicos
  continuam a entrar pelo `default_partner_id()` da 0020 (a WeeFly) — é a única
  linha que ainda "assume que o parceiro é a WeeFly", e sai com o `TEN-04`.
- Um link `?company=` de um parceiro suspenso cai hoje na WeeFly, em vez de ser
  recusado. Resolve-se com o `TEN-04` (o parceiro passa a vir do subdomínio).
- `TEN-02` (marca no ecrã e nos emails), `TEN-05`, `I18N-01`: passo 4.
- `MIN-01` e a decisão **O4**: como entra a secretária. Hoje o perfil existe, tem
  ministério obrigatório e não entra no back-office.
