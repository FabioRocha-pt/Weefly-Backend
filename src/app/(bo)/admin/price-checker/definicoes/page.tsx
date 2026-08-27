import Link from "next/link"

import { getBoAccess } from "@/lib/bo-access"

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

  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>Definições</h1>
          <p>
            A sua conta neste back-office e as preferências que vão passar a
            viver aqui.
          </p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-sm" href="/admin/price-checker">
            Voltar à fila
          </Link>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 620, marginTop: 18 }}>
        <div className="panel-h">
          <h3>A conta</h3>
        </div>
        <div className="panel-b">
          <dl className="set-list">
            <div>
              <dt>Nome</dt>
              <dd>{label}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd className="mono">{email}</dd>
            </div>
            <div>
              <dt>Perfil</dt>
              <dd>{role === "admin" ? "Administrador" : "Gestor"}</dd>
            </div>
          </dl>
          <p className="note" style={{ marginTop: 14 }}>
            O acesso a este back-office é dado <b>por email, uma conta de cada
            vez</b>. Para acrescentar ou revogar alguém, fala com quem administra
            — não há nada a mudar aqui.
          </p>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 620, marginTop: 14 }}>
        <div className="panel-h">
          <h3>Preferências</h3>
        </div>
        <div className="panel-b">
          <p className="note">
            Ainda não há nada para escolher. Três preferências estão a caminho e
            é aqui que vão ficar: o <b>idioma do back-office</b>, as{" "}
            <b>preferências de avisos</b> e a nota de contexto de cada ecrã, que
            se desliga a partir daqui.
          </p>
        </div>
      </div>
    </div>
  )
}
