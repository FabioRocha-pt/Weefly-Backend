"use client"

/**
 * PRO-07 · o que se pode fazer depois de "enviámos um email para…".
 *
 * Reenviar, com espera de 60 s (o mesmo limite que o Supabase aplica). No ecrã
 * de link inválido não há registo em curso, e o formulário pede o email
 * (`askEmail`).
 *
 * OCT-06 · corrigir o endereço saiu: dava erro ("This registration can no
 * longer be changed here") e, depois de voltar atrás, a conta deixava de
 * conseguir entrar. Quem se enganou no email regista-se de novo.
 */

import { useEffect, useState, useTransition } from "react"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { resendSignupEmail, type ResendState } from "@/actions/auth"
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
  const [typed, setTyped] = useState("")

  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  function resend() {
    const fd = new FormData()
    if (askEmail) fd.set("email", typed)
    startTransition(async () => {
      try {
        const result = await resendSignupEmail(fd)
        setState(result)
        if (result.ok) setWait(COOLDOWN_S)
      } catch {
        setState({ ok: false, message: t("auth.emailSendFailed") })
      }
    })
  }

  return (
    <div className="w-full flex flex-col items-center gap-3 mb-6">
      {askEmail && (
        <Input
          type="email"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={t("auth.resetEmailPlaceholder")}
          className="max-w-xs"
          autoComplete="email"
        />
      )}

      <Button
        variant={askEmail ? "default" : "outline"}
        className={askEmail ? "bg-orange-600 hover:bg-orange-700" : undefined}
        disabled={pending || wait > 0 || (askEmail && !typed)}
        onClick={resend}
      >
        <RefreshCw className={`w-4 h-4 mr-2${pending ? " animate-spin" : ""}`} />
        {askEmail ? t("auth.invalidCta") : t("auth.confirmEmailResend")}
        {wait > 0 ? ` (${wait}s)` : ""}
      </Button>

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
