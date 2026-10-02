/**
 * WeeFly · OCT-12 · DOM-01 · as regras do subdomínio de uma empresa.
 *
 * O subdomínio é o `slug` do parceiro: `alo` → `alo.weefly.africa`. Só letras
 * minúsculas, números e hífen, de 2 a 30 caracteres, sem começar nem acabar em
 * hífen. Os nomes reservados são os endereços da própria plataforma.
 *
 * A base de dados repete as duas regras (migração 0031) e o índice único de
 * `partners.slug` é o que decide entre dois Admin a aprovar ao mesmo tempo.
 *
 * Sem imports de servidor: o ecrã valida enquanto se escreve.
 */

export const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])$/

export const RESERVED_SUBDOMAINS: readonly string[] = [
  "pro",
  "www",
  "admin",
  "api",
  "mail",
  "dev",
  "app",
  "pc",
  "static",
  "assets",
]

export type SubdomainProblem = "shape" | "reserved"

export function subdomainProblem(value: string): SubdomainProblem | null {
  if (!SUBDOMAIN.test(value)) return "shape"
  if (RESERVED_SUBDOMAINS.includes(value)) return "reserved"
  return null
}

/** O nome da empresa como subdomínio: sem acentos nem espaços, até 30. */
export function toSubdomain(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "")
}
