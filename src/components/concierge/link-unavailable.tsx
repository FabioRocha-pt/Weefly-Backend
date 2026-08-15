"use client"

import { Clock, Lock, SearchX, AlertTriangle } from "lucide-react"

import { useT } from "@/i18n/provider"

type Reason = "not_found" | "locked" | "expired" | "unavailable"

const ICONS: Record<Reason, typeof Lock> = {
  not_found: SearchX,
  locked: Lock,
  expired: Clock,
  unavailable: AlertTriangle,
}

/** Distinct messages per failure: "not yet open" and "doesn't exist" are very
 *  different things to a client staring at a link you sent them. */
export function LinkUnavailable({ reason }: { reason: Reason }) {
  const t = useT()
  const Icon = ICONS[reason]

  // As chaves seguem o nome do motivo: not_found → notFoundTitle/notFoundBody.
  const key = reason
    .split("_")
    .map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join("")

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-7 w-7 text-slate-400" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">
        {t(`linkUnavailable.${key}Title`)}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">
        {t(`linkUnavailable.${key}Body`)}
      </p>
      <p className="mt-6 text-sm text-slate-400">
        <a
          href={`mailto:${t("common.supportEmail")}`}
          className="font-semibold text-orange-600 hover:text-orange-700"
        >
          {t("common.supportEmail")}
        </a>
      </p>
    </div>
  )
}
