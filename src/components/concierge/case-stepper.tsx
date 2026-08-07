import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

const STEPS = [
  "Pedido enviado",
  "Pesquisa concluída",
  "Escolher voo",
  "Dados dos passageiros",
  "Pagamento",
  "Bilhete emitido",
]

/**
 * A régua de progresso do mockup C3/C4.
 *
 * Seis passos e não os três links do back-office: o cliente não faz ideia do
 * que é um "link 2", mas sabe perfeitamente em que ponto da compra está. Os
 * dois primeiros passos aparecem sempre concluídos porque, para o cliente
 * chegar aqui, o pedido chegou e alguém já pesquisou.
 */
export function CaseStepper({ current }: { current: number }) {
  return (
    <nav aria-label="Progresso do pedido" className="mb-8 overflow-x-auto">
      <ol className="flex min-w-max items-center gap-2">
        {STEPS.map((label, i) => {
          const step = i + 1
          const done = step < current
          const now = step === current
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold",
                  done && "text-slate-500",
                  now && "text-slate-900",
                  !done && !now && "text-slate-400"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                    done && "bg-green-100 text-green-600",
                    now && "bg-orange-600 text-white",
                    !done && !now && "bg-slate-100 text-slate-400"
                  )}
                  aria-hidden
                >
                  {done ? <Check className="h-3 w-3" /> : step}
                </span>
                {label}
              </span>
              {step < STEPS.length && (
                <span className="h-px w-6 shrink-0 bg-slate-200" aria-hidden />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
