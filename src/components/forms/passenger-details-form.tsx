"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  User,
  BookUser,
  CalendarDays,
  Globe,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  passengerDetailsSchema,
  type PassengerDetailsFormData,
} from "@/lib/validations"
import { useT } from "@/i18n/provider"
import { translateMessage } from "@/i18n/translate"

export type PassengerSlot = {
  position: number
  passengerType: "adult" | "child" | "infant"
}

const GENDERS = ["m", "f", "x"] as const

const todayStr = new Date().toISOString().split("T")[0]

/**
 * Link 2 — passport details for every passenger on the trip.
 *
 * The slots come from the counts captured in Link 1, so the client fills in
 * exactly the number of people they said were travelling.
 */
export function PassengerDetailsForm({
  token,
  slots,
}: {
  token: string
  slots: PassengerSlot[]
}) {
  const t = useT()
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState, setValue, watch } =
    useForm<PassengerDetailsFormData>({
      resolver: zodResolver(passengerDetailsSchema),
      mode: "onTouched",
      defaultValues: {
        passengers: slots.map((s) => ({
          passengerType: s.passengerType,
          firstName: "",
          lastName: "",
          birthDate: "",
          nationality: "",
          passportNumber: "",
          passportExpiry: "",
        })),
      },
    })

  const errors = formState.errors

  const onSubmit = async (data: PassengerDetailsFormData) => {
    setSubmitting(true)
    setServerError(null)
    try {
      const res = await fetch(`/api/cases/${token}/passageiros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? "errors.detailsNotSent")
      }
      setSuccess(true)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "errors.unexpected")
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="h-9 w-9 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">
          {t("passengerForm.successTitle")}
        </h2>
        <p className="mt-3 leading-relaxed text-slate-500">
          {t("passengerForm.successBody")}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {slots.map((slot, index) => (
        <div
          key={slot.position}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-sm font-bold text-white">
              {index + 1}
            </span>
            <div>
              <h2 className="font-bold text-slate-900">
                {t("passengerForm.heading", {
                  type: t(`passengerTypes.${slot.passengerType}`),
                  index: index + 1,
                })}
              </h2>
              <p className="text-xs text-slate-400">
                {t("passengerForm.subheading", {
                  hint: t(`passengerHints.${slot.passengerType}`),
                })}
              </p>
            </div>
          </div>

          <input
            type="hidden"
            {...register(`passengers.${index}.passengerType`)}
          />

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={t("passengerForm.firstName")}
                error={translateMessage(
                  t,
                  errors.passengers?.[index]?.firstName?.message
                )}
              >
                <WithIcon icon={User}>
                  <Input
                    className="pl-10"
                    placeholder={t("passengerForm.firstNamePlaceholder")}
                    {...register(`passengers.${index}.firstName`)}
                  />
                </WithIcon>
              </Field>
              <Field
                label={t("passengerForm.lastName")}
                error={translateMessage(
                  t,
                  errors.passengers?.[index]?.lastName?.message
                )}
              >
                <WithIcon icon={User}>
                  <Input
                    className="pl-10"
                    placeholder={t("passengerForm.lastNamePlaceholder")}
                    {...register(`passengers.${index}.lastName`)}
                  />
                </WithIcon>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={t("passengerForm.gender")}
                error={translateMessage(
                  t,
                  errors.passengers?.[index]?.gender?.message
                )}
              >
                <div className="grid grid-cols-3 gap-2">
                  {GENDERS.map((g) => {
                    const selected = watch(`passengers.${index}.gender`) === g
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() =>
                          setValue(`passengers.${index}.gender`, g, {
                            shouldValidate: true,
                          })
                        }
                        className={cn(
                          "rounded-lg border-2 px-2 py-2.5 text-xs font-medium transition-all",
                          selected
                            ? "border-orange-500 bg-orange-50 text-orange-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {t(`genders.${g}`)}
                      </button>
                    )
                  })}
                </div>
              </Field>
              <Field
                label={t("passengerForm.birthDate")}
                error={translateMessage(
                  t,
                  errors.passengers?.[index]?.birthDate?.message
                )}
              >
                <WithIcon icon={CalendarDays}>
                  <Input
                    type="date"
                    max={todayStr}
                    className="pl-10"
                    {...register(`passengers.${index}.birthDate`)}
                  />
                </WithIcon>
              </Field>
            </div>

            <Field
              label={t("passengerForm.nationality")}
              error={translateMessage(
                t,
                errors.passengers?.[index]?.nationality?.message
              )}
            >
              <WithIcon icon={Globe}>
                <Input
                  className="pl-10"
                  placeholder={t("passengerForm.nationalityPlaceholder")}
                  {...register(`passengers.${index}.nationality`)}
                />
              </WithIcon>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={t("passengerForm.passportNumber")}
                error={translateMessage(
                  t,
                  errors.passengers?.[index]?.passportNumber?.message
                )}
              >
                <WithIcon icon={BookUser}>
                  <Input
                    className="pl-10 uppercase"
                    placeholder={t("passengerForm.passportPlaceholder")}
                    {...register(`passengers.${index}.passportNumber`)}
                  />
                </WithIcon>
              </Field>
              <Field
                label={t("passengerForm.passportExpiry")}
                error={translateMessage(
                  t,
                  errors.passengers?.[index]?.passportExpiry?.message
                )}
              >
                <WithIcon icon={CalendarDays}>
                  <Input
                    type="date"
                    min={todayStr}
                    className="pl-10"
                    {...register(`passengers.${index}.passportExpiry`)}
                  />
                </WithIcon>
              </Field>
            </div>
          </div>
        </div>
      ))}

      {serverError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{translateMessage(t, serverError)}</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("passengerForm.submitting")}
            </>
          ) : (
            t("passengerForm.submit")
          )}
        </Button>
      </div>
    </form>
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

function WithIcon({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      {children}
    </div>
  )
}
