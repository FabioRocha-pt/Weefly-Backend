"use client"

/**
 * PRO-07 · o que se pode fazer depois de "enviámos um email para…".
 *
 * Reenviar (com espera de 60 s, o mesmo limite que o Supabase aplica) e
 * corrigir o endereço, se estiver errado. No ecrã de link inválido não há
 * registo em curso, e o formulário pede o email (`askEmail`).
 */

import { useEffect, useState, useTransition } from "react"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  changeSignupEmail,
  resendSignupEmail,
  type ResendState,
} from "@/actions/auth"
import { useT } from "@/i18n/provider"

const COOLDOWN_S = 60

export function SignupEmailActions({
  email,
  askEmail = false,
}: {
  email: string | null
  askEmail?: boolean
}) {
  const t = useT()
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<ResendState>({ ok: false, message: null })
  const [wait, setWait] = useState(0)
  const [editing, setEditing] = useState(false)
  const [typed, setTyped] = useState(askEmail ? "" : (email ?? ""))

  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  function run(action: (fd: FormData) => Promise<ResendState>, value?: string) {
    const fd = new FormData()
    if (value) fd.set("email", value)
    startTransition(async () => {
      const result = await action(fd)
      setState(result)
      if (result.ok) {
        setWait(COOLDOWN_S)
        setEditing(false)
      }
    })
  }

  return (
    <div className="w-full flex flex-col items-center gap-3 mb-6">
      {(askEmail || editing) && (
        <Input
          type="email"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={t("auth.resetEmailPlaceholder")}
          className="max-w-xs"
          autoComplete="email"
        />
      )}

      {editing ? (
        <div className="flex gap-2">
          <Button
            disabled={pending || !typed}
            className="bg-orange-600 hover:bg-orange-700"
            onClick={() => run(changeSignupEmail, typed)}
          >
            {t("auth.changeEmailSave")}
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            {t("auth.changeEmailCancel")}
          </Button>
        </div>
      ) : (
        <Button
          variant={askEmail ? "default" : "outline"}
          className={askEmail ? "bg-orange-600 hover:bg-orange-700" : undefined}
          disabled={pending || wait > 0 || (askEmail && !typed)}
          onClick={() => run(resendSignupEmail, askEmail ? typed : undefined)}
        >
          <RefreshCw className={`w-4 h-4 mr-2${pending ? " animate-spin" : ""}`} />
          {askEmail ? t("auth.invalidCta") : t("auth.confirmEmailResend")}
          {wait > 0 ? ` (${wait}s)` : ""}
        </Button>
      )}

      {!askEmail && email && !editing && (
        <button
          type="button"
          className="text-sm text-orange-600 hover:text-orange-700 font-medium"
          onClick={() => {
            setTyped(email)
            setEditing(true)
            setState({ ok: false, message: null })
          }}
        >
          {t("auth.changeEmailCta")}
        </button>
      )}

      {state.message && (
        <p
          role="status"
          className={`text-sm max-w-xs ${state.ok ? "text-green-700" : "text-red-600"}`}
        >
          {state.message}
        </p>
      )}
    </div>
  )
}
