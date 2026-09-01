#!/usr/bin/env node
/**
 * Gera `src/lib/tickets/fonts.ts` a partir dos .ttf em `src/assets/fonts`.
 *
 * Correr só quando as fontes mudarem:
 *
 *   node scripts/build-ticket-fonts.mjs
 *
 * Porque é que as fontes vivem em base64 dentro de um módulo e não em disco:
 * o gerador do bilhete corre no servidor do Next, e ler um .ttf por um caminho
 * construído em tempo de execução funciona em desenvolvimento e desaparece no
 * build de produção — o rastreio de ficheiros do Next não segue caminhos que
 * não consegue ver no código. Um bilhete que não gera é pior do que 335 KB de
 * módulo que nunca chega ao browser.
 */

import { readFileSync, writeFileSync } from "node:fs"

const FILES = {
  SANS: "src/assets/fonts/PlusJakartaSans-Regular.ttf",
  SANSBOLD: "src/assets/fonts/PlusJakartaSans-Bold.ttf",
  /*
   * Roboto Mono e não IBM Plex Mono, que é a mono da marca.
   *
   * Os .ttf do IBM Plex Mono servidos pelo Google Fonts não são lidos pelo
   * fontkit — a tabela `glyf` rebenta a leitura ("Trying to access beyond
   * buffer length"), com e sem subconjunto. Roboto Mono passa, tem os mesmos
   * algarismos de largura fixa e é para isso que serve aqui: alinhar treze
   * dígitos de um número de bilhete uns por baixo dos outros.
   *
   * Se um dia houver um IBM Plex Mono que o fontkit leia, troca-se o ficheiro e
   * volta-se a correr este script.
   */
  MONO: "src/assets/fonts/RobotoMono-Medium.ttf",
}

const header = `/**
 * EM-02 · as fontes do bilhete, embebidas no código.
 *
 * O critério pede fontes embebidas no PDF — "abre igual em qualquer máquina" —
 * e para as embeber é preciso ter os ficheiros à mão no momento de gerar. Ler
 * .ttf do disco parece o caminho óbvio e é o que falha: o Next não segue
 * caminhos construídos em tempo de execução, e o que funciona em dev
 * desaparece no build de produção. Um bilhete que não gera é pior do que um
 * ficheiro grande.
 *
 * São Plus Jakarta Sans (a fonte da marca) e IBM Plex Mono (a dos códigos, onde
 * o alinhamento de treze dígitos importa), em base64. Só servidor: isto nunca
 * chega ao browser de ninguém.
 *
 * Geradas por scripts/build-ticket-fonts.mjs a partir de src/assets/fonts/.
 * Licença: SIL Open Font License 1.1.
 */

`

let out = header
for (const [name, path] of Object.entries(FILES)) {
  const base64 = readFileSync(path).toString("base64")
  out += `export const ${name}_TTF = Buffer.from(\n  "${base64}",\n  "base64"\n)\n\n`
}

writeFileSync("src/lib/tickets/fonts.ts", out)
console.log(`src/lib/tickets/fonts.ts · ${(out.length / 1024).toFixed(0)} KB`)
