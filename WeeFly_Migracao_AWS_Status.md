# Migração para AWS — ponto de situação e testes

| | |
|---|---|
| Aplicação | WeeFly Concierge + Price Checker |
| Servidor | `concierge.weefly.africa` — EC2 `t3.medium`, IP `52.30.78.0` |
| Data | 25 de Setembro de 2026, fim do dia |
| Para | Ivandro |
| De | Fábio Rocha |

## Em resumo

A aplicação **já está instalada e a funcionar** no servidor novo, em
`https://concierge.weefly.africa`. Passou 22 dos 24 testes automáticos. Os
outros dois não são falhas: são a porta 22, que o Sarin fecha a seguir, e o
WhatsApp, que também não está configurado no servidor antigo. O email e o
webhook do Resend foram provados com um envio real.

O servidor antigo, no Plesk, continua a funcionar como estava. Faltam os
testes feitos à mão (login, recuperação de password, upload real), o
redireccionamento dos links antigos e, no fim, desligar o servidor antigo.

## Progresso

<div style="display:flex;align-items:center;gap:26px;margin:8px 0 4px;break-inside:avoid"><svg width="150" height="150" viewBox="0 0 160 160" role="img"><circle cx="80" cy="80" r="60" fill="none" stroke="#1c5cab" stroke-width="18" stroke-dasharray="224.19 152.80" stroke-dashoffset="0.00" transform="rotate(-90 80 80)"/><circle cx="80" cy="80" r="60" fill="none" stroke="#86b6ef" stroke-width="18" stroke-dasharray="73.40 303.59" stroke-dashoffset="-226.19" transform="rotate(-90 80 80)"/><circle cx="80" cy="80" r="60" fill="none" stroke="#e4e3df" stroke-width="18" stroke-dasharray="73.40 303.59" stroke-dashoffset="-301.59" transform="rotate(-90 80 80)"/><text x="80" y="82" text-anchor="middle" font-size="30" font-weight="700" fill="#1f2328">60%</text><text x="80" y="102" text-anchor="middle" font-size="11" fill="#57606a">concluído</text></svg><div><div style="display:flex;align-items:center;gap:8px;margin:5px 0"><span style="width:12px;height:12px;border-radius:3px;background:#1c5cab;flex:none"></span><span style="font-weight:700;min-width:38px">60%</span><span>Concluído — 6 de 10 etapas</span></div><div style="display:flex;align-items:center;gap:8px;margin:5px 0"><span style="width:12px;height:12px;border-radius:3px;background:#86b6ef;flex:none"></span><span style="font-weight:700;min-width:38px">20%</span><span>Em verificação — testes à mão e acesso AWS</span></div><div style="display:flex;align-items:center;gap:8px;margin:5px 0"><span style="width:12px;height:12px;border-radius:3px;background:#e4e3df;flex:none"></span><span style="font-weight:700;min-width:38px">20%</span><span>Por fazer — links antigos e desligar o servidor antigo</span></div><div style="margin-top:10px;font-weight:700">Testes automáticos: 22 de 24 passaram, 2 com atenção</div><div style="color:#57606a;font-size:8.5pt;margin-top:6px;max-width:340px">Contado pelas 10 etapas da tabela “Estado da migração”, todas com o mesmo peso.</div></div></div>

## Estado da migração

| Etapa | Estado |
|---|---|
| Servidor, acesso e reconhecimento | **Concluído** |
| Manual de execução | **Concluído** |
| Memória swap, código e variáveis de ambiente | **Concluído** |
| Build, arranque com PM2 e tarefa horária dos pagamentos | **Concluído** |
| NGINX ligado à aplicação | **Concluído** |
| Webhooks e integrações — Resend, Supabase | **Concluído** |
| Testes ponta a ponta | Automáticos concluídos, faltam os feitos à mão |
| Acesso AWS: Session Manager e snapshots | Servidor confirmado, falta o nosso primeiro login e a primeira snapshot |
| Links antigos redireccionados para o domínio novo | Por fazer |
| Desligar o servidor antigo | Por fazer, no fim, depois de tudo verificado |

## Resultado dos testes

| Área | Teste | Resultado | Estado |
|---|---|---|---|
| Domínio | DNS aponta para o servidor novo | `52.30.78.0` | <span class="st ok">OK</span> |
| Domínio | `http` redirecciona para `https` | 301 | <span class="st ok">OK</span> |
| Domínio | Certificado SSL válido | Let's Encrypt, até 30/11/2026 | <span class="st ok">OK</span> |
| Domínio | Renovação automática do certificado | Simulação passou | <span class="st ok">OK</span> |
| Segurança | Porta 3000 fechada ao exterior | Fechada | <span class="st ok">OK</span> |
| Segurança | Porta 22 (SSH) | Aberta a qualquer IP — o Sarin fecha a seguir | <span class="st warn">Atenção</span> |
| Segurança | Rota de diagnóstico fechada sem token | 404 | <span class="st ok">OK</span> |
| Segurança | Tarefa de expiração exige token | 401 sem token, 200 com token | <span class="st ok">OK</span> |
| Segurança | Webhook do Resend recusa pedidos sem assinatura | 401 | <span class="st ok">OK</span> |
| Segurança | IP real do cliente chega à aplicação | `X-Forwarded-For` configurado | <span class="st ok">OK</span> |
| Páginas | Páginas públicas respondem | 200, todas abaixo de 0,5 s | <span class="st ok">OK</span> |
| Páginas | Páginas privadas pedem login | Redireccionam para `/login` | <span class="st ok">OK</span> |
| Páginas | Link de cliente inválido | 404 | <span class="st ok">OK</span> |
| Páginas | Ficheiros estáticos em cache | 1 ano, `immutable` | <span class="st ok">OK</span> |
| Uploads | Comprovativo até 12 MB | 11 MB passa, 13 MB é cortado (413) | <span class="st ok">OK</span> |
| Integrações | Supabase — chave pública e chave de serviço | Aceites (200) | <span class="st ok">OK</span> |
| Integrações | Envio de email pelo Resend | 2 emails de teste aceites | <span class="st ok">OK</span> |
| Integrações | Webhook do Resend no domínio novo | 4 chamadas recebidas e validadas | <span class="st ok">OK</span> |
| Integrações | Webhook da WeePay | Desligado sem credenciais (503), igual ao antigo | <span class="st exp">Esperado</span> |
| Integrações | WhatsApp | Sem credenciais, igual ao antigo | <span class="st warn">Atenção</span> |
| Servidor | Aplicação no PM2, arranque automático | Online, utilizador `ubuntu` | <span class="st ok">OK</span> |
| Servidor | Tarefa horária dos pagamentos vencidos | Activa, última execução com sucesso | <span class="st ok">OK</span> |
| Servidor | Memória, swap e disco | 3,0 GB livres, 2 GB swap, 23 GB de disco | <span class="st ok">OK</span> |
| Servidor | Agente SSM e instance profile | Activo e ligado | <span class="st ok">OK</span> |

## Por testar à mão

| Teste | Porquê não é automático |
|---|---|
| Login no back-office com uma conta real | Precisa de uma password real |
| Recuperar password: o link tem de abrir em `concierge.weefly.africa` | Confirma a configuração do Supabase, e o link chega por email |
| Upload de um comprovativo real num link de cliente | Cria um registo real na base de dados |
| Reinício da máquina | Deixa o site em baixo durante um ou dois minutos |
| Primeira snapshot do disco | Faz-se na consola da AWS |

## Pontos de atenção

- **Porta 22 aberta a qualquer IP.** O Session Manager já funciona do lado do
  servidor. Falta o nosso primeiro login na consola; depois disso, o Sarin fecha
  a porta.
- **A chave de leitura do GitHub ainda é recusada.** O código foi enviado
  directamente, e o site não depende disto. Mas, até ficar resolvido, cada
  actualização é enviada do meu computador.
- **Uma chave do Supabase vinha errada do Plesk.** Faltava-lhe um caractere, e
  o Supabase recusava-a. No servidor novo está a correcta. Vale a pena confirmar
  se a do Plesk também está assim, porque nesse caso o login no servidor antigo
  pode estar a falhar.
- **Um pagamento parado no estado `STARTED`** (`f75748e8…`). A tarefa horária
  tenta fechá-lo e a aplicação recusa, como previsto. Vem da base de dados, não
  da migração, mas deve ser visto.
- **WhatsApp e WeePay sem credenciais**, tal como no servidor antigo. As rotas
  estão desligadas e os emails saem normalmente.
- **Node 20.** O Supabase avisa que vai deixar de o suportar. Hoje funciona
  bem; a actualização para Node 22 fica para depois do lançamento.

---

# AWS migration — status and test report

| | |
|---|---|
| Application | WeeFly Concierge + Price Checker |
| Server | `concierge.weefly.africa` — EC2 `t3.medium`, IP `52.30.78.0` |
| Date | 25 September 2026, end of day |
| To | Ivandro |
| From | Fábio Rocha |

## Summary

The app is **installed and running** on the new server at
`https://concierge.weefly.africa`. It passed 22 of the 24 automated tests. The
other two are not failures: port 22, which Sarin closes next, and WhatsApp,
which is not configured on the old server either. Email and the Resend webhook
were proven with a real send.

The old server, on Plesk, is still running as before. Still to do: the manual
tests (login, password recovery, real upload), redirecting the old links and,
last, shutting down the old server.

## Progress

<div style="display:flex;align-items:center;gap:26px;margin:8px 0 4px;break-inside:avoid"><svg width="150" height="150" viewBox="0 0 160 160" role="img"><circle cx="80" cy="80" r="60" fill="none" stroke="#1c5cab" stroke-width="18" stroke-dasharray="224.19 152.80" stroke-dashoffset="0.00" transform="rotate(-90 80 80)"/><circle cx="80" cy="80" r="60" fill="none" stroke="#86b6ef" stroke-width="18" stroke-dasharray="73.40 303.59" stroke-dashoffset="-226.19" transform="rotate(-90 80 80)"/><circle cx="80" cy="80" r="60" fill="none" stroke="#e4e3df" stroke-width="18" stroke-dasharray="73.40 303.59" stroke-dashoffset="-301.59" transform="rotate(-90 80 80)"/><text x="80" y="82" text-anchor="middle" font-size="30" font-weight="700" fill="#1f2328">60%</text><text x="80" y="102" text-anchor="middle" font-size="11" fill="#57606a">done</text></svg><div><div style="display:flex;align-items:center;gap:8px;margin:5px 0"><span style="width:12px;height:12px;border-radius:3px;background:#1c5cab;flex:none"></span><span style="font-weight:700;min-width:38px">60%</span><span>Done — 6 of 10 steps</span></div><div style="display:flex;align-items:center;gap:8px;margin:5px 0"><span style="width:12px;height:12px;border-radius:3px;background:#86b6ef;flex:none"></span><span style="font-weight:700;min-width:38px">20%</span><span>Being checked — manual tests and AWS access</span></div><div style="display:flex;align-items:center;gap:8px;margin:5px 0"><span style="width:12px;height:12px;border-radius:3px;background:#e4e3df;flex:none"></span><span style="font-weight:700;min-width:38px">20%</span><span>To do — old links and shutting down the old server</span></div><div style="margin-top:10px;font-weight:700">Automated tests: 22 of 24 passed, 2 need attention</div><div style="color:#57606a;font-size:8.5pt;margin-top:6px;max-width:340px">Based on the 10 steps in the “Migration status” table, each weighted equally.</div></div></div>

## Migration status

| Step | Status |
|---|---|
| Server, access and check | **Done** |
| Runbook | **Done** |
| Swap memory, code and environment variables | **Done** |
| Build, PM2 start and hourly payments job | **Done** |
| NGINX connected to the app | **Done** |
| Webhooks and integrations — Resend, Supabase | **Done** |
| End-to-end tests | Automated done, manual still to do |
| AWS access: Session Manager and snapshots | Server side confirmed; our first login and first snapshot still to do |
| Old links redirected to the new domain | To do |
| Shut down the old server | To do, last, once everything is checked |

## Test results

| Area | Test | Result | Status |
|---|---|---|---|
| Domain | DNS points to the new server | `52.30.78.0` | <span class="st ok">OK</span> |
| Domain | `http` redirects to `https` | 301 | <span class="st ok">OK</span> |
| Domain | SSL certificate valid | Let's Encrypt, until 30 Nov 2026 | <span class="st ok">OK</span> |
| Domain | Automatic certificate renewal | Dry run passed | <span class="st ok">OK</span> |
| Security | Port 3000 closed from outside | Closed | <span class="st ok">OK</span> |
| Security | Port 22 (SSH) | Open to any IP — Sarin closes it next | <span class="st warn">Attention</span> |
| Security | Diagnostics route closed without token | 404 | <span class="st ok">OK</span> |
| Security | Expiry job requires token | 401 without, 200 with token | <span class="st ok">OK</span> |
| Security | Resend webhook rejects unsigned requests | 401 | <span class="st ok">OK</span> |
| Security | Client's real IP reaches the app | `X-Forwarded-For` set | <span class="st ok">OK</span> |
| Pages | Public pages respond | 200, all under 0.5 s | <span class="st ok">OK</span> |
| Pages | Private pages require login | Redirect to `/login` | <span class="st ok">OK</span> |
| Pages | Invalid customer link | 404 | <span class="st ok">OK</span> |
| Pages | Static files cached | 1 year, `immutable` | <span class="st ok">OK</span> |
| Uploads | Receipt up to 12 MB | 11 MB passes, 13 MB is cut (413) | <span class="st ok">OK</span> |
| Integrations | Supabase — public and service keys | Accepted (200) | <span class="st ok">OK</span> |
| Integrations | Email sending via Resend | 2 test emails accepted | <span class="st ok">OK</span> |
| Integrations | Resend webhook on the new domain | 4 calls received and verified | <span class="st ok">OK</span> |
| Integrations | WeePay webhook | Off without credentials (503), same as old server | <span class="st exp">Expected</span> |
| Integrations | WhatsApp | No credentials, same as old server | <span class="st warn">Attention</span> |
| Server | App on PM2, starts on boot | Online, user `ubuntu` | <span class="st ok">OK</span> |
| Server | Hourly expired-payments job | Active, last run succeeded | <span class="st ok">OK</span> |
| Server | Memory, swap and disk | 3.0 GB free, 2 GB swap, 23 GB disk | <span class="st ok">OK</span> |
| Server | SSM agent and instance profile | Active and attached | <span class="st ok">OK</span> |

## Manual tests still to do

| Test | Why it isn't automated |
|---|---|
| Back-office login with a real account | Needs a real password |
| Password recovery: the link must open on `concierge.weefly.africa` | Confirms the Supabase setting, and the link arrives by email |
| Uploading a real receipt on a customer link | Creates a real database record |
| Rebooting the machine | Takes the site down for a minute or two |
| First disk snapshot | Done in the AWS console |

## Points to watch

- **Port 22 open to any IP.** Session Manager already works on the server
  side. Once we log in to the console for the first time, Sarin closes the port.
- **The read-only GitHub key is still rejected.** The code was sent directly and
  the site does not depend on this. But until it is fixed, every update is sent
  from my computer.
- **One Supabase key from Plesk was wrong.** It was one character short and
  Supabase rejected it. The new server has the correct one. Worth checking
  whether the Plesk copy has the same problem, because then login on the old
  server may be failing.
- **One payment stuck in `STARTED`** (`f75748e8…`). The hourly job tries to
  close it and the app refuses, as designed. It comes from the database, not the
  migration, but should be looked at.
- **WhatsApp and WeePay have no credentials**, as on the old server. Those
  routes are off and emails go out normally.
- **Node 20.** Supabase warns it will stop supporting it. It works fine today;
  the upgrade to Node 22 can wait until after launch.
