import { classifyHost, indexingAllowed } from "@/lib/site-host"
import { requestOrigin } from "@/lib/request-origin"

export const dynamic = "force-dynamic"

/**
 * WeeFly · SEO-03 · o `robots.txt` de cada endereço.
 *
 * `pro.weefly.africa` e todo o desenvolvimento (sem `ALLOW_INDEXING=true`):
 * `Disallow: /`. Os price checkers (`weefly.africa/pc`, `<empresa>.weefly.africa/pc`)
 * abrem só a página inicial; os links privados `/pc/<código>`, o `/admin`, os
 * `/ministerios` e o login ficam fechados.
 *
 * Em `weefly.africa` este ficheiro só responde se o NGINX o encaminhar para
 * aqui: o `robots.txt` da raiz é do site público.
 */
export function GET(request: Request) {
  const site = classifyHost(request.headers.get("x-forwarded-host") || request.headers.get("host"))
  const closed = !indexingAllowed() || site.kind === "pro"

  const body = closed
    ? ["User-agent: *", "Disallow: /", ""].join("\n")
    : [
        "User-agent: *",
        "Allow: /pc$",
        "Disallow: /",
        "",
        `Sitemap: ${requestOrigin(request.headers)}/sitemap.xml`,
        "",
      ].join("\n")

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  })
}
