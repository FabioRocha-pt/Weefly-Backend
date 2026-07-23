"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Plane,
  MapPin,
  CalendarDays,
  Users,
  ArrowRight,
  ArrowLeft,
  Check,
  Minus,
  Plus,
  Loader2,
  Mail,
  Phone,
  User,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  travelRequestSchema,
  type TravelRequestFormData,
} from "@/lib/validations"
import {
  TRIP_TYPES,
  CABIN_CLASSES,
  PASSENGER_TITLES,
  PHONE_PREFIXES,
} from "@/types"

const STEPS = [
  { id: 0, label: "Viagem", icon: Plane },
  { id: 1, label: "Passageiros & classe", icon: Users },
  { id: 2, label: "Dados pessoais", icon: User },
] as const

/** Fields validated before advancing out of each step. */
const STEP_FIELDS: (keyof TravelRequestFormData)[][] = [
  ["tripType", "origin", "destination", "departDate", "returnDate"],
  ["adults", "children", "infants", "cabinClass"],
  ["title", "fullName", "email", "phonePrefix", "phone", "consent"],
]

const today = new Date().toISOString().split("T")[0]

export function TravelRequestForm() {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<TravelRequestFormData>({
    resolver: zodResolver(travelRequestSchema),
    mode: "onTouched",
    defaultValues: {
      tripType: "round_trip",
      origin: "",
      destination: "",
      departDate: "",
      returnDate: "",
      adults: 1,
      children: 0,
      infants: 0,
      cabinClass: "economy",
      fullName: "",
      email: "",
      phonePrefix: "+238",
      phone: "",
      consent: false,
    },
  })

  const { register, handleSubmit, watch, setValue, formState, trigger } = form
  const { errors } = formState

  const tripType = watch("tripType")
  const departDate = watch("departDate")

  async function goNext() {
    const valid = await trigger(STEP_FIELDS[step], { shouldFocus: true })
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0))
  }

  const onSubmit = async (data: TravelRequestFormData) => {
    setSubmitting(true)
    setServerError(null)
    try {
      const res = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? "Não foi possível enviar o pedido.")
      }
      setSuccess(true)
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Ocorreu um erro inesperado."
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return <SuccessScreen name={watch("fullName")} email={watch("email")} />
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <StepperBar current={step} />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8"
      >
        {/* ---------- Step 1: Trip ---------- */}
        {step === 0 && (
          <div className="space-y-6 animate-fade-in">
            <StepHeading
              title="A sua viagem"
              subtitle="Conte-nos para onde quer voar e quando."
            />

            <Field label="Tipo de viagem" error={errors.tripType?.message}>
              <Segmented
                options={TRIP_TYPES}
                value={tripType}
                onChange={(v) =>
                  setValue("tripType", v, { shouldValidate: true })
                }
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Origem" error={errors.origin?.message}>
                <InputWithIcon icon={MapPin}>
                  <Input
                    className="pl-10"
                    placeholder="Ex.: Praia (RAI)"
                    {...register("origin")}
                  />
                </InputWithIcon>
              </Field>
              <Field label="Destino" error={errors.destination?.message}>
                <InputWithIcon icon={MapPin}>
                  <Input
                    className="pl-10"
                    placeholder="Ex.: Lisboa (LIS)"
                    {...register("destination")}
                  />
                </InputWithIcon>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Data de partida" error={errors.departDate?.message}>
                <InputWithIcon icon={CalendarDays}>
                  <Input
                    type="date"
                    className="pl-10"
                    min={today}
                    {...register("departDate")}
                  />
                </InputWithIcon>
              </Field>
              {tripType === "round_trip" && (
                <Field
                  label="Data de regresso"
                  error={errors.returnDate?.message}
                >
                  <InputWithIcon icon={CalendarDays}>
                    <Input
                      type="date"
                      className="pl-10"
                      min={departDate || today}
                      {...register("returnDate")}
                    />
                  </InputWithIcon>
                </Field>
              )}
            </div>
          </div>
        )}

        {/* ---------- Step 2: Passengers & class ---------- */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <StepHeading
              title="Passageiros & classe"
              subtitle="Quem viaja e em que conforto."
            />

            <div className="space-y-3">
              <Counter
                label="Adultos"
                hint="12+ anos"
                value={watch("adults")}
                min={1}
                onChange={(n) => setValue("adults", n, { shouldValidate: true })}
              />
              <Counter
                label="Crianças"
                hint="2–11 anos"
                value={watch("children")}
                min={0}
                onChange={(n) =>
                  setValue("children", n, { shouldValidate: true })
                }
              />
              <Counter
                label="Bebés"
                hint="0–2 anos, ao colo"
                value={watch("infants")}
                min={0}
                onChange={(n) =>
                  setValue("infants", n, { shouldValidate: true })
                }
              />
              {errors.infants?.message && (
                <p className="text-sm text-red-500">{errors.infants.message}</p>
              )}
            </div>

            <Field label="Classe" error={errors.cabinClass?.message}>
              <Segmented
                options={CABIN_CLASSES}
                value={watch("cabinClass")}
                onChange={(v) =>
                  setValue("cabinClass", v, { shouldValidate: true })
                }
              />
            </Field>
          </div>
        )}

        {/* ---------- Step 3: Personal data ---------- */}
        {step === 2 && (
          <div className="space-y-6 animate-fade-in">
            <StepHeading
              title="Os seus dados"
              subtitle="Para a nossa equipa de Concierge o contactar."
            />

            <Field label="Título" error={errors.title?.message}>
              <Segmented
                options={PASSENGER_TITLES}
                value={watch("title")}
                onChange={(v) => setValue("title", v, { shouldValidate: true })}
              />
            </Field>

            <Field
              label="Nome completo (como no passaporte)"
              error={errors.fullName?.message}
            >
              <InputWithIcon icon={User}>
                <Input
                  className="pl-10"
                  placeholder="Ex.: Ivandro Tavares Silva"
                  {...register("fullName")}
                />
              </InputWithIcon>
            </Field>

            <Field label="Email" error={errors.email?.message}>
              <InputWithIcon icon={Mail}>
                <Input
                  type="email"
                  className="pl-10"
                  placeholder="nome@email.com"
                  {...register("email")}
                />
              </InputWithIcon>
            </Field>

            <Field label="Telefone" error={errors.phone?.message}>
              <div className="flex gap-2">
                <select
                  className="flex h-11 w-32 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 transition-all"
                  {...register("phonePrefix")}
                >
                  {PHONE_PREFIXES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.value}
                    </option>
                  ))}
                </select>
                <InputWithIcon icon={Phone} className="flex-1">
                  <Input
                    type="tel"
                    className="pl-10"
                    placeholder="999 99 99"
                    {...register("phone")}
                  />
                </InputWithIcon>
              </div>
            </Field>

            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 cursor-pointer">
              <Checkbox
                checked={watch("consent")}
                onCheckedChange={(c) =>
                  setValue("consent", c === true, { shouldValidate: true })
                }
                className="mt-0.5"
              />
              <span className="text-sm text-slate-600">
                Autorizo a WeeFly a contactar-me e a tratar os meus dados para
                efeitos deste pedido de viagem, nos termos da política de
                privacidade.
              </span>
            </label>
            {errors.consent?.message && (
              <p className="-mt-3 text-sm text-red-500">
                {errors.consent.message}
              </p>
            )}
          </div>
        )}

        {serverError && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {/* ---------- Footer ---------- */}
        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={goBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Anterior
            </Button>
          ) : (
            <span />
          )}

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext}>
              Continuar
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  A enviar…
                </>
              ) : (
                "Enviar pedido"
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                       */
/* ------------------------------------------------------------------ */

function StepperBar({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center justify-center">
      {STEPS.map((s, i) => {
        const isDone = s.id < current
        const isActive = s.id === current
        return (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                  isDone && "bg-orange-600 text-white",
                  isActive && "bg-orange-600 text-white ring-4 ring-orange-100",
                  !isDone && !isActive && "bg-slate-200 text-slate-400"
                )}
              >
                {isDone ? <Check className="w-5 h-5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "mt-2 text-xs font-medium whitespace-nowrap hidden sm:block",
                  isActive ? "text-slate-900" : "text-slate-400"
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-10 sm:w-20 h-0.5 mx-2 mb-6 transition-colors",
                  s.id < current ? "bg-orange-600" : "bg-slate-200"
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepHeading({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

function InputWithIcon({
  icon: Icon,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("relative", className)}>
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      {children}
    </div>
  )
}

/** Generic segmented control for small option sets (enum pickers). */
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[]
  value: T | undefined
  onChange: (value: T) => void
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {options.map((opt) => {
        const isSelected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all",
              isSelected
                ? "border-orange-500 bg-orange-50 text-orange-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function Counter({
  label,
  hint,
  value,
  min,
  onChange,
}: {
  label: string
  hint: string
  value: number
  min: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-400">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Menos ${label}`}
          className="w-9 h-9 rounded-full border border-slate-300 flex items-center justify-center text-slate-600 hover:border-orange-500 hover:text-orange-600 disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:text-slate-600 transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="w-6 text-center text-sm font-semibold text-slate-900 tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(9, value + 1))}
          disabled={value >= 9}
          aria-label={`Mais ${label}`}
          className="w-9 h-9 rounded-full border border-slate-300 flex items-center justify-center text-slate-600 hover:border-orange-500 hover:text-orange-600 disabled:opacity-40 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function SuccessScreen({ name, email }: { name: string; email: string }) {
  const firstName = name.trim().split(" ")[0] || ""
  return (
    <div className="w-full max-w-lg mx-auto text-center animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-10">
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3">
          Pedido recebido{firstName ? `, ${firstName}` : ""}!
        </h2>
        <p className="text-slate-500 leading-relaxed">
          A nossa equipa de Concierge está a preparar as melhores opções e
          tarifas de voos para si e irá retornar o contacto brevemente.
        </p>
        {email && (
          <p className="mt-4 text-sm text-slate-400">
            Enviámos uma confirmação para <strong>{email}</strong>.
          </p>
        )}
      </div>
    </div>
  )
}
