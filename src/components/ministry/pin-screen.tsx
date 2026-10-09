"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { enterMinistryPin, leaveMinistry } from "@/actions/ministry-session"
import { useT } from "@/i18n/provider"

/**
 * B2G-07 · o ecrã do PIN. O link pessoal abre isto; só com o PIN certo a
 * secretária vê o espaço do ministério. O PIN não fica guardado no browser:
 * o campo limpa-se a cada tentativa, e a sessão vive num cookie httpOnly que
 * este componente nunca vê.
 */
export function MinistryPinScreen({
  orgSlug,
  linkToken,
  ministryName,
  logoUrl,
  crestUrl,
  secretaryName,
}: {
  orgSlug: string
  linkToken: string
  ministryName: string
  logoUrl: string | null
  crestUrl: string | null
  secretaryName: string
}) {
  const t = useT()
  const router = useRouter()
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      setError(null)
      const result = await enterMinistryPin(orgSlug, linkToken, pin)
      setPin("")
      if (result.ok) router.refresh()
      else setError(result.error)
    })

  return (
    <main className="shell" style={{ paddingTop: 40, paddingBottom: 40 }}>
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        {logoUrl || crestUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={(logoUrl ?? crestUrl)!}
            alt={ministryName}
            style={{ maxHeight: 64, maxWidth: "100%", margin: "0 auto 12px", display: "block" }}
          />
        ) : null}
        <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>{ministryName}</h1>
        <p style={{ margin: "0 0 20px", color: "var(--muted)", fontSize: 14 }}>
          {t("ministry.pin.hello", { name: secretaryName })}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!pending) submit()
          }}
        >
          <label htmlFor="ministry-pin" style={{ display: "block", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
            {t("ministry.pin.label")}
          </label>
          <div className="inp" style={{ maxWidth: 220, margin: "0 auto" }}>
            <input
              id="ministry-pin"
              className="plain mono"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              style={{ textAlign: "center", fontSize: 24, letterSpacing: 8 }}
              aria-invalid={Boolean(error)}
              autoFocus
            />
          </div>
          {error && (
            <p role="alert" style={{ color: "var(--ember-dk)", fontWeight: 600, fontSize: 14, margin: "12px 0 0" }}>
              {error}
            </p>
          )}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={pending || pin.length !== 6}
            style={{ marginTop: 18, width: "100%" }}
          >
            {pending ? t("ministry.pin.checking") : t("ministry.pin.enter")}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 16 }}>
          {t("ministry.pin.help")}
        </p>
      </div>
    </main>
  )
}

/** Terminar a sessão neste dispositivo (computadores partilhados). */
export function MinistryLeaveButton({ orgSlug, linkToken }: { orgSlug: string; linkToken: string }) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <div className="shell" style={{ textAlign: "center", padding: "8px 16px" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await leaveMinistry(orgSlug, linkToken)
            router.refresh()
          })
        }
      >
        {t("ministry.pin.leave")}
      </button>
    </div>
  )
}
