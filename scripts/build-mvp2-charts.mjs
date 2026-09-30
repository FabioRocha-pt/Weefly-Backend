/**
 * Os dois diagramas do documento de estado do MVP 2, em PT e em EN.
 *
 *   node scripts/build-mvp2-charts.mjs pt
 *   node scripts/build-mvp2-charts.mjs en
 *
 * Um terceiro argumento dá uma versão aos ficheiros (`… pt v2` →
 * `mvp2-progresso-v2.svg`), para que um documento novo não mude as imagens
 * de um documento já enviado.
 *
 * Os números vivem aqui, num sítio só: o documento e o diagrama não podem
 * discordar. Mudar um item de estado é mudar `BLOCKS`.
 */

import { writeFileSync, mkdirSync } from "node:fs"

const LANG = process.argv[2] === "en" ? "en" : "pt"
const VERSION = process.argv[3] ? `-${process.argv[3]}` : ""
const SUFFIX = `${VERSION}${LANG === "en" ? "-en" : ""}`

/* Uma rampa só (a brasa da marca), do mais escuro ao mais claro: feito → em
   curso → por fazer. É uma ordem, não três categorias; os números vão sempre
   escritos ao lado, porque os dois tons claros não chegam a 3:1 no fundo. */
const C = { done: "#C23A17", part: "#F39A7D", todo: "#D3D8DE", ink: "#1A222E", muted: "#5A6270" }
const FONT = `font-family="Jakarta, 'Segoe UI', system-ui, sans-serif"`

// [nome PT, nome EN, feito, falta confirmar, bloqueado]
// Estado a 30 de setembro, 22:45 — f0aac44 no ar no EC2 (v3).
const BLOCKS = [
  ["Domínios · MIG-02", "Domains · MIG-02", 1, 0, 0],
  ["A · Separação entre parceiros", "A · Partner separation", 6, 0, 0],
  ["B · Admin WeeFly", "B · WeeFly Admin", 7, 2, 0],
  ["Backoffice PT/EN · I18N-01", "Back office PT/EN · I18N-01", 1, 0, 0],
  ["C · Backoffice da Alô", "C · Alô back office", 6, 2, 0],
  ["D · Aplicação do ministério", "D · Ministry app", 7, 0, 0],
  ["E · Fichas dos passageiros", "E · Passenger records", 2, 0, 1],
]

const sum = (i) => BLOCKS.reduce((n, b) => n + b[i], 0)
const total = { done: sum(2), part: sum(3), todo: sum(4) }
const N = total.done + total.part + total.todo
const pct = (v) => Math.round((v / N) * 100)

const T =
  LANG === "en"
    ? {
        done: "Done and live",
        part: "To confirm",
        todo: "Blocked",
        doneShort: "Done",
        head: "of MVP 2 done and live",
        sub: `${total.done} of ${N} items · ${pct(total.done + total.part / 2)}% counting items to confirm as half`,
        items: "items",
        aria: `MVP 2: ${total.done} of ${N} items done and live, ${total.part} to confirm, ${total.todo} blocked`,
        blocksAria: "Items done per MVP 2 block",
      }
    : {
        done: "Feito e no ar",
        part: "Falta confirmar",
        todo: "Bloqueado",
        doneShort: "Feito",
        head: "do MVP 2 feito e no ar",
        sub: `${total.done} de ${N} itens · ${pct(total.done + total.part / 2)}% contando os por confirmar a meio`,
        items: "itens",
        aria: `MVP 2: ${total.done} de ${N} itens feitos e no ar, ${total.part} por confirmar, ${total.todo} bloqueados`,
        blocksAria: "Itens feitos por bloco do MVP 2",
      }

mkdirSync("docs/img", { recursive: true })

// ── 1 · a barra geral, com o número em destaque ──────────────────────────────
{
  const W = 680, H = 150, y = 78, h = 26
  let x = 0
  let segs = ""
  for (const k of ["done", "part", "todo"]) {
    const w = (total[k] / N) * W
    const gap = k === "todo" ? 0 : 2
    segs += `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(0, w - gap).toFixed(1)}" height="${h}" rx="4" fill="${C[k]}"><title>${total[k]} ${T.items}</title></rect>`
    x += w
  }
  const legend = [
    ["done", T.done, total.done],
    ["part", T.part, total.part],
    ["todo", T.todo, total.todo],
  ]
    .map(
      ([k, l, v], i) =>
        `<g transform="translate(${i * 210},${y + h + 26})"><rect width="12" height="12" rx="3" fill="${C[k]}"/><text x="18" y="10.5" font-size="12" fill="${C.ink}" ${FONT}>${l} · <tspan font-weight="700">${v}</tspan> (${pct(v)}%)</text></g>`
    )
    .join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${T.aria}">
<text x="0" y="40" font-size="40" font-weight="700" fill="${C.ink}" ${FONT}>${pct(total.done)}%</text>
<text x="112" y="26" font-size="13" font-weight="700" fill="${C.ink}" ${FONT}>${T.head}</text>
<text x="112" y="44" font-size="12" fill="${C.muted}" ${FONT}>${T.sub}</text>
${segs}${legend}</svg>`
  writeFileSync(`docs/img/mvp2-progresso${SUFFIX}.svg`, svg)
}

// ── 2 · por bloco, na mesma escala (um item = a mesma largura) ───────────────
{
  const W = 680, labelW = 210, countW = 50, rowH = 30, top = 8
  const unit = (W - labelW - countW) / Math.max(...BLOCKS.map((b) => b[2] + b[3] + b[4]))
  let body = ""
  BLOCKS.forEach(([pt, en, d, p, t], i) => {
    const name = LANG === "en" ? en : pt
    const y = top + i * rowH
    body += `<text x="0" y="${y + 15}" font-size="12" fill="${C.ink}" ${FONT}>${name}</text>`
    let x = labelW
    for (const [k, v] of [["done", d], ["part", p], ["todo", t]]) {
      if (!v) continue
      const w = v * unit
      body += `<rect x="${x.toFixed(1)}" y="${y + 3}" width="${(w - 2).toFixed(1)}" height="16" rx="4" fill="${C[k]}"><title>${name}: ${v}</title></rect>`
      x += w
    }
    body += `<text x="${W}" y="${y + 15}" font-size="12" font-weight="700" text-anchor="end" fill="${C.ink}" ${FONT}>${d}/${d + p + t}</text>`
  })
  const H = top + BLOCKS.length * rowH + 30
  const legend = [
    ["done", T.doneShort],
    ["part", T.part],
    ["todo", T.todo],
  ]
    .map(
      ([k, l], i) =>
        `<g transform="translate(${labelW + i * 110},${H - 16})"><rect width="12" height="12" rx="3" fill="${C[k]}"/><text x="18" y="10.5" font-size="12" fill="${C.muted}" ${FONT}>${l}</text></g>`
    )
    .join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${T.blocksAria}">${body}${legend}</svg>`
  writeFileSync(`docs/img/mvp2-blocos${SUFFIX}.svg`, svg)
}

console.log(`${LANG}: ${total.done}/${N} feito, ${total.part} em curso`)
