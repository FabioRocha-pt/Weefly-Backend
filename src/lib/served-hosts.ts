/**
 * WeeFly · MIG-02 · os endereços que esta aplicação serve.
 *
 * `SERVED_HOSTS` no ambiente, separados por vírgula. Aceita um curinga à
 * esquerda para os subdomínios dos parceiros (TEN-04):
 *
 *   SERVED_HOSTS=concierge.weefly.africa,*.weefly.africa,localhost:3000
 *
 * Sem a variável, serve tudo — é o que se quer em desenvolvimento. Nenhum
 * endereço vive aqui: desligar um domínio é tirá-lo da lista.
 *
 * Corre no middleware (edge): sem imports.
 */

export function servedHosts(): string[] | null {
  const raw = (process.env.SERVED_HOSTS ?? "").trim()
  if (!raw) return null
  const list = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return list.length ? list : null
}

export function hostAllowed(host: string | null, served: string[]): boolean {
  const h = (host ?? "").trim().toLowerCase()
  if (!h) return false
  return served.some((entry) => {
    if (entry.startsWith("*.")) {
      /* `*.weefly.africa` cobre `alo.weefly.africa`, e não `weefly.africa`
         nem `x.alo.weefly.africa` (um nível, como o certificado wildcard). */
      const suffix = entry.slice(1)
      if (!h.endsWith(suffix)) return false
      const label = h.slice(0, -suffix.length)
      return label.length > 0 && !label.includes(".")
    }
    return h === entry
  })
}
