#!/bin/sh
# Reconhecimento do EC2, só de leitura — não instala nem altera nada.
#
#   ssh -i ~/.ssh/concierge-weefly-key.pem ubuntu@52.30.78.0 'sh -s' < deploy/recon.sh
#
# Corre da máquina local, pelo stdin do ssh — não é preciso o repositório no
# servidor. O resultado decide o resto do runbook: a versão do sistema e do
# glibc decidem se o Node 18+ corre, a RAM decide o swap, e o certbot/cron
# dizem o que falta instalar.

section() { printf '\n== %s ==\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

section "sistema"
whoami; hostname
head -3 /etc/os-release
uname -r

# AL2 tem glibc 2.26; o Node 18+ precisa de 2.28. É o veredicto que interessa.
section "glibc (Node 18+ precisa de >= 2.28)"
ldd --version 2>&1 | head -1

section "memória e disco"
free -h
swapon --show
df -h /
lsblk -f 2>/dev/null | head -10

section "node / npm / pm2"
if have node; then node -v; command -v node; else echo "node: não instalado"; fi
if have npm; then npm -v; npm root -g; else echo "npm: não instalado"; fi
if have pm2; then pm2 -v; command -v pm2; else echo "pm2: não instalado"; fi

# Um daemon PM2 de root esquecido é o que faz a aplicação não voltar depois de
# um reboot: o `pm2 startup` fica registado no utilizador errado.
section "daemons PM2 a correr (e de quem)"
# Só o `ps`. Um `sudo pm2 list` parece inofensivo, mas arranca um daemon novo
# em /root/.pm2 quando não existe nenhum — cria exactamente o que se procura.
ps -eo user,pid,cmd | grep -i '[p]m2' || echo "nenhum"

section "portas à escuta"
sudo -n ss -ltnp 2>/dev/null || ss -ltn

section "nginx"
if have nginx; then
  nginx -v 2>&1
  sudo -n nginx -t 2>&1
  sudo -n nginx -T 2>/dev/null | grep -nE "# configuration file|server_name|listen|client_max_body_size|proxy_pass|ssl_certificate "
else
  echo "nginx: não instalado"
fi

section "certbot e renovação"
if have certbot; then certbot --version 2>&1; command -v certbot; else echo "certbot: não encontrado no PATH"; fi
rpm -q certbot 2>/dev/null
systemctl list-timers --all 2>/dev/null | grep -i certbot || echo "nenhum timer de certbot"
sudo -n certbot certificates 2>/dev/null | grep -E "Certificate Name|Domains|Expiry"

# Algumas imagens mínimas não trazem cron. O runbook usa um timer de systemd,
# mas convém saber.
section "cron"
if have crontab; then echo "crontab: presente"; else echo "crontab: ausente"; fi

section "SSM agent (acesso sem porta 22)"
# No Ubuntu vem por snap, com outro nome de unidade.
systemctl is-active amazon-ssm-agent 2>/dev/null \
  || systemctl is-active snap.amazon-ssm-agent.amazon-ssm-agent 2>/dev/null \
  || echo "amazon-ssm-agent: inactivo ou ausente"

section "/var/www"
ls -la /var/www 2>/dev/null || echo "/var/www não existe"

section "git"
if have git; then git --version; else echo "git: não instalado"; fi
