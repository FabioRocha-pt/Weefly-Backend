import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step {
  id: number
  label: string
}

const STEPS: Step[] = [
  { id: 1, label: "Conta" },
  { id: 2, label: "Tipo de empresa" },
  { id: 3, label: "Dados da empresa" },
]

export function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center">
      {STEPS.map((step, index) => {
        const isCompleted = step.id < currentStep
        const isActive = step.id === currentStep

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                  isCompleted && "bg-slate-900 text-white",
                  isActive && "bg-orange-600 text-white",
                  !isCompleted && !isActive && "bg-slate-200 text-slate-400"
                )}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : step.id}
              </div>
              <span
                className={cn(
                  "mt-2 text-sm font-medium whitespace-nowrap",
                  isActive ? "text-slate-900" : "text-slate-400"
                )}
              >
                {step.label}
              </span>
            </div>

            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-16 sm:w-24 h-0.5 mx-2 mb-6 transition-colors",
                  step.id < currentStep ? "bg-slate-900" : "bg-slate-200"
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
