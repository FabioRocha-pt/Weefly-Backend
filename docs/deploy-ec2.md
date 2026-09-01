# Deploy — EC2, NGINX e PM2

Substitui as instruções de Plesk do README para este servidor. O
`concierge.weefly.africa` corre numa instância EC2 com NGINX à frente e PM2 a
segurar o processo.

---

## 1 · O NGINX tem de deixar passar 8 MB

**Isto é o primeiro ponto do documento porque é o que parte em silêncio.**

O cliente carrega o comprovativo de pagamento no ecrã dele — JPG, PNG ou PDF,
até **8 MB** (`PROOF_MAX_BYTES`, e o mesmo limite no bucket do Supabase). O
`client_max_body_size` do NGINX está por omissão em **1 MB**.

O que acontece sem isto: uma fotografia de um comprovativo tirada com um
telemóvel moderno tem 3 a 6 MB. O NGINX corta o pedido com `413` antes de ele
chegar à aplicação, e o cliente vê uma falha de upload que nenhum log da
aplicação explica — porque o pedido nunca lá chegou.

É exactamente o mesmo sintoma que o `X-01` deste sprint acabou de resolver do
outro lado. Não vale a pena arranjar a abertura do comprovativo e deixar o
envio dele partido.

```nginx
server {
    listen 443 ssl http2;
    server_name concierge.weefly.africa;

    # ── ssl_certificate … (o que o Certbot já configurou) ──

    # O comprovativo do cliente: 8 MB mais a folga do multipart.
    client_max_body_size 12M;
    client_body_timeout  120s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        # O ecrã de consentimento promete guardar o IP de quem o deu, e a
        # aplicação lê-o desta cabeçalho. Sem ela, todos os pedidos ficam
        # registados como vindos de 127.0.0.1.
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # A emissão gera três PDFs e envia o email no mesmo pedido. Sessenta
        # segundos chegam com folga, mas o valor por omissão do NGINX é o mesmo
        # e vale a pena estar escrito em vez de assumido.
        proxy_read_timeout 90s;

        proxy_buffering off;
    }

    # Os ficheiros estáticos do Next têm hash no nome: nunca mudam de conteúdo,
    # e podem ficar em cache para sempre.
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

Depois: `sudo nginx -t && sudo systemctl reload nginx`.

**Não é preciso configuração de WebSocket.** As actualizações em tempo real do
back-office (BO-03) vão do browser directamente para o Supabase, não passam por
este servidor.

---

## 2 · As variáveis de ambiente

Ficheiro `.env.production` na raiz da aplicação (a mesma pasta do
`package.json`). Não é versionado. O `next start` lê-o no arranque.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Tem de ser o endereço público real: é o que vai dentro de cada email e é o
# que forma o link do cliente. Um valor errado aqui manda toda a gente para um
# sítio que não existe, e os emails saem à mesma.
NEXT_PUBLIC_SITE_URL=https://concierge.weefly.africa

RESEND_API_KEY=
CONCIERGE_FROM_EMAIL="WeeFly Concierge <concierge@weefly.africa>"
CONCIERGE_TEAM_EMAIL=info@weefly.africa,info@weefly.cv
RESEND_WEBHOOK_SECRET=
CONCIERGE_DIAGNOSE_TOKEN=

# Opcionais — ver docs/sprint2-notificacoes.md
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_TEAM_NUMBER=
```

`chmod 600 .env.production`. O ficheiro tem a chave de serviço do Supabase, que
passa por cima de todas as políticas de RLS.

### O que muda por o domínio ser `concierge.weefly.africa`

| Onde | Valor |
|---|---|
| Link do cliente | `https://concierge.weefly.africa/pc/{token}` |
| Webhook no Resend | `https://concierge.weefly.africa/api/webhooks/resend` |
| Remetente dos emails | continua `@weefly.africa` — o DKIM está no domínio-mãe e cobre o subdomínio |

---

## 3 · Deploy

```bash
cd /var/www/concierge          # onde quer que a aplicação viva
git pull
npm ci                          # ci, não install: respeita o package-lock
npm run build
pm2 reload weefly-concierge
```

### Se o `npm run build` for morto sem explicação

É falta de memória, e não um erro do código. O `next build` chega a pedir 1,5 GB.
Numa instância de 1 GB é morto pelo kernel sem mensagem nenhuma.

Duas saídas, por ordem de preferência:

1. **Construir noutro sítio** e enviar a pasta `.next` já construída. É o que
   evita ter de pagar por memória que só é precisa dois minutos por deploy.
2. **Swap**, se a instância for pequena e o deploy for raro:
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

---

## 4 · Antes de dizer que está no ar

1. **As migrações estão aplicadas** — `0012` e `0013` no SQL Editor do Supabase.
   Sem elas a aplicação arranca e falha só quando alguém a usa.
2. `https://concierge.weefly.africa/api/concierge/diagnose?token=…` responde e
   não tem `blockers`.
3. Submeter um pedido real em `/pc`. Tem de chegar:
   - o email de confirmação ao cliente (NT-01);
   - o alerta à equipa (NT-02).
4. Carregar um comprovativo **de 5 MB** — é este o teste que apanha o
   `client_max_body_size`. Um de 200 KB passa com a configuração errada.
5. Abrir esse comprovativo no back-office (X-01).
6. Emitir um caso de teste e confirmar que o PDF aparece no link do cliente.
7. Na aba **Comunicações** do caso, os avisos passam de `enviado` a `entregue`.
   Se ficarem em `enviado`, falta o webhook do Resend.

---

## 5 · Segurança

- **Porta 3000 fechada** no security group. Só o NGINX lhe fala, por localhost.
- **Portas abertas:** 443, 80 (redirecionamento e renovação do certificado), 22
  restrita por IP.
- **A chave SSH que veio por mensagem deve ser substituída.** Ver a nota na
  resposta ao fornecedor: uma chave privada que atravessou uma aplicação de
  mensagens deixou de ser privada em qualquer sentido útil.
- **Renovação do certificado:** confirmar que o temporizador do Certbot está
  activo (`systemctl list-timers | grep certbot`). Um certificado que expira ao
  domingo derruba o site e os links de todos os clientes.
- **Cópias de segurança:** a máquina não guarda dados — está tudo no Supabase.
  O que se perde numa falha é a configuração, não os casos. Ainda assim, um
  snapshot do EBS depois de o servidor estar configurado poupa uma tarde.
