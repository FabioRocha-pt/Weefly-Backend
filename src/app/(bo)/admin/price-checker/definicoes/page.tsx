import Link from "next/link"

import { getBoAccess } from "@/lib/bo-access"
import { BoLanguageSetting } from "@/components/bo/language-setting"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * BO-01 · as Definições, o destino da entrada no menu do avatar.
 *
 * O pedido é explícito em que as definições vivem dentro do menu da conta e não
 * como entrada de topo. Esta página é esse destino: sem ela, a entrada do menu
 * não teria para onde ir, e um menu que abre para uma página em falta é pior do
 * que o lugar reservado que substituiu.
 *
 * O que está aqui hoje é o que é verdade hoje — a conta e como o acesso é dado.
 * As preferências que estavam desativadas no menu (avisos, idioma, desempenho)
 * ficam anunciadas e por construir: o idioma é o `PC-04`, os avisos são o
 * `VIP-14`, e a nota de contexto que se desliga daqui é o `HDR-03`. Anunciar sem
 * fingir é o que evita que alguém as peça outra vez.
 */

export const dynamic = "force-dynamic"

export default async function BoSettingsPage() {
  const access = await getBoAccess()
  if (!access.ok) return null // O layout já mostrou a página de sem acesso.

  const { label, email, role } = access.identity
  const { t } = await getBoI18n()

  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>{t("bo.shell.settings.title")}</h1>
          <p>
            {t("bo.shell.settings.intro")}
          </p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-sm" href="/admin/price-checker">
            {t("bo.shell.settings.backToQueue")}
          </Link>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 620, marginTop: 18 }}>
        <div className="panel-h">
          <h3>{t("bo.shell.settings.account")}</h3>
        </div>
        <div className="panel-b">
          <dl className="set-list">
            <div>
              <dt>{t("bo.shell.settings.name")}</dt>
              <dd>{label}</dd>
            </div>
            <div>
              <dt>{t("bo.shell.settings.email")}</dt>
              <dd className="mono">{email}</dd>
            </div>
            <div>
              <dt>{t("bo.shell.settings.profile")}</dt>
              {/* C-20 · um serviço, um perfil. Ver o comentário em
                  `components/bo/user-menu.tsx`. */}
              <dd>WeeFly Concierge</dd>
            </div>
          </dl>
          <p className="note" style={{ marginTop: 14 }}>
            {t("bo.shell.settings.accessBefore")} <b>{t("bo.shell.settings.accessBold")}</b>
            {t("bo.shell.settings.accessAfter")}
          </p>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 620, marginTop: 14 }}>
        <div className="panel-h">
          <h3>{t("bo.shell.settings.preferences")}</h3>
        </div>
        <div className="panel-b">
          {/* I18N-01 · a língua do back-office. As outras preferências (avisos,
              nota de contexto) continuam por construir. */}
          <BoLanguageSetting />
        </div>
      </div>
    </div>
  )
}
