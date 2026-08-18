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

export function BoNoteForm({
  caseId,
  notes,
}: {
  caseId: string
  notes: { id: string; body: string; author_email: string | null; created_at: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>Notas internas</h3>
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
          só a equipa vê
        </span>
      </div>
      <div className="panel-b">
        <div className="f">
          <textarea
            placeholder="O que ficou combinado no WhatsApp. Só a equipa vê."
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <span className="hint">
            A conversa de WhatsApp não fica guardada no sistema. Registe aqui o que
            importa para o caso.
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
            {pending ? "A guardar…" : "Guardar no caso"}
          </button>
        </div>

        {notes.length > 0 && (
          <div className="log" style={{ marginTop: 16 }}>
            {notes.map((note) => (
              <div className="logrow" key={note.id}>
                <span className="t mono">
                  {new Date(note.created_at).toLocaleString("pt-PT", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Atlantic/Cape_Verde",
                  })}
                </span>
                <div>
                  <b>{note.author_email ?? "equipa"}</b>
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
