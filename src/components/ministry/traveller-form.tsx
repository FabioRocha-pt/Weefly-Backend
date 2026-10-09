"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { secretaryUpdateTraveller, type SecretaryTravellerInput } from "@/actions/ministry-case"
import type { MinistryTravellerCard } from "@/lib/ministry"
import { NATIONALITIES } from "@/lib/pc/catalog"
import { useT } from "@/i18n/provider"

/**
 * B2G-25 · a secretária corrige uma ficha do ministério. A gravação vai pela
 * sessão do PIN (`secretaryUpdateTraveller`), e o histórico fica na base com o
 * antes, o depois, a secretária e a hora.
 */
export function MinistryTravellerForm({
  orgSlug,
  linkToken,
  traveller,
  backHref,
}: {
  orgSlug: string
  linkToken: string
  traveller: MinistryTravellerCard
  backHref: string
}) {
  const t = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [v, setV] = useState<SecretaryTravellerInput>({
    id: traveller.id,
    title: (traveller.title as SecretaryTravellerInput["title"]) ?? "",
    firstName: traveller.firstName,
    lastName: traveller.lastName,
    gender: traveller.gender === "f" || traveller.gender === "m" ? traveller.gender : "",
    birthDate: traveller.birthDate ?? "",
    nationality: traveller.nationality ?? "",
    passportNumber: traveller.passportNumber ?? "",
    passportExpiry: traveller.passportExpiry ?? "",
    issuingCountry: traveller.issuingCountry ?? "",
    phone: traveller.phone ?? "",
    email: traveller.email ?? "",
  })

  const set = (key: keyof SecretaryTravellerInput) => (event: { target: { value: string } }) => {
    setSaved(false)
    setV((current) => ({ ...current, [key]: event.target.value }))
  }

  const field = (label: string, input: React.ReactNode) => (
    <label style={{ display: "block", marginTop: 10, fontSize: 13, fontWeight: 700 }}>
      {label}
      <div style={{ marginTop: 4 }}>{input}</div>
    </label>
  )
  const box: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "9px 10px",
    border: "1px solid var(--line)",
    borderRadius: 8,
    font: "inherit",
    fontWeight: 400,
    background: "#fff",
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await secretaryUpdateTraveller(orgSlug, linkToken, v)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 16 }}>
      {field(
        t("pc.pax.field.title"),
        <select style={box} value={v.title} onChange={set("title")}>
          <option value="">—</option>
          <option value="mr">Mr</option>
          <option value="mrs">Mrs</option>
          <option value="ms">Ms</option>
        </select>
      )}
      {field(t("pc.pax.field.given"), <input style={box} value={v.firstName} onChange={set("firstName")} required />)}
      {field(t("pc.pax.field.surname"), <input style={box} value={v.lastName} onChange={set("lastName")} required />)}
      {field(t("pc.pax.field.dob"), <input style={box} type="date" value={v.birthDate} onChange={set("birthDate")} />)}
      {field(
        t("pc.pax.field.sex"),
        <select style={box} value={v.gender} onChange={set("gender")}>
          <option value="">—</option>
          <option value="f">{t("pc.pax.sex.f")}</option>
          <option value="m">{t("pc.pax.sex.m")}</option>
        </select>
      )}
      {field(
        t("pc.pax.field.nationality"),
        <select style={box} value={v.nationality} onChange={set("nationality")}>
          <option value="">—</option>
          {NATIONALITIES.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      )}
      {field(
        t("pc.pax.field.passportNumber"),
        <input className="mono" style={box} value={v.passportNumber} onChange={set("passportNumber")} />
      )}
      {field(
        t("pc.pax.field.passportExpiry"),
        <input style={box} type="date" value={v.passportExpiry} onChange={set("passportExpiry")} />
      )}
      {field(
        t("pc.pax.field.issuingCountry"),
        <select style={box} value={v.issuingCountry} onChange={set("issuingCountry")}>
          <option value="">—</option>
          {NATIONALITIES.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      )}
      {field(t("pc.pax.field.phone"), <input style={box} type="tel" value={v.phone} onChange={set("phone")} />)}
      {field(t("pc.pax.field.email"), <input style={box} type="email" value={v.email} onChange={set("email")} />)}

      {error && (
        <p role="alert" className="err" style={{ display: "block", marginTop: 12 }}>
          {error}
        </p>
      )}
      {saved && (
        <p role="status" style={{ marginTop: 12, color: "#166534", fontWeight: 700 }}>
          {t("ministry.travellers.saved")}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="submit" disabled={pending} style={{ width: "auto" }}>
          {pending ? t("ministry.travellers.saving") : t("ministry.travellers.save")}
        </button>
        <a href={backHref} className="btn btn-ghost" style={{ width: "auto", textDecoration: "none" }}>
          {t("ministry.travellers.back")}
        </a>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--muted)" }}>{t("ministry.travellers.logged")}</p>
    </form>
  )
}
