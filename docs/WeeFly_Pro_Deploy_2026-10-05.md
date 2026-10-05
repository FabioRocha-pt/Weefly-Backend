# WeeFly · pro.weefly.africa · Como ficou o servidor

| | |
|---|---|
| **Para** | Fábio · Sarin |
| **Data** | 5 de outubro de 2026 |
| **O que foi para o ar** | `pro.weefly.africa` e os subdomínios das empresas (`DOM-01`), a começar por `alo.weefly.africa` |
| **Código** | branch `update/2026-10-02`, a partir do `4aed8eb` |
| **Servidor** | `i-0152d6578ff6a5801` · `eu-west-1` · `52.30.78.0` · `/var/www/concierge` · PM2 `weefly-concierge` |
| **Base de dados** | Migração `0031` aplicada a 5 de outubro (cria a Alô) |

O guia de 30 de setembro (`WeeFly_MVP2_Deploy_2026-09-30.md`) continua a valer para entrar no servidor, para o PM2 e para o build. Este documento regista o que mudou e como se junta uma empresa nova.

---

## 1 · Como está hoje

| Endereço | Onde | Estado |
|---|---|---|
| `pro.weefly.africa` | EC2 | ✅ O backoffice. É o endereço dos emails e dos links |
| `<empresa>.weefly.africa` | EC2 | ✅ `/pc`, `/admin`, `/ministerios` da empresa. Hoje só o `alo` |
| `concierge.weefly.africa` | EC2 | Continua a abrir, até ser desligado (decisão Q3) |
| `weefly.africa` | **Outro servidor** (`34.245.250.2`) | Não é nosso. O `weefly.africa/pc` depende da decisão Q4 |

### DNS
Está na **GoDaddy** (`ns47/ns48.domaincontrol.com`), não no Route 53. Quem tem acesso é o Sarin.

| Tipo | Nome | Valor |
|---|---|---|
| A | `pro` | `52.30.78.0` |
| A | `*` | `52.30.78.0` |
| A | `concierge` | `52.30.78.0` |

Por causa do `*`, **uma empresa nova não precisa de DNS novo**.

### NGINX
`/etc/nginx/sites-enabled/`:

| Ficheiro | No repositório |
|---|---|
| `weefly-pro.conf` | `deploy/nginx/weefly-pro.conf` |
| `concierge.weefly.africa` | Não está (gerido pelo certbot) |
| `weefly-duckdns-off.conf` | `deploy/nginx/weefly-duckdns-off.conf` |

O `deploy/nginx/weefly-dom01.conf` **não está instalado**. Ele conta com um certificado wildcard e com o `weefly.africa` neste servidor, e nenhuma das duas coisas é verdade.

### Certificado
Let's Encrypt por **HTTP-01**, sem wildcard, com o nome `weefly-pro`. A pasta de validação é `/var/www/letsencrypt`.

Hoje leva `pro.weefly.africa` e `alo.weefly.africa`, e renova-se sozinho (`certbot renew --dry-run` passou). O wildcard exigia um TXT novo na GoDaddy a cada 90 dias.

### Ambiente (`.env.production`)
```
NEXT_PUBLIC_SITE_URL=https://pro.weefly.africa
NEXT_PUBLIC_PARTNER_SITE_URL=https://{slug}.weefly.africa
SERVED_HOSTS=pro.weefly.africa,*.weefly.africa,concierge.weefly.africa
```
Não há `NEXT_PUBLIC_PC_SITE_URL`. Sem ela, o price checker da WeeFly fica em `pro.weefly.africa/pc`. A versão anterior está em `.env.production.antes-pro`.

O `concierge` está na lista dos subdomínios reservados (`src/lib/subdomain.ts`). Sem isso, com o modelo `{slug}.weefly.africa`, ele abria "empresa inexistente".

### Supabase
- **Site URL:** `https://pro.weefly.africa`
- **Redirect URLs:** `https://pro.weefly.africa/**`, `https://*.weefly.africa/**` e a do `concierge`
- **Hook Send Email:** `https://pro.weefly.africa/api/auth/send-email`

### Alertas diários
Os `weefly-b2g-alerts` e `weefly-pc-expire` em `/etc/systemd/system/` são os do repositório e chamam o `pro`. Antes chamavam o `concierge`.

---

## 2 · Juntar uma empresa nova (ex.: `mz`)

1. **No Admin:** criar e aprovar a empresa com o subdomínio `mz`.
2. **Esperar 1 minuto.** O middleware guarda durante 60 segundos a resposta "esta empresa não existe" (`src/lib/partner-exists.ts`).
3. **Confirmar dentro do servidor:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -H "Host: mz.weefly.africa" http://127.0.0.1:3000/login
   ```
   Tem de dar `200`. Se der `404`, a empresa não existe com esse `slug`.
4. **Certificado.** Põe no comando **todos** os nomes que já estão no certificado, mais o novo:
   ```bash
   sudo certbot certonly --webroot -w /var/www/letsencrypt \
     --cert-name weefly-pro \
     -d pro.weefly.africa -d alo.weefly.africa -d mz.weefly.africa \
     --deploy-hook "systemctl reload nginx"
   ```
   Para ver os nomes que lá estão: `sudo certbot certificates --cert-name weefly-pro`.
5. **Confirmar de fora:** `curl -s -o /dev/null -w "%{http_code}\n" https://mz.weefly.africa/pc` tem de dar `200`.

Não é preciso build nem reload da aplicação.

---

## 3 · Desligar o `concierge` (decisão Q3)

Só quando ninguém o usar.

1. Tirar `concierge.weefly.africa` do `SERVED_HOSTS`, e depois `npm run build` e `pm2 reload weefly-concierge --update-env`. O `SERVED_HOSTS` é lido no middleware. Fazer o build garante que o valor novo entra, mesmo que o Next o tenha copiado para o código no build anterior.
2. Desligar o site do NGINX:
   ```bash
   sudo rm /etc/nginx/sites-enabled/concierge.weefly.africa
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. Apagar o certificado: `sudo certbot delete --cert-name concierge.weefly.africa`.
4. Tirar o Redirect URL do `concierge` no Supabase.
5. Pedir ao Sarin para apagar o registo `concierge` na GoDaddy.

---

## 4 · Voltar atrás

```bash
cd /var/www/concierge
cp .env.production.antes-pro .env.production
npm run build && pm2 reload weefly-concierge --update-env
```
No Supabase, repor o Site URL e o hook do `concierge`.

O `weefly-pro.conf` pode ficar no NGINX, porque não interfere com o `concierge`. Também há um snapshot do disco, `antes-pro-weefly`, de 5 de outubro.

---

## 5 · Pendente

| # | O quê | Com quem |
|---|---|---|
| 1 | `ministerio.weefly.africa`: os ministérios de uma empresa (um alias) ou um portal próprio? Pelo código de hoje é lido como uma empresa chamada "ministerio" | Manager |
| 2 | `weefly.africa/pc`: a raiz está noutro servidor. Ou esse servidor encaminha o `/pc`, ou o price checker da WeeFly fica num subdomínio | Manager · quem gere `34.245.250.2` |
| 3 | Desligar o `concierge` (secção 3) | Fábio |
| 4 | Atualizar o Next `14.2.2`, que tem falhas de segurança conhecidas | Fábio |
| 5 | O Supabase está no plano FREE: pausa por inatividade e não tem backups diários | Manager |
| 6 | Juntar `'concierge'` à regra `partners_slug_not_reserved` da base de dados (a `0031` não o tem; hoje só o ecrã o bloqueia) | Fábio |
