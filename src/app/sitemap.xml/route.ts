import { classifyHost, indexingAllowed } from "@/lib/site-host"
import { requestOrigin } from "@/lib/request-origin"

export const dynamic = "force-dynamic"

/**
 * WeeFly · SEO-03 · o sitemap de cada endereço: só as páginas indexáveis, que
 * são uma, a página inicial do price checker. No PRO e no desenvolvimento,
 * vazio.
 */
export function GET(request: Request) {
  const site = classifyHost(request.headers.get("x-forwarded-host") || request.headers.get("host"))
  const open = indexingAllowed() && site.kind !== "pro"
  const urls = open ? [`${requestOrigin(request.headers)}/pc`] : []

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${u}</loc><changefreq>weekly</changefreq></url>`),
    "</urlset>",
    "",
  ].join("\n")

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  })
}
