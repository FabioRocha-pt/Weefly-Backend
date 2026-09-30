import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/utils/supabase/middleware"
import { hostAllowed, servedHosts } from "@/lib/served-hosts"
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
} from "@/i18n/config"

export async function middleware(request: NextRequest) {
  /*
   * MIG-02 · decisão de 30 de setembro: o endereço antigo é desligado e não se
   * redirecciona. A lista dos endereços servidos é configuração
   * (`SERVED_HOSTS`); um pedido para outro recebe 404 antes de qualquer outra
   * coisa. O NGINX é a primeira barreira — esta é a segunda, para o caso de o
   * DNS antigo continuar a apontar para este servidor.
   */
  const served = servedHosts()
  if (served && !hostAllowed(request.headers.get("host"), served)) {
    return new NextResponse("Not found", { status: 404 })
  }

  /* O /pc passa aqui só pela verificação do endereço: a autorização do cliente
     é o token, não uma sessão — ver o `matcher`. */
  if (request.nextUrl.pathname === "/pc" || request.nextUrl.pathname.startsWith("/pc/")) {
    return NextResponse.next()
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

  return response
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
