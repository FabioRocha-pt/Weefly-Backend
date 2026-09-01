/**
 * PM2 — como o Concierge corre no EC2.
 *
 * O `next start` não é um servidor que se possa matar e esquecer: se cair, o
 * site cai com ele. É para isso que o PM2 existe aqui, e é só para isso — não
 * há cluster nem balanceamento nenhum. Uma instância, reiniciada quando morre.
 *
 * **Nada de segredos neste ficheiro.** Ele é versionado; as variáveis vivem em
 * `.env.production`, que não é. O `next start` lê esse ficheiro sozinho no
 * arranque — não é preciso `env_file` nem repetir as chaves aqui.
 *
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup      # sobreviver a um reboot da máquina
 *   pm2 reload weefly-concierge  # depois de cada deploy, sem downtime
 *   pm2 logs weefly-concierge
 */

module.exports = {
  apps: [
    {
      name: "weefly-concierge",
      /*
       * O binário do Next directamente, e não `npm start`.
       *
       * Com `npm` pelo meio, o PM2 vigia o npm e não o Next: um `pm2 reload`
       * fala com o processo errado, e um crash do Next fica escondido atrás de
       * um npm que ainda está de pé.
       */
      script: "./node_modules/next/dist/bin/next",
      args: "start",
      cwd: __dirname,

      instances: 1,
      exec_mode: "fork",

      env: {
        NODE_ENV: "production",
        PORT: 3000,
        /* O NGINX fala com o processo por localhost; ninguém tem de lhe chegar
           de fora. Se o 3000 estiver aberto no security group, fecha-o. */
        HOSTNAME: "127.0.0.1",
        /* As datas do back-office são formatadas em Atlantic/Cape_Verde de
           forma explícita no código. O relógio da máquina fica em UTC para que
           os registos e os prazos não dependam de onde o servidor está. */
        TZ: "UTC",
      },

      /*
       * Um reinício em ciclo é pior do que uma paragem: consome a máquina e
       * enche o disco de logs enquanto ninguém repara. Dez tentativas, com
       * espera crescente, e depois pára e fica à espera de uma pessoa.
       */
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 200,

      /*
       * O Next não tem fugas de memória conhecidas, mas a geração de PDF passa
       * ficheiros inteiros por memória. Um tecto conservador reinicia o
       * processo antes de o kernel o matar — a diferença é que assim o PM2
       * levanta-o outra vez.
       */
      max_memory_restart: "700M",

      merge_logs: true,
      time: true,
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
    },
  ],
}
