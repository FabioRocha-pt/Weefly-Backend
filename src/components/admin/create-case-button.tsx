"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Loader2, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { createCase } from "@/actions/booking-cases"
import { LINK_STAGE_PATHS } from "@/lib/case-status"
import { useT } from "@/i18n/provider"
import { translateMessage } from "@/i18n/translate"

/*
 * O link 2 não está aqui de propósito.
 *
 * Desde a migração 0005 ele só existe depois de a proposta ser publicada, e
 * mostrar agora um endereço que responde "ainda não disponível" ensinaria o
 * vendedor a enviar links partidos.
 */
const STAGES = [
  { stage: 1, titleKey: "admin.newCaseStage1", hintKey: "admin.newCaseStage1Hint" },
  { stage: 3, titleKey: "admin.newCaseStage3", hintKey: "admin.newCaseStage3Hint" },
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
  const t = useT()
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
        setError(result.error ?? "errors.caseCreateFailed")
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

  const message = token ? t("admin.newCaseClientMessage", { link: link1 }) : ""

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
        {t("admin.newCase")}
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
                  {error ? t("admin.newCaseFailed") : t("admin.newCaseCreated")}
                </h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-adm-muted">
                  {error
                    ? t("admin.newCaseFailedHint")
                    : t("admin.newCaseCreatedHint")}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t("common.close")}
                className="rounded-md p-1.5 text-adm-muted transition-colors hover:bg-adm-raise hover:text-adm-txt"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {error ? (
                <p className="rounded-lg bg-adm-ember/10 p-3 text-[13px] text-adm-ember">
                  {translateMessage(t, error)}
                </p>
              ) : (
                <>
                  <section>
                    <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-adm-muted">
                      {t("admin.newCaseAddresses")}
                    </h3>
                    <div className="space-y-2">
                      {STAGES.map(({ stage, titleKey, hintKey }) => (
                        <CopyRow
                          key={stage}
                          title={t(titleKey)}
                          hint={t(hintKey)}
                          copyLabel={t("common.copy")}
                          copiedLabel={t("common.copied")}
                          value={`${origin}/p/${token}${LINK_STAGE_PATHS[stage]}`}
                        />
                      ))}
                    </div>
                    <p className="mt-2.5 rounded-lg border border-dashed border-adm-line p-2.5 text-[11.5px] leading-relaxed text-adm-muted">
                      <b className="text-adm-txt-2">
                        {t("admin.newCaseStage2Pending")}
                      </b>{" "}
                      {t("admin.newCaseStage2PendingHint")}
                    </p>
                    <p className="mt-3 rounded-lg bg-adm-warn/10 p-2.5 text-[11.5px] leading-relaxed text-adm-warn">
                      {t("admin.newCaseWarning")}
                    </p>
                  </section>

                  <section>
                    <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-adm-muted">
                      {t("admin.newCaseMessage")}
                    </h3>
                    <textarea
                      readOnly
                      value={message}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-h-[150px] w-full rounded-lg border border-adm-line bg-adm-bg p-3 text-[12.5px] leading-relaxed text-adm-txt-2 outline-none focus:border-adm-ember"
                    />
                    <div className="mt-2 flex gap-2">
                      <CopyButton
                        value={message}
                        label={t("admin.newCaseCopyMessage")}
                        copiedLabel={t("common.copied")}
                        wide
                      />
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 rounded-lg border border-adm-line bg-adm-raise px-3 py-2 text-center text-[12px] font-semibold text-adm-txt-2 transition-colors hover:text-adm-txt"
                      >
                        {t("admin.newCaseWhatsapp")}
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
                {t("common.close")}
              </button>
              {!error && (
                <button
                  type="button"
                  onClick={create}
                  disabled={pending}
                  className="flex-1 rounded-lg bg-adm-ember px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-adm-ember-dark disabled:opacity-60"
                >
                  {t("admin.newCaseAnother")}
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
  copyLabel,
  copiedLabel,
}: {
  title: string
  hint: string
  value: string
  copyLabel: string
  copiedLabel: string
}) {
  return (
    <div className="rounded-lg border border-adm-line bg-adm-bg p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-adm-txt">{title}</span>
        <CopyButton value={value} label={copyLabel} copiedLabel={copiedLabel} />
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
  copiedLabel,
  wide,
}: {
  value: string
  label: string
  copiedLabel: string
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
      {copied ? copiedLabel : label}
    </button>
  )
}
