"use client"

/**
 * WeeFly · OCT-13 · SEO-04 · o logótipo, o ícone e a imagem de partilha de um
 * parceiro, com pré-visualização.
 *
 * Cada ficheiro sobe sozinho (`uploadPartnerBrandFile`) e o endereço volta ao
 * formulário. As regras de tamanho e formato verificam-se aqui, para a resposta
 * ser imediata, e outra vez no servidor, que é quem decide.
 *
 * A pré-visualização mostra o que a empresa vai ver: o separador do browser
 * (ícone e título) e a mensagem do WhatsApp (imagem, título, descrição e
 * endereço).
 */

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Upload } from "lucide-react"

import { uploadPartnerBrandFile, type BrandUploadKind } from "@/actions/partners"
import { partnerHostPreview } from "@/lib/site-url"
import { useT } from "@/i18n/provider"

const ACCEPT: Record<BrandUploadKind, string> = {
  logo: "image/png,image/svg+xml",
  icon: "image/png,image/svg+xml",
  share: "image/jpeg,image/png",
}

const MAX: Record<BrandUploadKind, number> = {
  logo: 2 * 1024 * 1024,
  icon: 2 * 1024 * 1024,
  share: 1024 * 1024,
}

export interface BrandUrls {
  logoUrl: string
  iconUrl: string
  ogImageUrl: string
}

export function BrandUploads({
  partnerId,
  slug,
  name,
  title,
  description,
  urls,
  onUploaded,
}: {
  /** Nulo num parceiro novo: carrega-se depois de o criar. */
  partnerId: string | null
  slug: string
  name: string
  title: string
  description: string
  urls: BrandUrls
  onUploaded: (kind: BrandUploadKind, url: string) => void
}) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<BrandUploadKind | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const inputs = {
    logo: useRef<HTMLInputElement>(null),
    icon: useRef<HTMLInputElement>(null),
    share: useRef<HTMLInputElement>(null),
  }

  if (!partnerId) {
    return <p className="text-sm text-slate-500 md:col-span-2">{t("bo.pro.partners.uploadAfterCreate")}</p>
  }

  const upload = (kind: BrandUploadKind, file: File | undefined) => {
    if (!file) return
    setNote(null)
    if (!ACCEPT[kind].split(",").includes(file.type)) {
      setNote({ ok: false, text: t(`bo.actions.partners.upload.type.${kind}`) })
      return
    }
    if (file.size > MAX[kind]) {
      setNote({ ok: false, text: t(`bo.actions.partners.upload.tooBig.${kind}`) })
      return
    }
    const fd = new FormData()
    fd.set("partnerId", partnerId)
    fd.set("kind", kind)
    fd.set("file", file)
    setBusy(kind)
    start(async () => {
      try {
        const r = await uploadPartnerBrandFile(fd)
        if (r.ok) {
          if (r.url) onUploaded(kind, r.url)
          setNote({ ok: true, text: r.notice ?? "" })
          router.refresh()
        } else {
          setNote({ ok: false, text: r.error })
        }
      } catch {
        setNote({ ok: false, text: t("bo.actions.partners.upload.failed") })
      } finally {
        setBusy(null)
        const el = inputs[kind].current
        if (el) el.value = ""
      }
    })
  }

  const slot = (kind: BrandUploadKind, label: string, hint: string, preview: React.ReactNode) => (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => inputs[kind].current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" />
          {busy === kind ? t("bo.pro.partners.uploading") : t("bo.pro.partners.upload")}
        </button>
        <input
          ref={inputs[kind]}
          type="file"
          accept={ACCEPT[kind]}
          className="hidden"
          onChange={(e) => upload(kind, e.target.files?.[0])}
        />
      </div>
      <div className="flex min-h-[64px] items-center justify-center rounded-lg bg-slate-50 p-2">{preview}</div>
    </div>
  )

  const host = partnerHostPreview(slug) ?? `${slug}.weefly.africa`

  return (
    <div className="md:col-span-2 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {slot(
          "logo",
          t("bo.pro.partners.logo"),
          t("bo.pro.partners.logoHint"),
          urls.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls.logoUrl} alt={t("bo.pro.partners.logoAlt", { name })} className="max-h-14 max-w-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400">{t("bo.pro.partners.noFile")}</span>
          )
        )}
        {slot(
          "icon",
          t("bo.pro.partners.icon"),
          t("bo.pro.partners.iconHint"),
          urls.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls.iconUrl} alt={t("bo.pro.partners.iconAlt", { name })} className="h-14 w-14 object-contain" />
          ) : (
            <span className="text-xs text-slate-400">{t("bo.pro.partners.iconDefault")}</span>
          )
        )}
        {slot(
          "share",
          t("bo.pro.partners.share"),
          t("bo.pro.partners.shareHint"),
          urls.ogImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls.ogImageUrl} alt={t("bo.pro.partners.logoAlt", { name })} className="max-h-16 max-w-full rounded object-cover" />
          ) : (
            <span className="text-xs text-slate-400">{t("bo.pro.partners.shareDefault")}</span>
          )
        )}
      </div>

      {note?.text && (
        <p role="status" className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>
          {note.text}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* O separador do browser. */}
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
          <p className="text-xs font-medium text-slate-500 mb-2">{t("bo.pro.partners.previewTab")}</p>
          <div className="flex items-center gap-2 rounded-t-lg bg-white px-3 py-2 shadow-sm max-w-[260px]">
            {urls.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls.iconUrl} alt="" className="h-4 w-4 object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/weefly/favicon-32x32.png" alt="" className="h-4 w-4" />
            )}
            <span className="truncate text-xs text-slate-700">{title || name}</span>
          </div>
        </div>

        {/* A mensagem do WhatsApp. */}
        <div className="rounded-xl border border-slate-200 bg-[#E5DDD5] p-3">
          <p className="text-xs font-medium text-slate-600 mb-2">{t("bo.pro.partners.previewWhatsapp")}</p>
          <div className="ml-auto max-w-[280px] overflow-hidden rounded-lg bg-[#DCF8C6] shadow-sm">
            <div className="m-1 overflow-hidden rounded-md bg-white/70">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urls.ogImageUrl || "/brand/weefly/og-image.jpg"}
                alt=""
                className="aspect-[1200/630] w-full object-cover"
              />
              <div className="px-2 py-1.5">
                <p className="truncate text-xs font-semibold text-slate-900">{title || name}</p>
                <p className="line-clamp-2 text-[11px] text-slate-600">{description}</p>
                <p className="truncate text-[11px] text-slate-500">{host}</p>
              </div>
            </div>
            <p className="px-2 pb-1.5 text-[11px] text-sky-700 underline truncate">https://{host}/pc</p>
          </div>
        </div>
      </div>
    </div>
  )
}
