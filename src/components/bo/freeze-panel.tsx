"use client"

/**
 * BO-15 · o voo escolhido, congelado na fase de pagamento.
 *
 * A regra: a partir do momento em que o caso chega ao pagamento, o voo
 * escolhido não se edita. A parte que costuma ficar por fazer é a última linha
 * do requisito — **"o estado congelado é visível, não apenas imposto"**.
 *
 * Um botão desactivado sem explicação é a pior forma de impor uma regra: quem o
 * encontra tenta outra coisa, e a outra coisa costuma ser editar a proposta por
 * um caminho lateral. Este painel diz o que está congelado, porquê, e onde fica
 * a porta — que existe, tem nome ("voltar um passo"), pede um motivo e avisa o
 * cliente.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { boUnfreezeFlight } from "@/actions/bo-price-checker"

export function BoFreezePanel({
  caseId,
  frozen,
  paid,
  issued,
  offerName,
}: {
  caseId: string
  /** Há opção escolhida e já existe um pagamento a correr sobre ela. */
  frozen: boolean
  paid: boolean
  issued: boolean
  offerName: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!frozen) return null

  const chosen = offerName || "a opção escolhida"

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>Voo escolhido · congelado</h3>
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
          fase de pagamento
        </span>
      </div>
      <div className="panel-b">
        <div className="note warn">
          <b>{chosen} está congelada.</b> O caso já chegou ao pagamento: o preço
          que o cliente vê é o desta opção, e o valor a cobrar foi calculado a
          partir dela. Editar o itinerário aqui mudaria a viagem por baixo de um
          pagamento em curso.
        </div>

        {issued ? (
          <p className="note bad" style={{ marginTop: 11 }}>
            O caso está emitido. Mudar de voo é uma reemissão e passa pela
            companhia — não por este ecrã.
          </p>
        ) : paid ? (
          <p className="note bad" style={{ marginTop: 11 }}>
            O cliente já pagou. A partir daqui uma troca de voo é um reembolso ou
            uma alteração com a companhia, e nenhuma das duas se faz com um botão
            que diz “voltar atrás”.
          </p>
        ) : notice ? (
          <div className="note ok" style={{ marginTop: 11 }}>
            {notice}
          </div>
        ) : !open ? (
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-sm" type="button" onClick={() => setOpen(true)}>
              Voltar um passo e mudar de voo
            </button>
            <span style={{ marginLeft: 9, fontSize: 11, color: "var(--muted)" }}>
              desfaz a escolha, fecha o link de pagamento, abre uma revisão e
              avisa o cliente
            </span>
          </div>
        ) : (
          <div
            style={{
              marginTop: 13,
              borderTop: "1px solid var(--line-soft)",
              paddingTop: 13,
            }}
          >
            <div className="f s12">
              <label>Porque volta atrás · obrigatório</label>
              <textarea
                placeholder="A companhia deixou de ter lugares nesta tarifa e a alternativa parte duas horas mais tarde. Vamos enviar-lhe uma proposta nova."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <span className="hint">
                Esta frase vai para o cliente por email e WhatsApp, e fica no
                registo do caso.
              </span>
            </div>

            {error && (
              <div className="note bad" style={{ marginTop: 10 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
              <button
                className="btn btn-sm btn-primary"
                type="button"
                disabled={pending || reason.trim().length < 12}
                onClick={() => {
                  setError(null)
                  startTransition(async () => {
                    const result = await boUnfreezeFlight({ caseId, reason })
                    if (result.ok) {
                      setNotice(result.notice ?? "Voo descongelado.")
                      setOpen(false)
                      setReason("")
                      router.refresh()
                    } else {
                      setError(result.error)
                    }
                  })
                }}
              >
                {pending ? "A processar…" : "Voltar um passo e avisar o cliente"}
              </button>
              <button
                className="btn btn-sm"
                type="button"
                disabled={pending}
                onClick={() => {
                  setOpen(false)
                  setReason("")
                  setError(null)
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
