import Link from "next/link"
import { redirect } from "next/navigation"
import { ShieldAlert } from "lucide-react"

import { getCurrentUser } from "@/lib/current-user"
import { isPlatformStaff } from "@/lib/travel-requests"
import { WeeFlyLogo } from "@/components/weefly-logo"

/**
 * WeeFly back-office shell — the topbar from the A2/A3 mockups.
 *
 * The middleware guarantees a session on /admin; this layout adds the staff
 * check. RLS is still the real gate — a non-staff user who bypassed this page
 * would simply read zero rows.
 */

/**
 * Nav from the mockup. `Painel`, `Pagamentos`, `Vendedores` and `Configuração`
 * are in the design but have no screens yet; they render disabled rather than
 * as links that 404. Turning one on is a matter of adding `href`.
 */
const NAV: { label: string; href?: string }[] = [
  { label: "Painel" },
  { label: "Emissões", href: "/admin" },
  { label: "Pedidos", href: "/admin/pedidos" },
  { label: "Pagamentos" },
  { label: "Vendedores" },
  { label: "Configuração" },
]

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase()
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login?redirectedFrom=/admin")

  const staff = await isPlatformStaff()
  if (!staff) return <NoAccess email={user.email} />

  return (
    <div className="min-h-screen bg-adm-bg text-adm-txt">
      <header className="sticky top-0 z-30 border-b border-adm-line bg-adm-panel/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <Link href="/admin" className="flex shrink-0 items-center gap-2">
            <WeeFlyLogo className="h-6 w-auto" />
          </Link>
          <span className="rounded-md border border-adm-line bg-adm-raise px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-adm-muted">
            Admin
          </span>

          <nav className="ml-2 hidden items-center gap-1 lg:flex">
            {NAV.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  title="Ainda não disponível"
                  className="cursor-not-allowed rounded-md px-2.5 py-1.5 text-[13px] font-medium text-adm-muted/50"
                >
                  {item.label}
                </span>
              )
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 text-[13px] text-adm-txt-2 sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-adm-raise text-[11px] font-bold text-adm-txt-2">
                {initials(user.email)}
              </span>
              <span className="hidden md:inline">{user.email}</span>
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}

function NoAccess({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-adm-bg px-4">
      <div className="w-full max-w-md rounded-xl border border-adm-line bg-adm-panel p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-adm-warn/15">
          <ShieldAlert className="h-7 w-7 text-adm-warn" />
        </div>
        <h1 className="text-xl font-bold text-adm-txt">Acesso restrito</h1>
        <p className="mt-3 text-sm leading-relaxed text-adm-muted">
          A conta <strong className="text-adm-txt-2">{email}</strong> não faz
          parte da equipa da plataforma, por isso não tem acesso ao back-office.
        </p>
        <p className="mt-4 rounded-lg bg-adm-raise p-3 text-left text-xs leading-relaxed text-adm-muted">
          Para conceder acesso, corra no SQL editor do Supabase:
          <code className="mt-2 block break-all font-mono text-[11px] text-adm-txt-2">
            insert into public.platform_staff (user_id, email, role) select id,
            email, &apos;admin&apos; from auth.users where email =
            &apos;{email}&apos;;
          </code>
        </p>
        <Link
          href="/inicio"
          className="mt-6 inline-block text-sm font-semibold text-adm-ember hover:text-adm-ember-dark"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
