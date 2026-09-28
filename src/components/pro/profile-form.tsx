"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateProfile } from "@/actions/pro"
import { updatePassword } from "@/actions/auth"
import { useT } from "@/i18n/provider"

/** PRO-13 · os dados da pessoa e a mudança de password. */
export function ProfileForm(props: {
  firstName: string
  lastName: string
  phone: string
  email: string
  company: string
  profile: string
}) {
  const t = useT()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwPending, startPw] = useTransition()
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <div className="space-y-6">
      <form
        className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
        action={(formData) =>
          start(async () => {
            setMessage(null)
            const result = await updateProfile(formData)
            setMessage(
              result.ok
                ? { ok: true, text: result.notice ?? t("profile.saved") }
                : { ok: false, text: result.error }
            )
          })
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">{t("auth.firstName")}</Label>
            <Input id="firstName" name="firstName" defaultValue={props.firstName} required minLength={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">{t("auth.lastName")}</Label>
            <Input id="lastName" name="lastName" defaultValue={props.lastName} required minLength={2} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t("auth.phone")}</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={props.phone} />
        </div>

        <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl bg-slate-50 p-4 text-sm">
          <ReadOnly label={t("auth.email")} value={props.email} />
          <ReadOnly label={t("profile.company")} value={props.company} />
          <ReadOnly label={t("profile.accessProfile")} value={props.profile} />
        </dl>
        <p className="text-xs text-slate-500">{t("profile.adminOnly")}</p>

        {message && (
          <p className={message.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"} role="status">
            {message.text}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? t("profile.saving") : t("dashboard.saveChanges")}
        </Button>
      </form>

      <form
        className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
        action={(formData) =>
          startPw(async () => {
            setPwMessage(null)
            if (formData.get("password") !== formData.get("confirm")) {
              setPwMessage({ ok: false, text: t("validation.passwordsMismatch") })
              return
            }
            const result = await updatePassword(formData)
            setPwMessage(
              result.error
                ? { ok: false, text: result.error }
                : { ok: true, text: t("profile.passwordChanged") }
            )
          })
        }
      >
        <h2 className="font-semibold text-slate-900">{t("profile.passwordTitle")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="password">{t("profile.newPassword")}</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
          </div>
        </div>
        {pwMessage && (
          <p className={pwMessage.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"} role="status">
            {pwMessage.text}
          </p>
        )}
        <Button type="submit" variant="outline" disabled={pwPending}>
          {t("profile.changePassword")}
        </Button>
      </form>
    </div>
  )
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium text-slate-700 truncate">{value}</dd>
    </div>
  )
}
