"use client"

/**
 * APP-04 · Meus dados — o cliente vê e edita os seus dados.
 *
 * "O cliente altera os seus dados aqui, e estes dados preenchem a passagem
 * automaticamente, a não ser que ele os mude nesse pedido." (decisão D-A)
 *
 * Dois modos, e a diferença entre eles é o critério do documento:
 *   · **a ver** · o telefone, o email e o passaporte aparecem mascarados
 *     (`+238 ••• •• 47`, `jo•••@gmail.com`, `•••••• 123`): é o que protege os
 *     dados de quem olha por cima do ombro, num telemóvel emprestado;
 *   · **a editar** · cada campo mostra-se completo.
 *
 * O passaporte a menos de seis meses de expirar fica assinalado — com um
 * aviso escrito, não só com a cor.
 *
 * A língua muda logo ao escolher (não espera pelo "Guardar"): é a língua da
 * app inteira, e é nela que saem os pedidos seguintes.
 */

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { saveVipProfile, setVipLocale } from "@/actions/vip-app"
import { useToast } from "@/components/pc/chrome"
import { NATIONALITIES } from "@/lib/pc/catalog"
import { COUNTRIES, COUNTRY_BY_ISO, countryName, toE164 } from "@/lib/countries"
import { maskEmail, maskPassport, maskPhone } from "@/lib/vip-address"
import { LOCALES, LOCALE_TAGS, type Locale } from "@/i18n/config"
import { useI18n } from "@/i18n/provider"

export interface VipProfileValues {
  country: string
  phone: string
  email: string
  title: string
  givenNames: string
  surname: string
  birthDate: string
  gender: string
  nationality: string
  passportNumber: string
  passportExpiry: string
  issuingCountry: string
}

const TITLE_LABEL: Record<string, string> = { mr: "Mr", mrs: "Mrs", ms: "Ms" }

/** Expirado, ou a menos de seis meses de expirar. */
function passportWarning(expiry: string): "expired" | "soon" | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (expiry < iso(today)) return "expired"
  const limit = new Date(today)
  limit.setMonth(limit.getMonth() + 6)
  return expiry < iso(limit) ? "soon" : null
}

export function VipProfileCard({
  handle,
  initial,
  hasConsent,
  locale,
}: {
  /** O endereço da app (`<nome>-<código>`): é a autorização das ações. */
  handle: string
  initial: VipProfileValues
  /** O cliente já consentiu em guardar o passaporte. */
  hasConsent: boolean
  locale: Locale
}) {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const tag = LOCALE_TAGS[locale]
  const [pending, startTransition] = useTransition()

  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<VipProfileValues>(initial)
  /* O que se mostra a ver: o que veio do servidor e, logo a seguir a guardar,
     o que acabou de ser gravado — sem esperar pela página nova para deixar de
     mostrar os valores antigos. */
  const [shown, setShown] = useState<VipProfileValues>(initial)
  const [consent, setConsent] = useState(hasConsent)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof VipProfileValues, value: string) => setValues((v) => ({ ...v, [key]: value }))

  /* Os países pela ordem do nome na língua de quem lê. */
  const countries = useMemo(
    () =>
      COUNTRIES.map((c) => ({ iso: c.iso, dial: c.dial, name: countryName(c.iso, tag) })).sort((a, b) =>
        a.name.localeCompare(b.name, tag)
      ),
    [tag]
  )

  const dial = COUNTRY_BY_ISO[shown.country]?.dial ?? ""
  const fullPhone = shown.phone ? (toE164(dial, shown.phone) ?? `${dial}${shown.phone}`) : ""
  const warning = passportWarning(shown.passportExpiry)

  const date = (iso: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(iso)
      ? new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric" }).format(
          new Date(`${iso}T12:00:00`)
        )
      : ""

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await saveVipProfile(handle, { ...values, locale, passportConsent: consent })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast(result.notice ?? t("vipApp.data.saved"))
      setShown({ ...values, passportNumber: values.passportNumber.trim().toUpperCase() })
      setEditing(false)
      router.refresh()
    })
  }

  function changeLocale(next: string) {
    startTransition(async () => {
      const result = await setVipLocale(handle, next)
      if (!result.ok) {
        toast(result.error)
        return
      }
      router.refresh()
    })
  }

  const row = (label: string, value: string, extra?: React.ReactNode) => (
    <div className="srow">
      <span className="k">{label}</span>
      <span className="v" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        {value || <span style={{ color: "var(--muted)", fontWeight: 500 }}>{t("vipApp.data.missing")}</span>}
        {extra}
      </span>
    </div>
  )

  const language = (
    <div className="card">
      <div className="sechead">
        <h3>{t("vipApp.data.preferences")}</h3>
      </div>
      <div className="ff">
        <label htmlFor="vipLocale">{t("vipApp.data.language")}</label>
        <select id="vipLocale" value={locale} disabled={pending} onChange={(e) => changeLocale(e.target.value)}>
          {LOCALES.map((code) => (
            <option key={code} value={code}>
              {t(`vipApp.data.languages.${code}`)}
            </option>
          ))}
        </select>
        <span className="hi">{t("vipApp.data.languageHint")}</span>
      </div>
    </div>
  )

  if (!editing) {
    return (
      <>
        <div className="card">
          <div className="sechead">
            <h3>{t("vipApp.data.contact")}</h3>
          </div>
          {row(t("vipApp.data.phone"), maskPhone(fullPhone))}
          {row(t("vipApp.data.email"), maskEmail(shown.email))}
        </div>

        <div className="card">
          <div className="sechead">
            <h3>{t("vipApp.data.forTicket")}</h3>
            <span className="rt">{t("vipApp.data.asInPassport")}</span>
          </div>
          {row(
            t("vipApp.data.names"),
            [TITLE_LABEL[shown.title] ?? "", shown.givenNames, shown.surname].filter(Boolean).join(" ")
          )}
          {row(t("vipApp.data.birthDate"), date(shown.birthDate))}
          {row(t("vipApp.data.sex"), shown.gender ? t(`pc.pax.sex.${shown.gender}`) : "")}
          {row(t("vipApp.data.nationality"), shown.nationality)}
          {row(t("vipApp.data.passport"), maskPassport(shown.passportNumber))}
          {row(t("vipApp.data.passportExpiry"), date(shown.passportExpiry))}
          {row(t("vipApp.data.issuingCountry"), shown.issuingCountry)}
          {warning && (
            <div className="banner warn" role="status" style={{ marginTop: 12 }}>
              <span className="ic" aria-hidden>
                !
              </span>
              <div>
                <b>{t(`vipApp.data.passportWarn.${warning}Title`)}</b>
                <p>{t(`vipApp.data.passportWarn.${warning}Body`)}</p>
              </div>
            </div>
          )}
          <p className="subnote" style={{ textAlign: "left" }}>
            {t("vipApp.data.fillsTicket")}
          </p>
          <button
            className="btn btn-primary"
            type="button"
            style={{ marginTop: 12 }}
            onClick={() => {
              setValues(shown)
              setConsent(hasConsent)
              setError(null)
              setEditing(true)
              window.scrollTo(0, 0)
            }}
          >
            {t("vipApp.data.edit")}
          </button>
        </div>

        {language}
      </>
    )
  }

  const field = (
    cls: string,
    label: string,
    control: React.ReactNode,
    hint?: string
  ) => (
    <div className={`ff ${cls}`}>
      <label>{label}</label>
      {control}
      {hint && <span className="hi">{hint}</span>}
    </div>
  )

  return (
    <>
      <div className="card">
        <div className="sechead">
          <h3>{t("vipApp.data.contact")}</h3>
        </div>
        <div className="pgrid">
          {field(
            "c12",
            t("vipApp.data.phoneCountry"),
            <select value={values.country} onChange={(e) => set("country", e.target.value)}>
              {countries.map((c) => (
                <option key={c.iso} value={c.iso}>
                  {c.name} ({c.dial})
                </option>
              ))}
            </select>
          )}
          {field(
            "c12",
            t("vipApp.data.phone"),
            <input
              className="mono"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={values.phone}
              onChange={(e) => set("phone", e.target.value)}
            />,
            t("vipApp.data.phoneHint", { dial: COUNTRY_BY_ISO[values.country]?.dial ?? "" })
          )}
          {field(
            "c12",
            t("vipApp.data.email"),
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="card">
        <div className="sechead">
          <h3>{t("vipApp.data.forTicket")}</h3>
          <span className="rt">{t("vipApp.data.asInPassport")}</span>
        </div>
        <div className="pgrid">
          {field(
            "c4",
            t("pc.pax.field.title"),
            <select value={values.title} onChange={(e) => set("title", e.target.value)}>
              <option value="">{t("pc.pax.field.select")}</option>
              {Object.entries(TITLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
          {field(
            "c8",
            t("pc.pax.field.given"),
            <input
              autoComplete="given-name"
              placeholder={t("pc.pax.field.asInPassport")}
              value={values.givenNames}
              onChange={(e) => set("givenNames", e.target.value)}
            />
          )}
          {field(
            "c12",
            t("pc.pax.field.surname"),
            <input
              autoComplete="family-name"
              placeholder={t("pc.pax.field.asInPassport")}
              value={values.surname}
              onChange={(e) => set("surname", e.target.value)}
            />
          )}
          {field(
            "c6",
            t("pc.pax.field.dob"),
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={values.birthDate}
              onChange={(e) => set("birthDate", e.target.value)}
            />
          )}
          {field(
            "c6",
            t("pc.pax.field.sex"),
            <select value={values.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">{t("pc.pax.field.select")}</option>
              <option value="f">{t("pc.pax.sex.f")}</option>
              <option value="m">{t("pc.pax.sex.m")}</option>
            </select>
          )}
          {field(
            "c12",
            t("pc.pax.field.nationality"),
            <select value={values.nationality} onChange={(e) => set("nationality", e.target.value)}>
              <option value="">{t("pc.pax.field.select")}</option>
              {NATIONALITIES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          )}
          {field(
            "c6",
            t("pc.pax.field.passportNumber"),
            <input
              className="mono"
              autoCapitalize="characters"
              autoComplete="off"
              style={{ letterSpacing: ".04em" }}
              value={values.passportNumber}
              onChange={(e) => set("passportNumber", e.target.value.toUpperCase())}
            />
          )}
          {field(
            "c6",
            t("vipApp.data.passportExpiry"),
            <input
              type="date"
              value={values.passportExpiry}
              onChange={(e) => set("passportExpiry", e.target.value)}
            />
          )}
          {field(
            "c12",
            t("vipApp.data.issuingCountry"),
            <select value={values.issuingCountry} onChange={(e) => set("issuingCountry", e.target.value)}>
              <option value="">{t("pc.pax.field.select")}</option>
              {NATIONALITIES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          )}
        </div>

        {/* O consentimento do próprio cliente, marcado ao guardar o passaporte. */}
        {values.passportNumber.trim() !== "" && (
          <label className="consent" htmlFor="vipPassportConsent">
            <input
              type="checkbox"
              id="vipPassportConsent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <p>{t("vipApp.data.consent")}</p>
          </label>
        )}

        {error && (
          <span className="err" role="alert" style={{ marginTop: 10, display: "block" }}>
            {error}
          </span>
        )}

        <div className="actions">
          <button className="btn btn-ghost" type="button" disabled={pending} onClick={() => setEditing(false)}>
            {t("vipApp.data.cancel")}
          </button>
          <button className="btn btn-primary" type="button" disabled={pending} onClick={save}>
            {pending ? t("vipApp.data.saving") : t("vipApp.data.save")}
          </button>
        </div>
      </div>
    </>
  )
}
