/**
 * WeeFly · OCT-01 · o endereço por onde o pedido chegou.
 *
 * Atrás do NGINX, o `request.url` de uma rota do Next traz o endereço em que o
 * processo escuta (`localhost:3000`), não o que o browser abriu. O callback do
 * email redireccionava para `https://localhost:3000/email-confirmado`.
 *
 * O `Host` que o NGINX passa (`proxy_set_header Host $host`) é o certo, e o
 * `SERVED_HOSTS` do middleware já recusou qualquer endereço que não seja nosso
 * antes de o pedido chegar aqui. Fica-se no mesmo endereço porque é nele que a
 * sessão acabou de ser gravada: mandar para outro perdia o cookie.
 *
 * Sem `Host` utilizável, o endereço configurado (`NEXT_PUBLIC_SITE_URL`).
 */

import { siteUrl } from "@/lib/site-url"

function first(value: string | null): string {
  return (value ?? "").split(",")[0].trim()
}

export function requestOrigin(headers: Headers): string {
  const host = (first(headers.get("x-forwarded-host")) || first(headers.get("host"))).toLowerCase()
  const configured = siteUrl()

  if (!host || !/^[a-z0-9.-]+(:\d+)?$/.test(host)) return configured

  /* O próprio processo: não é um endereço que o browser consiga abrir fora
     desta máquina. Em desenvolvimento é mesmo o certo. */
  const local = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(host)
  if (local && configured && !/\/\/(localhost|127\.0\.0\.1)/.test(configured)) return configured

  const proto = first(headers.get("x-forwarded-proto")) || (local ? "http" : "https")
  return `${proto === "http" ? "http" : "https"}://${host}`
}
