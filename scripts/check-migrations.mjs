/**
 * Que migrações estão mesmo aplicadas nesta base.
 *
 *   node scripts/check-migrations.mjs
 *
 * O Supabase não guarda um registo de migrações que possamos ler daqui — os
 * ficheiros em `supabase/migrations/` são a nossa intenção, não o estado. Este
 * script pergunta ao estado: para cada coisa que o código do sprint precisa,
 * tenta lê-la e olha para o erro.
 *
 *   PGRST205 · a tabela não existe
 *   42703    · a coluna não existe
 *
 * Só leitura, e sem trazer dados: `limit(0)` obriga o PostgREST a validar a
 * lista de colunas e devolve zero linhas. Nenhum dado de cliente passa por aqui.
 *
 * **Não usar `head: true`.** Foi a primeira tentativa e é uma armadilha: com
 * `head` o PostgREST responde `200 OK` a uma consulta sobre uma tabela que não
 * existe, porque não há corpo onde escrever o erro. A sonda dizia "aplicada"
 * para tudo. O controlo que apanhou isto está no fim deste ficheiro e corre
 * sempre — uma verificação que não sabe falhar não verifica nada.
 *
 * A razão de existir: uma coluna em falta não dá erro nenhum enquanto ninguém
 * usar a funcionalidade. Descobre-se com um cliente do outro lado à espera de
 * pagar, que é o pior momento possível.
 */

import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

// ── ambiente ─────────────────────────────────────────────────────────────────

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!match) continue
        const value = match[2].replace(/^["']|["']$/g, "")
        if (!process.env[match[1]]) process.env[match[1]] = value
      }
    } catch {
      /* o ficheiro pode não existir; o seguinte trata disso */
    }
  }
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

// ── o que cada migração deixou para trás ─────────────────────────────────────

const CHECKS = [
  { migration: "0013", table: "case_passenger_seats", column: "seat", need: "EM-01 · lugares por voo" },
  { migration: "0013", table: "case_notifications", column: "dedupe_key", need: "NT-04 · avisos sem duplicados" },
  { migration: "0014", table: "booking_cases", column: "closed_at", need: "C-04 e T-21 · fechar casos" },
  { migration: "0014", table: "booking_cases", column: "claimed_at", need: "C-01 · reclamar o caso" },
  { migration: "0014", table: "booking_cases", column: "seller_email", need: "BO-14 e T-06 · vendedor" },
  { migration: "0015", table: "case_payments", column: "pay_link", need: "C-33 e T-17 · o link de pagamento" },
  { migration: "0015", table: "case_payments", column: "pay_reference", need: "C-33 · a referência" },
  { migration: "0015", table: "case_payments", column: "pay_due_at", need: "T-11 · o prazo de pagamento" },
  { migration: "0015", table: "case_payments", column: "pay_instructions_sent_at", need: "T-11 · a hora do envio" },
  { migration: "0016", table: "bo_alert_reads", column: "event_id", need: "C-14 · a campainha" },
  { migration: "0017", table: "case_offers", column: "airline_logo", need: "C-26 · logótipo da companhia" },
  { migration: "0018", table: "bo_allowlist", column: "active", need: "acessos ao back-office" },
  { migration: "0019", table: "case_events", column: "dedupe_key", need: "T-22 · um acontecimento, uma linha" },
  { migration: "0019", table: "case_segment_issuance", column: "fare_basis", need: "T-04 · emissão por voo" },
  { migration: "0019", table: "case_offer_segment_baggage", column: "checked_pieces", need: "T-10 · bagagem por voo" },
  { migration: "0019", table: "case_passenger_baggage", column: "checked_pieces", need: "T-04 · bagagem emitida" },
]

/* O PostgREST devolve PGRST205 quando não conhece a tabela e o código do
   Postgres (42703) quando a coluna não existe. */
const MISSING_TABLE = new Set(["PGRST205", "42P01"])
const MISSING_COLUMN = "42703"

async function probe({ table, column }) {
  const { error } = await db.from(table).select(column).limit(0)

  if (!error) return { ok: true }
  if (MISSING_TABLE.has(error.code)) return { ok: false, why: "tabela não existe" }
  if (error.code === MISSING_COLUMN) return { ok: false, why: "coluna não existe" }
  return { ok: false, why: `${error.code ?? "sem código"} · ${error.message}` }
}

/**
 * O controlo, antes de mais nada.
 *
 * Pergunta por uma tabela e por uma coluna que garantidamente não existem. Se
 * a sonda disser que estão lá, é a sonda que está partida — e um relatório de
 * migrações que dá tudo por aplicado é pior do que não haver relatório nenhum,
 * porque manda alguém emitir um bilhete contra colunas que não existem.
 */
async function selfTest() {
  const noTable = await probe({ table: "weefly_probe_control", column: "x" })
  const noColumn = await probe({
    table: "booking_cases",
    column: "weefly_probe_control",
  })

  if (noTable.ok || noColumn.ok) {
    console.error(
      "\nA SONDA ESTÁ PARTIDA: deu por existente algo que não existe.\n" +
        `  tabela inventada → ${noTable.ok ? "OK (errado)" : noTable.why}\n` +
        `  coluna inventada → ${noColumn.ok ? "OK (errado)" : noColumn.why}\n` +
        "\nNão confie no que vem a seguir. Corrija `probe()` antes de usar isto.\n"
    )
    process.exit(2)
  }
}

await selfTest()

const results = []
for (const check of CHECKS) {
  results.push({ ...check, ...(await probe(check)) })
}

// ── relatório ────────────────────────────────────────────────────────────────

const byMigration = new Map()
for (const r of results) {
  if (!byMigration.has(r.migration)) byMigration.set(r.migration, [])
  byMigration.get(r.migration).push(r)
}

console.log(`\nBase: ${url}\n`)

const missing = []
for (const [migration, rows] of byMigration) {
  const failed = rows.filter((r) => !r.ok)
  const mark = failed.length === 0 ? "✓" : failed.length === rows.length ? "✗" : "~"
  const label =
    failed.length === 0
      ? "aplicada"
      : failed.length === rows.length
        ? "NÃO APLICADA"
        : `parcial · ${failed.length} de ${rows.length} em falta`
  console.log(`${mark} ${migration}  ${label}`)
  for (const row of failed) {
    console.log(`     falta ${row.table}.${row.column} — ${row.need} (${row.why})`)
    missing.push(migration)
  }
}

const pending = [...new Set(missing)]
if (pending.length === 0) {
  console.log("\nTudo aplicado. O código deste sprint tem onde escrever.\n")
} else {
  console.log(
    `\nPor aplicar: ${pending.join(", ")}\n\nCada uma é idempotente:\n` +
      pending.map((m) => `  supabase/migrations/${m}_*.sql`).join("\n") +
      "\n"
  )
  process.exitCode = 1
}
