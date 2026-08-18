import { type NextRequest } from "next/server"
import { updateSession } from "@/utils/supabase/middleware"
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
} from "@/i18n/config"

export async function middleware(request: NextRequest) {
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
     * - mockups (HTML autónomo em public/, e o /price-checker que lhe aponta):
     *   são páginas estáticas sem sessão nem rota protegida, por isso não vale
     *   a pena gastar uma chamada ao Supabase a cada pedido.
     * - /pc (o Price Checker em React): a autorização do cliente é o token no
     *   endereço, não uma sessão, e os ecrãs não passam pelo dicionário da app.
     *   Sem isto, cada abertura do link gastava uma validação de sessão que não
     *   é usada por ninguém. O back-office dele continua atrás de /admin.
     * Feel free to add more public asset extensions here.
     */
    "/((?!_next/static|_next/image|favicon.ico|mockups|price-checker|pc(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
