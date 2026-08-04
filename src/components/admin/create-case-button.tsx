"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Loader2, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { createCase } from "@/actions/booking-cases"
import { LINK_STAGE_PATHS } from "@/lib/case-status"

const STAGES: { stage: number; title: string; hint: string }[] = [
  { stage: 1, title: "1 · Pedido de viagem", hint: "para onde vai, datas, quem viaja" },
  { stage: 2, title: "2 · Dados dos passageiros", hint: "nomes e passaportes" },
  { stage: 3, title: "3 · Pagamento", hint: "só mostra valor depois de o definir" },
]

/**
 * "Novo link de atendimento" — the create drawer from the A2/A3 mockup.
 *
 * The mockup's form (channel, seller, currency, link validity) is not collected
 * here: none of those have anywhere to be stored yet, and a form that discards
 * what you type is worse than no form. What survives is the part that does the
 * work — the token, the three addresses, and a message ready to paste.
 */
export function CreateCaseButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [token, setToken] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function create() {
    setError(null)
    startTransition(async () => {
      const result = await createCase()
      if (result.error || !result.token) {
        setError(result.error ?? "Não foi possível criar o link.")
        setOpen(true)
        return
      }
      setToken(result.token)
      setOpen(true)
      router.refresh()
    })
  }

  function close() {
    setOpen(false)
    setToken(null)
    setError(null)
  }

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const link1 = token ? `${origin}/p/${token}` : ""

  const message = token
    ? `Olá! Aqui está o seu link pessoal WeeFly para eu procurar as melhores tarifas:

${link1}

Preencha para onde vai, as datas e quem viaja. Recebo logo o pedido e envio-lhe as opções.`
    : ""

  return (
    <>
      <button
        type="button"
        onClick={create}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-adm-ember px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-adm-ember-dark disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Novo link de atendimento
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={close}
            aria-hidden
          />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-adm-line bg-adm-panel shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-adm-line p-5">
              <div>
                <h2 className="text-base font-bold text-adm-txt">
                  {error ? "Não foi possível criar" : "Link criado"}
                </h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-adm-muted">
                  {error
                    ? "O caso não chegou a ser gravado."
                    : "Copie e cole na conversa. O caso já aparece na lista em E0."}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Fechar"
                className="rounded-md p-1.5 text-adm-muted transition-colors hover:bg-adm-raise hover:text-adm-txt"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {error ? (
                <p className="rounded-lg bg-adm-ember/10 p-3 text-[13px] text-adm-ember">
                  {error}
                </p>
              ) : (
                <>
                  <section>
                    <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-adm-muted">
                      Os três endereços
                    </h3>
                    <div className="space-y-2">
                      {STAGES.map(({ stage, title, hint }) => (
                        <CopyRow
                          key={stage}
                          title={title}
                          hint={hint}
                          value={`${origin}/p/${token}${LINK_STAGE_PATHS[stage]}`}
                        />
                      ))}
                    </div>
                    <p className="mt-3 rounded-lg bg-adm-warn/10 p-2.5 text-[11.5px] leading-relaxed text-adm-warn">
                      Estes links dão acesso aos dados dos passageiros. Envie-os
                      só ao cliente, na conversa onde o atendeu.{" "}
                      <b>Nunca em grupos.</b>
                    </p>
                  </section>

                  <section>
                    <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-adm-muted">
                      Mensagem pronta a enviar
                    </h3>
                    <textarea
                      readOnly
                      value={message}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-h-[150px] w-full rounded-lg border border-adm-line bg-adm-bg p-3 text-[12.5px] leading-relaxed text-adm-txt-2 outline-none focus:border-adm-ember"
                    />
                    <div className="mt-2 flex gap-2">
                      <CopyButton value={message} label="Copiar mensagem" wide />
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 rounded-lg border border-adm-line bg-adm-raise px-3 py-2 text-center text-[12px] font-semibold text-adm-txt-2 transition-colors hover:text-adm-txt"
                      >
                        Abrir no WhatsApp
                      </a>
                    </div>
                  </section>
                </>
              )}
            </div>

            <footer className="flex gap-2 border-t border-adm-line p-4">
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-lg border border-adm-line bg-adm-raise px-3 py-2 text-[13px] font-semibold text-adm-txt-2 transition-colors hover:text-adm-txt"
              >
                Fechar
              </button>
              {!error && (
                <button
                  type="button"
                  onClick={create}
                  disabled={pending}
                  className="flex-1 rounded-lg bg-adm-ember px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-adm-ember-dark disabled:opacity-60"
                >
                  Criar outro
                </button>
              )}
            </footer>
          </aside>
        </>
      )}
    </>
  )
}

function CopyRow({
  title,
  hint,
  value,
}: {
  title: string
  hint: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-adm-line bg-adm-bg p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-adm-txt">{title}</span>
        <CopyButton value={value} label="Copiar" />
      </div>
      <p className="mt-0.5 text-[11px] text-adm-muted">{hint}</p>
      <code className="mt-1.5 block break-all font-mono text-[11px] text-adm-txt-2">
        {value}
      </code>
    </div>
  )
}

function CopyButton({
  value,
  label,
  wide,
}: {
  value: string
  label: string
  wide?: boolean
}) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-adm-line bg-adm-raise px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
        copied ? "text-adm-ok" : "text-adm-txt-2 hover:text-adm-txt",
        wide && "flex-1 py-2 text-[12px]"
      )}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copiado" : label}
    </button>
  )
}
