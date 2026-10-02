import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/utils/supabase/middleware"
import { hostAllowed, servedHosts } from "@/lib/served-hosts"
import { classifyHost, isIndexablePath } from "@/lib/site-host"
import { partnerExists } from "@/lib/partner-exists"
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
} from "@/i18n/config"

/** SEO-03 · tudo é `noindex`, menos a página inicial do price checker. */
function withRobots(response: NextResponse, indexable: boolean): NextResponse {
  if (!indexable) response.headers.set("X-Robots-Tag", "noindex, nofollow")
  return response
}

export async function middleware(request: NextRequest) {
  /*
   * MIG-02 · decisão de 30 de setembro: o endereço antigo é desligado e não se
   * redirecciona. A lista dos endereços servidos é configuração
   * (`SERVED_HOSTS`); um pedido para outro recebe 404 antes de qualquer outra
   * coisa. O NGINX é a primeira barreira — esta é a segunda, para o caso de o
   * DNS antigo continuar a apontar para este servidor.
   */
  const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host")
  const served = servedHosts()
  if (served && !hostAllowed(rawHost, served)) {
    return new NextResponse("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } })
  }

  /* DOM-01 · o endereço diz onde se está: pro.weefly.africa, weefly.africa
     ou <empresa>.weefly.africa (`lib/site-host`). */
  const site = classifyHost(rawHost)
  const path = request.nextUrl.pathname
  const indexable = isIndexablePath(site, path)

  /* DOM-01 · a aplicação dos ministérios mudou de `/m/` para `/ministerios/`.
     Os links que já foram enviados por email continuam a abrir. */
  if (path === "/m" || path.startsWith("/m/")) {
    const url = request.nextUrl.clone()
    url.pathname = `/ministerios${path.slice(2)}`
    return withRobots(NextResponse.redirect(url, 308), false)
  }

  if (site.kind === "partner" && site.slug) {
    /* Empresa inexistente → "não encontrado" com a marca WeeFly, nunca um
       erro técnico nem o price checker de outra empresa. */
    if (!(await partnerExists(site.slug))) {
      const url = request.nextUrl.clone()
      url.pathname = "/empresa-inexistente"
      url.search = ""
      return withRobots(NextResponse.rewrite(url, { status: 404 }), false)
    }
    /* `<empresa>.weefly.africa` abre o price checker; `/admin` é o mesmo
       backoffice de `pro.weefly.africa` (decisão Q2), com a marca dela. */
    if (path === "/") {
      const url = request.nextUrl.clone()
      url.pathname = "/pc"
      return withRobots(NextResponse.redirect(url), indexable)
    }
    if (path === "/admin" || path === "/admin/") {
      const url = request.nextUrl.clone()
      url.pathname = "/modulo"
      url.search = ""
      return withRobots(NextResponse.redirect(url), false)
    }
  }

  /* O /pc passa aqui só pela verificação do endereço: a autorização do cliente
     é o token, não uma sessão — ver o `matcher`. Os /ministerios (MIN-01, a
     aplicação do ministério) são iguais: a secretária nunca tem sessão. */
  if (path === "/pc" || path.startsWith("/pc/") || path.startsWith("/ministerios/")) {
    return withRobots(NextResponse.next(), indexable)
  }

  // Refreshes the Supabase session and enforces route protection.
  const response = await updateSession(request)

  /*
   * `?lang=fr` fixa o idioma no cookie.
   *
   * Isto vive aqui e não numa página porque um layout não recebe os parâmetros
   * do endereço — só as páginas os recebem — e o provider de tradução tem de
   * estar no layout para envolver tudo. O middleware é o único sítio que vê o
   * URL inteiro antes de qualquer render.
   *
   * É deliberadamente só isto: ler um parâmetro e gravar um cookie. Não há
   * reescrita de rotas nem prefixos de idioma no caminho — a autenticação do
   * Supabase acima fica exatamente como estava.
   */
  const requested = request.nextUrl.searchParams.get("lang")
  if (isLocale(requested) && request.cookies.get(LOCALE_COOKIE)?.value !== requested) {
    response.cookies.set(LOCALE_COOKIE, requested, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
    })
  }

  return withRobots(response, indexable)
}

export const config = {
  matcher: [
    /*
     * Run on every request path except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - common image assets
     *
     * O /pc (o Price Checker) entra, mas só para a verificação do endereço
     * (MIG-02): a autorização do cliente é o token, não uma sessão, e o
     * `middleware` devolve antes de validar sessão nenhuma.
     *
     * `mockups` e `price-checker` estavam aqui enquanto o Price Checker era um
     * HTML estático em public/. Saíram com ele.
     * Feel free to add more public asset extensions here.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
