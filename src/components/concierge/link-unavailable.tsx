import { Clock, Lock, SearchX, AlertTriangle } from "lucide-react"

type Reason = "not_found" | "locked" | "expired" | "unavailable"

const CONTENT: Record<
  Reason,
  { icon: typeof Lock; title: string; body: string }
> = {
  not_found: {
    icon: SearchX,
    title: "Link não encontrado",
    body: "Este link não existe ou já não está disponível. Confirme que copiou o endereço completo, ou fale com a nossa equipa.",
  },
  locked: {
    icon: Lock,
    title: "Ainda não disponível",
    body: "Esta etapa ainda não foi aberta pela nossa equipa. Assim que estiver pronta, receberá indicação para voltar aqui.",
  },
  expired: {
    icon: Clock,
    title: "Link expirado",
    body: "Este link já não está ativo. Contacte a nossa equipa para receber um novo.",
  },
  unavailable: {
    icon: AlertTriangle,
    title: "Serviço indisponível",
    body: "Não conseguimos abrir esta página neste momento. Tente novamente dentro de instantes.",
  },
}

/** Distinct messages per failure: "not yet open" and "doesn't exist" are very
 *  different things to a client staring at a link you sent them. */
export function LinkUnavailable({ reason }: { reason: Reason }) {
  const { icon: Icon, title, body } = CONTENT[reason]
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-7 w-7 text-slate-400" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">{body}</p>
      <p className="mt-6 text-sm text-slate-400">
        <a
          href="mailto:info@weefly.africa"
          className="font-semibold text-orange-600 hover:text-orange-700"
        >
          info@weefly.africa
        </a>
      </p>
    </div>
  )
}
