import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google"

import "@/styles/bo-pc.css"
import { getBoAccess, boInitials } from "@/lib/bo-access"
import { RoutePreloader } from "@/components/route-preloader"
import { WeeFlyLogo } from "@/components/weefly-logo"
import { BoTopbarActions } from "@/components/bo/topbar-actions"
import { BoNotificationBell } from "@/components/bo/notification-bell"
import { loadBoAlerts } from "@/lib/bo-alerts"
import { BoUserMenu } from "@/components/bo/user-menu"
import { BoLiveUpdates } from "@/components/bo/live-updates"

/**
 * WeeFly — o back-office do Price Checker.
 *
 * Vive num grupo de rotas próprio, `(bo)`, e não dentro de `(admin)`: o desenho
 * deste ecrã traz o seu próprio topbar escuro e a sua própria folha de estilos, e
 * herdar o shell do /admin daria duas barras de navegação empilhadas.
 *
 * O acesso é a allowlist e não `platform_staff`. São duas contas nomeadas, e a
 * verificação está aqui *e* em cada server action — uma página protegida não
 * protege as ações que ela chama.
 */

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
})

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "WeeFly Admin · Price Checker",
}

/*
 * C-13 · "Pagamentos" e "Emissões" saíram da barra de topo.
 *
 * As entradas "Pedidos" e "Casos" já tinham saído com o back-office antigo.
 * Estas duas eram links para a mesma página com um `?tab=` diferente, e o
 * filtro funciona — mas do lado de quem clica não acontece nada de visível: a
 * página é a mesma, o indicador de menu activo não se move, e os baldes dentro
 * da fila não mostram qual deles está a filtrar. O teste registou-as como
 * botões que não fazem nada, e é essa a leitura correcta do ponto de vista de
 * quem as usa.
 *
 * Os dois baldes continuam a existir onde sempre estiveram e onde se veem a
 * funcionar: os separadores da própria fila. O que desaparece é a promessa
 * duplicada em cima.
 *
 * "A estrutura completa do menu é Sprint 4 — este sprint só remove o que está
 * quebrado." Fica o ícone da plataforma e a única entrada que leva a algum
 * lado.
 */
const NAV = [
  { label: "Price Checker", href: "/admin/price-checker", current: true },
]

export default async function BoPriceCheckerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const access = await getBoAccess()

  if (!access.ok && access.reason === "no_session") {
    redirect("/login?redirectedFrom=/admin/price-checker")
  }

  /* C-14 · os alertas desta pessoa. Só depois de a allowlist a reconhecer: um
     feed lido antes disso seria trabalho para quem não vai ver o ecrã. */
  const feed = access.ok
    ? await loadBoAlerts(access.identity.userId)
    : { alerts: [], unread: 0 }

  return (
    <>
      <style>{`:root{--font-jakarta:${jakarta.style.fontFamily};--font-plex-mono:${plexMono.style.fontFamily}}`}</style>
      <RoutePreloader background="#141A24" label="A carregar o back-office" />

      {!access.ok ? (
        <NoAccess email={access.email} />
      ) : (
        <>
          <header className="topbar">
            <div className="topbar-in">
              <WeeFlyLogo className="logo" />
              {/* C-20 · dizia "Admin". Só existe um perfil neste serviço, e
                  chama-se WeeFly Concierge — é o nome do serviço que a equipa
                  está a operar, não o nível de acesso de quem o abriu. */}
              <span className="env">Concierge</span>
              <nav className="nav">
                {NAV.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={item.current ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="topbar-right">
                {/* C-14 · o contador é lido no servidor a cada render, e é o
                    `BoLiveUpdates` que força esse render quando a base muda. */}
                <BoNotificationBell alerts={feed.alerts} unread={feed.unread} />
                <BoTopbarActions />
                <BoUserMenu
                  label={access.identity.label}
                  email={access.identity.email}
                  initials={boInitials(access.identity)}
                  role={access.identity.role}
                />
              </div>
            </div>
          </header>
          {/* BO-03 · a fila deixa de esperar por um F5. Ver o componente. */}
          <BoLiveUpdates />
          {children}
        </>
      )}
    </>
  )
}

/**
 * A conta entrou mas não está na lista.
 *
 * Diz qual é o email, porque o erro mais comum não é falta de permissão — é ter
 * entrado com a conta errada.
 */
function NoAccess({ email }: { email?: string }) {
  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>Sem acesso ao Price Checker</h1>
          <p>
            A conta <b className="mono">{email ?? "—"}</b> não está na lista de
            acessos deste back-office.
          </p>
        </div>
      </div>
      <div className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-h">
          <h3>Como se resolve</h3>
        </div>
        <div className="panel-b">
          <p className="note">
            O acesso é dado por email, uma conta de cada vez. Se devia ter acesso,
            peça a quem administra para acrescentar este email à lista:
          </p>
          <p className="note" style={{ marginTop: 10 }}>
            <code className="mono">
              insert into public.bo_allowlist (email, label) values (&apos;
              {email ?? "email"}&apos;, &apos;Nome&apos;);
            </code>
          </p>
          <div style={{ marginTop: 14 }}>
            <Link className="btn btn-sm" href="/inicio">
              Voltar ao início
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
