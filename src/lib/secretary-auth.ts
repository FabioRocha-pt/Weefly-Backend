/**
 * WeeFly · B2G v2 · B2G-06 · B2G-07 · o PIN e a sessão da secretária.
 *
 * O PIN tem 6 dígitos, é gerado aqui (`crypto.randomInt`) e mostrado uma só
 * vez a quem o gerou. Nunca é guardado em claro, nunca vai por email e nunca
 * vai para um log: o que fica é um hash scrypt com sal próprio, em
 * `ministry_secretary_secrets` — uma tabela que nenhuma sessão lê (0034).
 *
 * A sessão: um token aleatório num cookie httpOnly, SameSite=Strict, Secure em
 * produção e preso ao caminho do link pessoal (`/ministerios/<org>/<token>`):
 * o cookie de uma secretária nunca é enviado no link de outra. Na base fica só
 * o sha256 do token. 30 min sem uso, 12 h no total, e só enquanto o PIN for o
 * mesmo e a secretária estiver activa (`secretary_session_check`).
 *
 * SÓ SERVIDOR. Nada daqui pode ir para um componente de cliente.
 */

import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "crypto"
import { cache } from "react"
import { cookies, headers } from "next/headers"

import { createAdminClient } from "@/utils/supabase/admin"

export const SECRETARY_COOKIE = "wf_sec"
/** 12 h: o limite absoluto (o de 30 min sem uso é a base que o aplica). */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const

function scryptAsync(pin: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pin, salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)))
  )
}

/**
 * Seis dígitos, uniformes. Recusa os que se adivinham à primeira (todos
 * iguais, ou em escada): continuam a ser 10⁶ menos umas dezenas.
 */
export function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0")
    if (/^(\d)\1{5}$/.test(pin)) continue
    if ("0123456789".includes(pin) || "9876543210".includes(pin)) continue
    return pin
  }
}

/** `scrypt$N$r$p$<sal>$<hash>`, em base64url. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(pin, salt, SCRYPT.keylen, SCRYPT)
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$")
}

/* Um hash que nunca bate certo, para gastar o mesmo tempo quando não há PIN
   para comparar (link desconhecido, secretária sem PIN). */
const DUMMY_HASH = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(32).toString("base64url")}`

/**
 * Compara em tempo constante. Sem hash guardado, faz a mesma conta contra um
 * hash fictício e responde que não — o tempo não diz se o link existe.
 */
export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  const real = Boolean(stored)
  const parts = (stored ?? DUMMY_HASH).split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const [, n, r, p, saltB64, hashB64] = parts
  const expected = Buffer.from(hashB64, "base64url")
  let key: Buffer
  try {
    key = await scryptAsync(pin, Buffer.from(saltB64, "base64url"), expected.length || SCRYPT.keylen, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })
  } catch {
    return false
  }
  return real && key.length === expected.length && timingSafeEqual(key, expected)
}

export function mintSessionToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function secretaryCookiePath(orgSlug: string, linkToken: string): string {
  return `/ministerios/${orgSlug}/${linkToken}`
}

/** O cookie da sessão, com as regras todas. Só em server actions. */
export function setSecretaryCookie(orgSlug: string, linkToken: string, token: string) {
  cookies().set(SECRETARY_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: secretaryCookiePath(orgSlug, linkToken),
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export function clearSecretaryCookie(orgSlug: string, linkToken: string) {
  cookies().set(SECRETARY_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: secretaryCookiePath(orgSlug, linkToken),
    maxAge: 0,
  })
}

/**
 * A secretária da sessão deste pedido, se o cookie for válido (e refrescado).
 * Nulo sem cookie, com a sessão expirada, o PIN mudado, ou a secretária, o
 * ministério ou a empresa desactivados. Quem chama confirma que é a
 * secretária do link.
 */
export const sessionSecretaryId = cache(async (): Promise<string | null> => {
  const token = cookies().get(SECRETARY_COOKIE)?.value
  if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null
  const admin = createAdminClient()
  if (!admin) return null
  const { data, error } = await admin.rpc("secretary_session_check", { p_token_hash: hashSessionToken(token) })
  if (error) {
    console.error("[secretária] sessão ilegível:", error.code)
    return null
  }
  return typeof data === "string" ? data : null
})

/**
 * Um travão leve por IP às tentativas de PIN, em memória (por processo). O
 * travão a sério é o da base: 5 falhas seguidas bloqueiam a secretária.
 */
const IP_WINDOW_MS = 15 * 60 * 1000
const IP_MAX = 30
const attemptsByIp = new Map<string, number[]>()

export function pinAttemptAllowed(): boolean {
  const h = headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "?"
  const now = Date.now()
  const recent = (attemptsByIp.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS)
  recent.push(now)
  attemptsByIp.set(ip, recent)
  if (attemptsByIp.size > 5000) {
    for (const [key, list] of Array.from(attemptsByIp.entries())) {
      if (!list.some((t) => now - t < IP_WINDOW_MS)) attemptsByIp.delete(key)
    }
  }
  return recent.length <= IP_MAX
}
