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
import { useT } from "@/i18n/provider"

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
  const t = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!frozen) return null

  const chosen = offerName || t("bo.caseView.freeze.chosenFallback")

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>{t("bo.caseView.freeze.title")}</h3>
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
          {t("bo.caseView.freeze.subtitle")}
        </span>
      </div>
      <div className="panel-b">
        <div className="note warn">
          <b>{t("bo.caseView.freeze.frozenBold", { name: chosen })}</b>{" "}
          {t("bo.caseView.freeze.frozenBody")}
        </div>

        {issued ? (
          <p className="note bad" style={{ marginTop: 11 }}>
            {t("bo.caseView.freeze.issued")}
          </p>
        ) : paid ? (
          <p className="note bad" style={{ marginTop: 11 }}>
            {t("bo.caseView.freeze.paid")}
          </p>
        ) : notice ? (
          <div className="note ok" style={{ marginTop: 11 }}>
            {notice}
          </div>
        ) : !open ? (
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-sm" type="button" onClick={() => setOpen(true)}>
              {t("bo.caseView.freeze.open")}
            </button>
            <span style={{ marginLeft: 9, fontSize: 11, color: "var(--muted)" }}>
              {t("bo.caseView.freeze.openHint")}
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
              <label>{t("bo.caseView.freeze.reasonLabel")}</label>
              <textarea
                placeholder={t("bo.caseView.freeze.reasonPlaceholder")}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <span className="hint">
                {t("bo.caseView.freeze.reasonHint")}
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
                      setNotice(result.notice ?? t("bo.caseView.freeze.unfrozen"))
                      setOpen(false)
                      setReason("")
                      router.refresh()
                    } else {
                      setError(result.error)
                    }
                  })
                }}
              >
                {pending ? t("bo.caseView.freeze.processing") : t("bo.caseView.freeze.submit")}
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
                {t("bo.caseView.common.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
