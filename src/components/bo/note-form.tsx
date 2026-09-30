"use client"

/**
 * As notas internas do caso.
 *
 * A conversa de WhatsApp acontece fora do sistema e não fica guardada em
 * nenhuma tabela. O que se perde quando um caso muda de vendedor é isto — o que
 * ficou combinado — e é por isso que a caixa está em duas abas: no Pedido, onde
 * se escreve, e nas Comunicações, onde se procura.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { boSaveNote } from "@/actions/bo-price-checker"
import { useI18n } from "@/i18n/provider"
import { LOCALE_TAGS } from "@/i18n/config"

export function BoNoteForm({
  caseId,
  notes,
}: {
  caseId: string
  notes: { id: string; body: string; author_email: string | null; created_at: string }[]
}) {
  const router = useRouter()
  const { t, locale } = useI18n()
  const [pending, startTransition] = useTransition()
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>{t("bo.queue.notes.title")}</h3>
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
          {t("bo.queue.notes.teamOnly")}
        </span>
      </div>
      <div className="panel-b">
        <div className="f">
          <textarea
            placeholder={t("bo.queue.notes.placeholder")}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <span className="hint">
            {t("bo.queue.notes.hint")}
          </span>
        </div>

        {error && (
          <div className="note bad" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <button
            className="btn btn-sm btn-primary"
            type="button"
            disabled={pending || body.trim().length === 0}
            onClick={() => {
              setError(null)
              startTransition(async () => {
                const result = await boSaveNote({ caseId, body })
                if (result.ok) {
                  setBody("")
                  router.refresh()
                } else {
                  setError(result.error)
                }
              })
            }}
          >
            {pending ? t("bo.queue.notes.saving") : t("bo.queue.notes.save")}
          </button>
        </div>

        {notes.length > 0 && (
          <div className="log" style={{ marginTop: 16 }}>
            {notes.map((note) => (
              <div className="logrow" key={note.id}>
                <span className="t mono">
                  {new Date(note.created_at).toLocaleString(LOCALE_TAGS[locale], {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Atlantic/Cape_Verde",
                  })}
                </span>
                <div>
                  <b>{note.author_email ?? t("bo.queue.notes.team")}</b>
                  <span>{note.body}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
