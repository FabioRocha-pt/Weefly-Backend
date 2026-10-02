"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { createPartner, setPartnerStatus, updatePartner } from "@/actions/partners"
import { type SubdomainCheck } from "@/actions/subdomain"
import { SubdomainField } from "@/components/pro/subdomain-field"
import { BrandUploads } from "@/components/pro/brand-uploads"
import { toSubdomain } from "@/lib/subdomain"
import { useT } from "@/i18n/provider"

/**
 * WeeFly · ADM-01 · Parceiros: criar, configurar a marca (TEN-02), suspender.
 *
 * Os valores da marca que ainda não chegaram (⚠ Dados a receber) ficam vazios:
 * o ecrã não inventa nenhum.
 */

type Menu = "flights" | "cars" | "houses" | "experiences" | "food"
/* A etiqueta de cada menu vem de `pro.menu.<id>`. */
const MENUS: Menu[] = ["flights", "cars", "houses", "experiences", "food"]

export interface PartnerRowView {
  id: string
  slug: string
  commercialName: string
  legalName: string | null
  nif: string | null
  country: string | null
  address: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  contractStart: string | null
  status: "active" | "suspended"
  suspendReason: string | null
  isOperator: boolean
  supplyEnabled: boolean
  sellEnabled: boolean
  sellMode: "reseller" | "white_label" | null
  channels: string[]
  customerFront: "own" | "weefly"
  agentMenus: string[]
  logoUrl: string | null
  colorPrimary: string | null
  colorDark: string | null
  colorAccent: string | null
  iconUrl: string | null
  ogImageUrl: string | null
  seoTitle: string | null
  seoDescription: string | null
  senderName: string | null
  senderEmail: string | null
  replyTo: string | null
  footerText: string | null
  poweredByWeefly: boolean
  whatsappNumber: string | null
  users: number
  activeUsers: number
}

type Form = {
  slug: string
  commercialName: string
  legalName: string
  nif: string
  country: string
  address: string
  contactName: string
  contactEmail: string
  contactPhone: string
  contractStart: string
  supplyEnabled: boolean
  sellEnabled: boolean
  sellMode: "reseller" | "white_label"
  channels: ("B2C" | "B2G")[]
  customerFront: "own" | "weefly"
  agentMenus: Menu[]
  logoUrl: string
  colorPrimary: string
  colorDark: string
  colorAccent: string
  iconUrl: string
  ogImageUrl: string
  seoTitle: string
  seoDescription: string
  senderName: string
  senderEmail: string
  replyTo: string
  footerText: string
  poweredByWeefly: boolean
  whatsappNumber: string
  firstAdminEmail: string
  firstAdminName: string
}

const EMPTY: Form = {
  slug: "",
  commercialName: "",
  legalName: "",
  nif: "",
  country: "CV",
  address: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  contractStart: "",
  supplyEnabled: false,
  sellEnabled: true,
  sellMode: "white_label",
  channels: ["B2G"],
  customerFront: "own",
  agentMenus: ["flights"],
  logoUrl: "",
  colorPrimary: "",
  colorDark: "",
  colorAccent: "",
  iconUrl: "",
  ogImageUrl: "",
  seoTitle: "",
  seoDescription: "",
  senderName: "",
  senderEmail: "",
  replyTo: "",
  footerText: "",
  poweredByWeefly: true,
  whatsappNumber: "",
  firstAdminEmail: "",
  firstAdminName: "",
}

function fromRow(p: PartnerRowView): Form {
  return {
    ...EMPTY,
    slug: p.slug,
    commercialName: p.commercialName,
    legalName: p.legalName ?? "",
    nif: p.nif ?? "",
    country: p.country ?? "",
    address: p.address ?? "",
    contactName: p.contactName ?? "",
    contactEmail: p.contactEmail ?? "",
    contactPhone: p.contactPhone ?? "",
    contractStart: p.contractStart ?? "",
    supplyEnabled: p.supplyEnabled,
    sellEnabled: p.sellEnabled,
    sellMode: p.sellMode ?? "white_label",
    channels: p.channels.filter((c): c is "B2C" | "B2G" => c === "B2C" || c === "B2G"),
    customerFront: p.customerFront,
    agentMenus: p.agentMenus.filter((m): m is Menu => MENUS.includes(m as Menu)),
    logoUrl: p.logoUrl ?? "",
    colorPrimary: p.colorPrimary ?? "",
    colorDark: p.colorDark ?? "",
    colorAccent: p.colorAccent ?? "",
    iconUrl: p.iconUrl ?? "",
    ogImageUrl: p.ogImageUrl ?? "",
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
    senderName: p.senderName ?? "",
    senderEmail: p.senderEmail ?? "",
    replyTo: p.replyTo ?? "",
    footerText: p.footerText ?? "",
    poweredByWeefly: p.poweredByWeefly,
    whatsappNumber: p.whatsappNumber ?? "",
  }
}

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100"

export function PartnersAdmin({ partners }: { partners: PartnerRowView[] }) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; form: Form; slugTouched: boolean } | null>(null)
  const [suspending, setSuspending] = useState<{ id: string; reason: string } | null>(null)
  const [slugState, setSlugState] = useState<SubdomainCheck | "checking">("unknown")

  const run = (
    action: () => Promise<{ ok: true; notice?: string } | { ok: false; error: string }>,
    after?: () => void
  ) =>
    start(async () => {
      setMessage(null)
      const result = await action()
      setMessage(result.ok ? { ok: true, text: result.notice ?? t("bo.pro.common.done") } : { ok: false, text: result.error })
      if (result.ok) {
        after?.()
        router.refresh()
      }
    })

  const save = () => {
    if (!editing) return
    const { form } = editing
    /* OCT-12 · um parceiro novo não se cria com um subdomínio ocupado. */
    if (!editing.id && slugState !== "available" && slugState !== "unknown") {
      setMessage({ ok: false, text: t(`bo.pro.common.subdomain.${slugState}`) })
      return
    }
    const payload = {
      commercialName: form.commercialName,
      legalName: form.legalName,
      nif: form.nif,
      country: form.country,
      address: form.address,
      contactName: form.contactName,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      contractStart: form.contractStart,
      supplyEnabled: form.supplyEnabled,
      sellEnabled: form.sellEnabled,
      sellMode: form.sellMode,
      channels: form.channels,
      customerFront: form.customerFront,
      agentMenus: form.agentMenus,
      logoUrl: form.logoUrl,
      colorPrimary: form.colorPrimary,
      colorDark: form.colorDark,
      colorAccent: form.colorAccent,
      seoTitle: form.seoTitle,
      seoDescription: form.seoDescription,
      senderName: form.senderName,
      senderEmail: form.senderEmail,
      replyTo: form.replyTo,
      footerText: form.footerText,
      poweredByWeefly: form.poweredByWeefly,
      whatsappNumber: form.whatsappNumber,
    }
    run(
      () =>
        editing.id
          ? updatePartner(editing.id, payload)
          : createPartner({
              ...payload,
              slug: form.slug,
              firstAdminEmail: form.firstAdminEmail,
              firstAdminName: form.firstAdminName,
            }),
      () => setEditing(null)
    )
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setEditing((e) => (e ? { ...e, form: { ...e.form, [key]: value } } : e))

  const toggle = <T extends string>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

  const input = (key: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="text-sm space-y-1">
      <span className="text-slate-600">{label}</span>
      <input
        className={field}
        value={String(editing?.form[key] ?? "")}
        onChange={(e) => set(key, e.target.value as never)}
        {...props}
      />
    </label>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setMessage(null)
            setEditing({ id: null, form: EMPTY, slugTouched: false })
          }}
        >
          {t("bo.pro.partners.newPartner")}
        </Button>
      </div>

      {message && (
        <p className={message.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"} role="status">
          {message.text}
        </p>
      )}

      {editing && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5 space-y-5">
          <h3 className="font-semibold text-slate-900">
            {editing.id ? t("bo.pro.common.editNamed", { name: editing.form.commercialName }) : t("bo.pro.partners.newPartner")}
          </h3>

          <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <legend className="text-sm font-semibold text-slate-900 mb-2">{t("bo.pro.partners.registry")}</legend>
            <label className="text-sm space-y-1">
              <span className="text-slate-600">{t("bo.pro.common.commercialName")}</span>
              <input
                className={field}
                value={editing.form.commercialName}
                onChange={(e) => {
                  const name = e.target.value
                  setEditing((cur) =>
                    cur
                      ? {
                          ...cur,
                          form: {
                            ...cur.form,
                            commercialName: name,
                            slug: cur.id || cur.slugTouched ? cur.form.slug : toSubdomain(name),
                          },
                        }
                      : cur
                  )
                }}
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-slate-600">{t("bo.pro.common.slugLabel")}</span>
              <SubdomainField
                className={field}
                value={editing.form.slug}
                disabled={Boolean(editing.id)}
                onStateChange={setSlugState}
                onChange={(slug) =>
                  setEditing((cur) => (cur ? { ...cur, slugTouched: true, form: { ...cur.form, slug } } : cur))
                }
              />
            </label>
            {input("legalName", t("bo.pro.partners.legalName"))}
            {input("nif", t("bo.pro.partners.nif"))}
            {input("country", t("bo.pro.partners.country"), { maxLength: 2 })}
            {input("address", t("bo.pro.partners.address"))}
            {input("contactName", t("bo.pro.partners.contactName"))}
            {input("contactEmail", t("bo.pro.partners.contactEmail"), { type: "email" })}
            {input("contactPhone", t("bo.pro.partners.contactPhone"))}
            {input("contractStart", t("bo.pro.partners.contractStart"), { type: "date" })}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-900">{t("bo.pro.partners.accountsAndSales")}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.form.supplyEnabled}
                onChange={(e) => set("supplyEnabled", e.target.checked)}
              />
              {t("bo.pro.partners.menuSupply")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.form.sellEnabled}
                onChange={(e) => set("sellEnabled", e.target.checked)}
              />
              {t("bo.pro.partners.menuSell")}
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6">
              <label className="text-sm space-y-1">
                <span className="text-slate-600">{t("bo.pro.partners.sellMode")}</span>
                <select
                  className={field}
                  value={editing.form.sellMode}
                  onChange={(e) => set("sellMode", e.target.value as Form["sellMode"])}
                >
                  <option value="reseller">{t("bo.pro.partners.sellModeReseller")}</option>
                  <option value="white_label">{t("bo.pro.partners.sellModeWhiteLabel")}</option>
                </select>
              </label>
              {editing.form.sellMode === "white_label" && (
                <label className="text-sm space-y-1">
                  <span className="text-slate-600">{t("bo.pro.partners.customerFront")}</span>
                  <select
                    className={field}
                    value={editing.form.customerFront}
                    onChange={(e) => set("customerFront", e.target.value as Form["customerFront"])}
                  >
                    <option value="own">{t("bo.pro.partners.frontOwn")}</option>
                    <option value="weefly">{t("bo.pro.partners.frontWeefly")}</option>
                  </select>
                </label>
              )}
            </div>
            <div className="flex flex-wrap gap-4 pl-6">
              {(["B2C", "B2G"] as const).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.form.channels.includes(c)}
                    onChange={() => set("channels", toggle(editing.form.channels, c))}
                  />
                  {c}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 pl-6">
              {MENUS.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.form.agentMenus.includes(m)}
                    onChange={() => set("agentMenus", toggle(editing.form.agentMenus, m))}
                  />
                  {t(`pro.menu.${m}`)}
                  {m !== "flights" && <span className="text-xs text-slate-400">{t("bo.pro.common.soonTag")}</span>}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <legend className="text-sm font-semibold text-slate-900 mb-2">{t("bo.pro.partners.brand")}</legend>
            <BrandUploads
              partnerId={editing.id}
              slug={editing.form.slug}
              name={editing.form.commercialName}
              title={editing.form.seoTitle}
              description={editing.form.seoDescription}
              urls={{
                logoUrl: editing.form.logoUrl,
                iconUrl: editing.form.iconUrl,
                ogImageUrl: editing.form.ogImageUrl,
              }}
              onUploaded={(kind, url) =>
                set(kind === "logo" ? "logoUrl" : kind === "icon" ? "iconUrl" : "ogImageUrl", url)
              }
            />
            <div className="grid grid-cols-3 gap-3 md:col-span-2">
              {input("colorPrimary", t("bo.pro.partners.colorPrimary"), { placeholder: "#02A9FF" })}
              {input("colorAccent", t("bo.pro.partners.colorAccent"), { placeholder: "#FF6A02" })}
              {input("colorDark", t("bo.pro.partners.colorDark"), { placeholder: "#0078E8" })}
            </div>
            {input("seoTitle", t("bo.pro.partners.seoTitle"), { maxLength: 120 })}
            {input("seoDescription", t("bo.pro.partners.seoDescription"), { maxLength: 300 })}
            {input("senderName", t("bo.pro.partners.senderName"))}
            {input("senderEmail", t("bo.pro.partners.senderEmail"), { type: "email" })}
            {input("replyTo", t("bo.pro.partners.replyTo"), { type: "email" })}
            {input("whatsappNumber", t("bo.pro.partners.whatsappNumber"))}
            <label className="text-sm space-y-1 md:col-span-2">
              <span className="text-slate-600">{t("bo.pro.partners.footer")}</span>
              <textarea
                className={`${field} min-h-[60px]`}
                value={editing.form.footerText}
                onChange={(e) => set("footerText", e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={editing.form.poweredByWeefly}
                onChange={(e) => set("poweredByWeefly", e.target.checked)}
              />
              {t("bo.pro.partners.poweredBy")}
            </label>
          </fieldset>

          {!editing.id && (
            <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <legend className="text-sm font-semibold text-slate-900 mb-2">
                {t("bo.pro.partners.firstAdmin")}
              </legend>
              {input("firstAdminName", t("bo.pro.common.name"))}
              {input("firstAdminEmail", t("bo.pro.common.email"), { type: "email" })}
            </fieldset>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {editing.id ? t("bo.pro.common.save") : t("bo.pro.partners.createAndInvite")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              {t("bo.pro.common.cancel")}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">{t("bo.pro.common.partner")}</th>
              <th className="px-4 py-3 font-semibold">{t("bo.pro.partners.colSales")}</th>
              <th className="px-4 py-3 font-semibold">{t("bo.pro.partners.colAccounts")}</th>
              <th className="px-4 py-3 font-semibold">{t("bo.pro.common.state")}</th>
              <th className="px-4 py-3 font-semibold text-right">{t("bo.pro.common.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {partners.map((p) => (
              <tr key={p.id} className={p.status === "active" ? "align-top" : "align-top bg-slate-50 text-slate-500"}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">
                    {p.commercialName}
                    {p.isOperator && <span className="ml-2 text-xs text-slate-500">{t("bo.pro.common.operatorTag")}</span>}
                  </p>
                  <p className="text-xs font-mono text-slate-500">{p.slug}</p>
                </td>
                <td className="px-4 py-3">
                  {p.sellEnabled
                    ? `${p.sellMode === "white_label" ? t("bo.pro.partners.whiteLabel") : t("bo.pro.partners.reseller")} · ${p.channels.join(", ") || "—"}`
                    : t("bo.pro.partners.notSelling")}
                </td>
                <td className="px-4 py-3">
                  {t("bo.pro.partners.activeCount", { count: p.activeUsers })}
                  {p.users > p.activeUsers ? t("bo.pro.partners.suspendedCount", { count: p.users - p.activeUsers }) : ""}
                </td>
                <td className="px-4 py-3">
                  {p.status === "active" ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      {t("bo.pro.partners.active")}
                    </span>
                  ) : (
                    <div>
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                        {t("bo.pro.partners.suspended")}
                      </span>
                      {p.suspendReason && <p className="mt-1 text-xs">{p.suspendReason}</p>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        setMessage(null)
                        setEditing({ id: p.id, form: fromRow(p), slugTouched: true })
                      }}
                    >
                      {t("bo.pro.common.edit")}
                    </Button>
                    {!p.isOperator &&
                      (p.status === "active" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={pending}
                          onClick={() => setSuspending({ id: p.id, reason: "" })}
                        >
                          {t("bo.pro.common.suspend")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            if (window.confirm(t("bo.pro.common.reactivateConfirm", { name: p.commercialName }))) {
                              run(() => setPartnerStatus({ id: p.id, status: "active" }))
                            }
                          }}
                        >
                          {t("bo.pro.common.reactivate")}
                        </Button>
                      ))}
                  </div>
                  {suspending?.id === p.id && (
                    <div className="mt-3 space-y-2 rounded-xl bg-red-50 p-3">
                      <textarea
                        className={`${field} min-h-[70px]`}
                        placeholder={t("bo.pro.common.reasonPlaceholder")}
                        value={suspending.reason}
                        onChange={(e) => setSuspending({ ...suspending, reason: e.target.value })}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={pending}
                          onClick={() => {
                            if (
                              !window.confirm(t("bo.pro.partners.suspendConfirm", { name: p.commercialName }))
                            )
                              return
                            run(
                              () =>
                                setPartnerStatus({ id: p.id, status: "suspended", reason: suspending.reason }),
                              () => setSuspending(null)
                            )
                          }}
                        >
                          {t("bo.pro.common.confirmSuspension")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setSuspending(null)}>
                          {t("bo.pro.common.cancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
