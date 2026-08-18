#!/usr/bin/env node
/**
 * WeeFly · cria as duas contas do back-office do Price Checker.
 *
 *   node scripts/seed-bo-users.mjs
 *
 * Faz três coisas, por esta ordem, e todas idempotentes:
 *
 *   1. Garante o utilizador em auth.users com email já confirmado. Se já
 *      existir, repõe a password — é assim que se recupera o acesso sem
 *      depender do email de recuperação.
 *   2. Liga-o a `platform_staff` (a porta do back-office) e a `bo_allowlist`
 *      (a porta do Price Checker).
 *   3. Escreve as passwords em .env.local, debaixo de um bloco marcado, para
 *      ficarem num sítio que não vai para o git. Não as imprime no ecrã por
 *      omissão: um terminal partilhado é um sítio tão público como o chat.
 *      Com --print imprime-as.
 *
 * As passwords são geradas aqui. Para fixar uma, passe-a no ambiente:
 *   BO_PASSWORD_FAPI_ROCHA=... BO_PASSWORD_GOCGO2008=... node scripts/...
 *
 * Precisa de SUPABASE_SERVICE_ROLE_KEY: criar utilizadores é operação de
 * administração e a chave publicável não a faz.
 */

import { createClient } from "@supabase/supabase-js"
import { randomInt } from "node:crypto"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = process.cwd()
const ENV_LOCAL = resolve(ROOT, ".env.local")

/* ── contas ───────────────────────────────────────────────────────────────
   A lista está aqui e não num ficheiro de configuração de propósito: são duas
   pessoas nomeadas, e acrescentar uma terceira deve custar um commit revisto,
   não uma variável de ambiente que ninguém vê. */
const ACCOUNTS = [
  { email: "fapi.rocha@gmail.com", label: "Fábio Rocha",  envKey: "BO_PASSWORD_FAPI_ROCHA" },
  { email: "gocgo2008@gmail.com",  label: "WeeFly Admin", envKey: "BO_PASSWORD_GOCGO2008" },
]

// ── env ─────────────────────────────────────────────────────────────────────

/** Lê .env.local e .env sem depender do dotenv, que não é dependência daqui. */
function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(ROOT, name)
    if (!existsSync(path)) continue
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq < 1) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      // O ambiente real ganha sempre ao ficheiro.
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

/**
 * Password de 20 caracteres com as quatro famílias garantidas.
 *
 * Sem `1` / `l` / `O` / `0`: estas passwords vão ser lidas de um ecrã e
 * escritas à mão pelo menos uma vez.
 */
function generatePassword() {
  const sets = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%*-_=+?",
  ]
  const all = sets.join("")
  const chars = sets.map((s) => s[randomInt(s.length)])
  while (chars.length < 20) chars.push(all[randomInt(all.length)])
  // Fisher-Yates: sem isto os quatro primeiros caracteres seguiam sempre a
  // mesma ordem de famílias.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join("")
}

// ── .env.local ──────────────────────────────────────────────────────────────

const BLOCK_START = "# >>> weefly:bo-passwords (gerado por scripts/seed-bo-users.mjs)"
const BLOCK_END = "# <<< weefly:bo-passwords"

/** Substitui o bloco marcado, ou acrescenta-o no fim. Nada mais é tocado. */
function writePasswordBlock(entries) {
  const body = [
    BLOCK_START,
    "# Passwords das contas do back-office do Price Checker.",
    "# Este ficheiro está no .gitignore. Correr o script outra vez reescreve o bloco.",
    ...entries.map((e) => `${e.envKey}=${e.password}`),
    BLOCK_END,
  ].join("\n")

  let content = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8") : ""
  const start = content.indexOf(BLOCK_START)
  const end = content.indexOf(BLOCK_END)

  if (start !== -1 && end !== -1 && end > start) {
    content =
      content.slice(0, start) + body + content.slice(end + BLOCK_END.length)
  } else {
    if (content && !content.endsWith("\n")) content += "\n"
    content += (content ? "\n" : "") + body + "\n"
  }

  writeFileSync(ENV_LOCAL, content, "utf8")
}

// ── seed ────────────────────────────────────────────────────────────────────

/**
 * O admin API não tem "getUserByEmail". `listUsers` é paginado, por isso
 * percorre-se até encontrar — em projetos pequenos é uma página só.
 */
async function findUserByEmail(admin, email) {
  const target = email.toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

async function main() {
  loadEnvFiles()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error(
      "\nFalta configuração.\n" +
        "  NEXT_PUBLIC_SUPABASE_URL   " + (url ? "ok" : "AUSENTE") + "\n" +
        "  SUPABASE_SERVICE_ROLE_KEY  " + (serviceKey ? "ok" : "AUSENTE") + "\n\n" +
        "A chave está no Supabase Dashboard → Project Settings → API → service_role.\n" +
        "Ponha-a em .env.local (sem prefixo NEXT_PUBLIC_) e volte a correr.\n"
    )
    process.exit(1)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const results = []

  for (const account of ACCOUNTS) {
    const password = process.env[account.envKey] || generatePassword()
    const fromEnv = Boolean(process.env[account.envKey])

    let user = await findUserByEmail(admin, account.email)
    let action

    if (user) {
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(user.user_metadata ?? {}),
          first_name: account.label.split(" ")[0],
          last_name: account.label.split(" ").slice(1).join(" "),
          bo_role: "admin",
        },
      })
      if (error) throw error
      action = "password reposta"
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: account.label.split(" ")[0],
          last_name: account.label.split(" ").slice(1).join(" "),
          bo_role: "admin",
        },
      })
      if (error) throw error
      user = data.user
      action = "conta criada"
    }

    // A porta do back-office.
    const staff = await admin
      .from("platform_staff")
      .upsert(
        { user_id: user.id, email: account.email, role: "admin" },
        { onConflict: "user_id" }
      )
    if (staff.error) throw staff.error

    // A porta do Price Checker. A migração 0009 já a semeia; isto cobre o caso
    // de a linha ter sido desativada à mão.
    const allow = await admin
      .from("bo_allowlist")
      .upsert(
        { email: account.email, label: account.label, role: "admin", active: true },
        { onConflict: "email" }
      )
    if (allow.error) throw allow.error

    results.push({ ...account, password, action, fromEnv, id: user.id })
    console.log(`  ✓ ${account.email} · ${action}`)
  }

  writePasswordBlock(results)

  console.log("\nContas prontas. Entrada pelo /login normal da app.")
  console.log(`Passwords escritas em .env.local (bloco "weefly:bo-passwords").`)

  if (process.argv.includes("--print")) {
    console.log("")
    for (const r of results) {
      console.log(`  ${r.email}`)
      console.log(`    password: ${r.password}${r.fromEnv ? "  (vinda do ambiente)" : ""}`)
    }
    console.log("")
  } else {
    console.log("Para as ver no ecrã: node scripts/seed-bo-users.mjs --print\n")
  }
}

main().catch((err) => {
  console.error("\nFalhou:", err?.message ?? err, "\n")
  process.exit(1)
})
