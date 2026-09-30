"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { createPartner, setPartnerStatus, updatePartner } from "@/actions/partners"
import { partnerHostPreview } from "@/lib/site-url"

/**
 * WeeFly · ADM-01 · Parceiros: criar, configurar a marca (TEN-02), suspender.
 *
 * Os valores da marca que ainda não chegaram (⚠ Dados a receber) ficam vazios:
 * o ecrã não inventa nenhum.
 */

type Menu = "flights" | "cars" | "houses" | "experiences" | "food"
const MENUS: { id: Menu; label: string }[] = [
  { id: "flights", label: "Passagens" },
  { id: "cars", label: "Carros" },
  { id: "houses", label: "Casas" },
  { id: "experiences", label: "Experiências" },
  { id: "food", label: "Comida" },
]

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
    agentMenus: p.agentMenus.filter((m): m is Menu => MENUS.some((x) => x.id === m)),
    logoUrl: p.logoUrl ?? "",
    colorPrimary: p.colorPrimary ?? "",
    colorDark: p.colorDark ?? "",
    senderName: p.senderName ?? "",
    senderEmail: p.senderEmail ?? "",
    replyTo: p.replyTo ?? "",
    footerText: p.footerText ?? "",
    poweredByWeefly: p.poweredByWeefly,
    whatsappNumber: p.whatsappNumber ?? "",
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
}

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100"

export function PartnersAdmin({ partners }: { partners: PartnerRowView[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; form: Form; slugTouched: boolean } | null>(null)
  const [suspending, setSuspending] = useState<{ id: string; reason: string } | null>(null)

  const run = (
    action: () => Promise<{ ok: true; notice?: string } | { ok: false; error: string }>,
    after?: () => void
  ) =>
    start(async () => {
      setMessage(null)
      const result = await action()
      setMessage(result.ok ? { ok: true, text: result.notice ?? "Feito." } : { ok: false, text: result.error })
      if (result.ok) {
        after?.()
        router.refresh()
      }
    })

  const save = () => {
    if (!editing) return
    const { form } = editing
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
          Novo parceiro
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
            {editing.id ? `Editar ${editing.form.commercialName}` : "Novo parceiro"}
          </h3>

          <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <legend className="text-sm font-semibold text-slate-900 mb-2">Registo</legend>
            <label className="text-sm space-y-1">
              <span className="text-slate-600">Nome comercial</span>
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
                            slug: cur.id || cur.slugTouched ? cur.form.slug : slugify(name),
                          },
                        }
                      : cur
                  )
                }}
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-slate-600">Endereço (subdomínio)</span>
              <input
                className={`${field} font-mono`}
                value={editing.form.slug}
                disabled={Boolean(editing.id)}
                onChange={(e) => {
                  const slug = e.target.value.toLowerCase()
                  setEditing((cur) => (cur ? { ...cur, slugTouched: true, form: { ...cur.form, slug } } : cur))
                }}
              />
              <span className="text-xs text-slate-500">
                {partnerHostPreview(editing.form.slug) ??
                  `${editing.form.slug || "…"} · subdomínio por configurar (TEN-04)`}
              </span>
            </label>
            {input("legalName", "Nome legal")}
            {input("nif", "NIF")}
            {input("country", "País (ISO, ex.: CV)", { maxLength: 2 })}
            {input("address", "Morada")}
            {input("contactName", "Pessoa de contacto")}
            {input("contactEmail", "Email de contacto", { type: "email" })}
            {input("contactPhone", "Telefone de contacto")}
            {input("contractStart", "Início do contrato", { type: "date" })}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-900">Contas e venda</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.form.supplyEnabled}
                onChange={(e) => set("supplyEnabled", e.target.checked)}
              />
              Menu 1 · Fornecer produtos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.form.sellEnabled}
                onChange={(e) => set("sellEnabled", e.target.checked)}
              />
              Menu 2 · Vender produtos
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6">
              <label className="text-sm space-y-1">
                <span className="text-slate-600">Forma de vender</span>
                <select
                  className={field}
                  value={editing.form.sellMode}
                  onChange={(e) => set("sellMode", e.target.value as Form["sellMode"])}
                >
                  <option value="reseller">Revendedor oficial WeeFly (marca WeeFly)</option>
                  <option value="white_label">White label (marca do parceiro)</option>
                </select>
              </label>
              {editing.form.sellMode === "white_label" && (
                <label className="text-sm space-y-1">
                  <span className="text-slate-600">O link do cliente mostra</span>
                  <select
                    className={field}
                    value={editing.form.customerFront}
                    onChange={(e) => set("customerFront", e.target.value as Form["customerFront"])}
                  >
                    <option value="own">O ecrã do parceiro, com Powered by WeeFly</option>
                    <option value="weefly">O ecrã WeeFly, sem alterações</option>
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
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.form.agentMenus.includes(m.id)}
                    onChange={() => set("agentMenus", toggle(editing.form.agentMenus, m.id))}
                  />
                  {m.label}
                  {m.id !== "flights" && <span className="text-xs text-slate-400">(Brevemente)</span>}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <legend className="text-sm font-semibold text-slate-900 mb-2">Marca (TEN-02)</legend>
            {input("logoUrl", "Logótipo (URL)")}
            <div className="grid grid-cols-2 gap-3">
              {input("colorPrimary", "Cor principal", { placeholder: "#02A9FF" })}
              {input("colorDark", "Cor escura", { placeholder: "#0078E8" })}
            </div>
            {input("senderName", "Nome do remetente")}
            {input("senderEmail", "Endereço do remetente", { type: "email" })}
            {input("replyTo", "Endereço de resposta", { type: "email" })}
            {input("whatsappNumber", "WhatsApp de apoio")}
            <label className="text-sm space-y-1 md:col-span-2">
              <span className="text-slate-600">Rodapé</span>
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
              Mostrar “Powered by WeeFly” (TEN-05)
            </label>
          </fieldset>

          {!editing.id && (
            <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <legend className="text-sm font-semibold text-slate-900 mb-2">
                Primeira conta de administrador (recebe o convite)
              </legend>
              {input("firstAdminName", "Nome")}
              {input("firstAdminEmail", "Email", { type: "email" })}
            </fieldset>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {editing.id ? "Guardar" : "Criar parceiro e enviar convite"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Parceiro</th>
              <th className="px-4 py-3 font-semibold">Venda</th>
              <th className="px-4 py-3 font-semibold">Contas</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold text-right">Acções</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {partners.map((p) => (
              <tr key={p.id} className={p.status === "active" ? "align-top" : "align-top bg-slate-50 text-slate-500"}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">
                    {p.commercialName}
                    {p.isOperator && <span className="ml-2 text-xs text-slate-500">(operador)</span>}
                  </p>
                  <p className="text-xs font-mono text-slate-500">{p.slug}</p>
                </td>
                <td className="px-4 py-3">
                  {p.sellEnabled
                    ? `${p.sellMode === "white_label" ? "White label" : "Revendedor"} · ${p.channels.join(", ") || "—"}`
                    : "Não vende"}
                </td>
                <td className="px-4 py-3">
                  {p.activeUsers} activas{p.users > p.activeUsers ? ` · ${p.users - p.activeUsers} suspensas` : ""}
                </td>
                <td className="px-4 py-3">
                  {p.status === "active" ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      Activo
                    </span>
                  ) : (
                    <div>
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                        Suspenso
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
                      Editar
                    </Button>
                    {!p.isOperator &&
                      (p.status === "active" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={pending}
                          onClick={() => setSuspending({ id: p.id, reason: "" })}
                        >
                          Suspender
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            if (window.confirm(`Reactivar ${p.commercialName}?`)) {
                              run(() => setPartnerStatus({ id: p.id, status: "active" }))
                            }
                          }}
                        >
                          Reactivar
                        </Button>
                      ))}
                  </div>
                  {suspending?.id === p.id && (
                    <div className="mt-3 space-y-2 rounded-xl bg-red-50 p-3">
                      <textarea
                        className={`${field} min-h-[70px]`}
                        placeholder="Motivo (fica no registo)"
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
                              !window.confirm(
                                `Suspender ${p.commercialName}? As contas deixam de entrar e os links deixam de abrir.`
                              )
                            )
                              return
                            run(
                              () =>
                                setPartnerStatus({ id: p.id, status: "suspended", reason: suspending.reason }),
                              () => setSuspending(null)
                            )
                          }}
                        >
                          Confirmar suspensão
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setSuspending(null)}>
                          Cancelar
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
