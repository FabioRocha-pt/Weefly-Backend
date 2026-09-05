/**
 * Um documento de sprint em PDF, com a tipografia da marca.
 *
 *   node scripts/md-to-pdf.mjs WeeFly_Sprint3_Fixes_Delivered_v3.3.md
 *   node scripts/md-to-pdf.mjs entrada.md saida.pdf
 *
 * Porquê um conversor escrito à mão em vez de uma dependência: estes documentos
 * usam sete construções de Markdown — títulos, tabelas, listas, `código`,
 * **negrito**, blocos de código e linhas horizontais — e são escritos por nós.
 * Uma biblioteca de Markdown traz o resto da especificação, que ninguém aqui
 * escreve, e traz-lhe as vulnerabilidades. O que interessa mesmo neste ficheiro
 * é o CSS: é ele que faz o PDF parecer da WeeFly e não do Word.
 *
 * A impressão é feita pelo Chrome que já está instalado, em modo headless. É a
 * única peça que não controlamos e é também a que melhor pagina — quebras de
 * página dentro de uma tabela, viúvas, órfãs, tudo isso é dele.
 *
 * As fontes vão embebidas em base64. Sem isso o Chrome iria buscá-las ao Google
 * a meio da impressão, e o PDF sairia em Times New Roman sempre que a máquina
 * estivesse sem rede — que é precisamente quando alguém está a exportar um
 * documento à pressa.
 */

import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")

// ── o Chrome que estiver instalado ───────────────────────────────────────────

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
]

function findChrome() {
  for (const path of CHROME_CANDIDATES) if (existsSync(path)) return path
  throw new Error(
    "Não encontrei o Chrome nem o Edge. Instale um deles, ou acrescente o caminho a CHROME_CANDIDATES."
  )
}

// ── tipografia ───────────────────────────────────────────────────────────────

function font(file) {
  const path = join(ROOT, "src", "assets", "fonts", file)
  if (!existsSync(path)) return null
  return readFileSync(path).toString("base64")
}

function fontFaces() {
  const faces = [
    ["Jakarta", "PlusJakartaSans-Regular.ttf", 400],
    ["Jakarta", "PlusJakartaSans-Bold.ttf", 700],
    ["PlexMono", "RobotoMono-Medium.ttf", 500],
  ]
  return faces
    .map(([family, file, weight]) => {
      const data = font(file)
      if (!data) return ""
      return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;font-display:block;src:url(data:font/ttf;base64,${data}) format('truetype')}`
    })
    .filter(Boolean)
    .join("\n")
}

/** O logótipo, inline. Ver `scripts/build-brand-logo.mjs`. */
function logo() {
  const path = join(ROOT, "public", "brand", "weefly-logo.svg")
  if (!existsSync(path)) return ""
  return readFileSync(path, "utf8").replace(
    "<svg ",
    '<svg style="height:26px;width:auto;display:block" '
  )
}

// ── Markdown → HTML ──────────────────────────────────────────────────────────

const escape = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/**
 * O que acontece dentro de uma linha: `código`, **negrito**, *itálico*.
 *
 * O código vem primeiro e é retirado da linha antes do resto correr, para que
 * um asterisco dentro de um trecho de código não vire negrito.
 */
function inline(text) {
  const codes = []
  let out = escape(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code)
    return `\u0000${codes.length - 1}\u0000`
  })

  out = out
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*]+)\*/g, "$1<em>$2</em>")

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`)
}

function tableRow(line) {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim())
}

const isDivider = (line) => /^\|[\s|:-]+\|$/.test(line.trim())

function convert(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const html = []
  let i = 0

  const flushParagraph = (buffer) => {
    if (buffer.length === 0) return
    html.push(`<p>${inline(buffer.join(" "))}</p>`)
    buffer.length = 0
  }

  const paragraph = []

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // bloco de código
    if (trimmed.startsWith("```")) {
      flushParagraph(paragraph)
      i++
      const block = []
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        block.push(lines[i])
        i++
      }
      i++
      html.push(`<pre><code>${escape(block.join("\n"))}</code></pre>`)
      continue
    }

    // tabela — a linha a seguir tem de ser o separador
    if (
      trimmed.startsWith("|") &&
      i + 1 < lines.length &&
      isDivider(lines[i + 1])
    ) {
      flushParagraph(paragraph)
      const head = tableRow(trimmed)
      i += 2
      const body = []
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        body.push(tableRow(lines[i].trim()))
        i++
      }
      const headHtml = head.some(Boolean)
        ? `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`
        : ""
      const bodyHtml = body
        .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("")
      html.push(`<table>${headHtml}<tbody>${bodyHtml}</tbody></table>`)
      continue
    }

    // lista
    if (/^[-*] /.test(trimmed)) {
      flushParagraph(paragraph)
      const items = []
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().slice(2))}</li>`)
        i++
      }
      html.push(`<ul>${items.join("")}</ul>`)
      continue
    }

    // linha horizontal — antes dos títulos, porque `---` não é um `#`
    if (/^-{3,}$/.test(trimmed)) {
      flushParagraph(paragraph)
      html.push("<hr />")
      i++
      continue
    }

    // títulos
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushParagraph(paragraph)
      const level = heading[1].length
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      i++
      continue
    }

    if (trimmed === "") {
      flushParagraph(paragraph)
      i++
      continue
    }

    paragraph.push(trimmed)
    i++
  }

  flushParagraph(paragraph)
  return html.join("\n")
}

// ── a folha de estilos ───────────────────────────────────────────────────────

const CSS = `
:root{
  --ember:#EF5129;
  --ink:#1A222E;
  --muted:#5A6270;
  --line:#E4E8ED;
  --surface:#F5F7F9;
}
@page{size:A4;margin:18mm 16mm 16mm}
*{box-sizing:border-box}
body{
  font-family:'Jakarta','Segoe UI',system-ui,sans-serif;
  color:var(--ink);
  font-size:10.5pt;
  line-height:1.55;
  margin:0;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}
code,pre{font-family:'PlexMono','IBM Plex Mono',monospace}

/* cabeçalho, só na primeira página */
.masthead{
  display:flex;align-items:center;justify-content:space-between;
  border-bottom:3px solid var(--ember);
  padding-bottom:10px;margin-bottom:22px;
}
.masthead .tag{
  font-size:8pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ember);
}

h1{
  font-size:17pt;font-weight:700;letter-spacing:-.02em;line-height:1.2;
  margin:26px 0 10px;break-after:avoid;
}
h1:first-of-type{margin-top:0}
h2{font-size:13pt;font-weight:700;letter-spacing:-.01em;margin:22px 0 8px;break-after:avoid}
h3{
  font-size:11pt;font-weight:700;margin:18px 0 6px;break-after:avoid;
  color:var(--ink);
}
h3 code{background:none;padding:0;color:var(--ember);font-size:10.5pt}
p{margin:0 0 9px}
strong{font-weight:700}
hr{border:0;border-top:1px solid var(--line);margin:22px 0}

code{
  background:var(--surface);
  border:1px solid var(--line);
  border-radius:4px;
  padding:1px 4px;
  font-size:9pt;
}
pre{
  background:var(--ink);color:#E8ECF1;
  border-radius:8px;padding:12px 14px;
  font-size:9pt;line-height:1.5;
  overflow-x:auto;margin:10px 0 14px;
  break-inside:avoid;
}
pre code{background:none;border:0;padding:0;color:inherit;font-size:9pt}

ul{margin:0 0 10px;padding-left:18px}
li{margin:0 0 4px}

table{
  width:100%;border-collapse:collapse;
  margin:10px 0 16px;font-size:9.5pt;
}
thead{display:table-header-group}
th{
  text-align:left;font-weight:700;font-size:8.5pt;
  text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  border-bottom:1.5px solid var(--line);
  padding:6px 8px 6px 0;
}
td{
  border-bottom:1px solid var(--line);
  padding:7px 8px 7px 0;vertical-align:top;
}
tr{break-inside:avoid}
td:first-child,th:first-child{width:auto;white-space:nowrap}
table code{font-size:8.5pt}

/* a tabela de duas colunas do cabeçalho do documento */
table:first-of-type td:first-child{font-weight:700;width:26%}
`

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(title)}</title>
<style>${fontFaces()}</style>
<style>${CSS}</style>
</head>
<body>
  <div class="masthead">
    ${logo()}
    <span class="tag">Concierge · Sprint 3</span>
  </div>
  ${body}
</body>
</html>`
}

// ── execução ─────────────────────────────────────────────────────────────────

const input = process.argv[2]
if (!input) {
  console.error("uso: node scripts/md-to-pdf.mjs <ficheiro.md> [saida.pdf]")
  process.exit(1)
}

const inputPath = resolve(input)
if (!existsSync(inputPath)) {
  console.error(`não existe: ${inputPath}`)
  process.exit(1)
}

const outputPath = resolve(
  process.argv[3] ?? inputPath.replace(/\.md$/i, ".pdf")
)

const markdown = readFileSync(inputPath, "utf8")
const title = (markdown.match(/^#\s+(.*)$/m)?.[1] ?? basename(inputPath)).trim()

const work = mkdtempSync(join(tmpdir(), "weefly-pdf-"))
const htmlPath = join(work, "doc.html")
writeFileSync(htmlPath, page(title, convert(markdown)), "utf8")

const chrome = findChrome()

/* `--no-pdf-header-footer` tira o URL e a data que o Chrome imprime por
   omissão nas margens — num documento que vai para um cliente, o caminho do
   ficheiro temporário no canto da página não é um detalhe simpático. */
execFileSync(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-pdf-header-footer",
    "--virtual-time-budget=8000",
    `--print-to-pdf=${outputPath}`,
    `file:///${htmlPath.replace(/\\/g, "/")}`,
  ],
  { stdio: "pipe" }
)

if (!existsSync(outputPath)) {
  console.error("o Chrome não escreveu o PDF — o HTML ficou em", htmlPath)
  process.exit(1)
}

console.log(`${basename(outputPath)} · ${(readFileSync(outputPath).length / 1024).toFixed(0)} KB`)
