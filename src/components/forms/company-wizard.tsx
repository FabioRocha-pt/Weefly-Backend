"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Car, Home, Flag, Check, Building2, AlertCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Stepper } from "@/components/onboarding/stepper"
import { companyDataSchema, type CompanyDataFormData } from "@/lib/validations"
import { COUNTRIES } from "@/types"
import { createCompany } from "@/actions/company"

type CompanyTypeId = "rental" | "housing" | "tourism"

interface CompanyTypeOption {
  id: CompanyTypeId
  title: string
  description: string
  tag: string
  icon: React.ReactNode
  iconWrapper: string
}

const COMPANY_TYPES: CompanyTypeOption[] = [
  {
    id: "rental",
    title: "Aluguer de carros",
    description: "Frota própria com preços por dia, locais de entrega e devolução.",
    tag: "Rent-a-car · condutor opcional",
    icon: <Car className="w-6 h-6 text-orange-600" />,
    iconWrapper: "bg-orange-100",
  },
  {
    id: "housing",
    title: "Aluguer de casas",
    description: "Casas e quartos com preço por noite, calendário e regras.",
    tag: "Moradias · apartamentos · quartos",
    icon: <Home className="w-6 h-6 text-sky-600" />,
    iconWrapper: "bg-sky-100",
  },
  {
    id: "tourism",
    title: "Excursões & experiências",
    description: "Passeios, atividades e experiências com horários e lotação.",
    tag: "Tours · passeios · experiências",
    icon: <Flag className="w-6 h-6 text-amber-600" />,
    iconWrapper: "bg-amber-100",
  },
]

const TYPE_LABELS: Record<CompanyTypeId, string> = {
  rental: "Aluguer de carros",
  housing: "Aluguer de casas",
  tourism: "Excursões & experiências",
}

export function CompanyWizard() {
  const router = useRouter()
  const [step, setStep] = useState<2 | 3>(2)
  const [selectedType, setSelectedType] = useState<CompanyTypeId>("rental")
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<CompanyDataFormData>({
    resolver: zodResolver(companyDataSchema),
    defaultValues: {
      legalName: "",
      commercialName: "",
      nif: "",
      country: "CV",
      city: "",
      address: "",
      email: "",
      phone: "",
      bankName: "",
      iban: "",
    },
  })

  // On valid input, hand the data to the server action, which inserts the
  // company (RLS-scoped to this user) and redirects to /empresa/dashboard.
  const onSubmit = async (data: CompanyDataFormData) => {
    setServerError(null)

    const formData = new FormData()
    formData.set("type", selectedType)
    formData.set("legalName", data.legalName)
    formData.set("commercialName", data.commercialName)
    formData.set("nif", data.nif)
    formData.set("country", data.country)
    formData.set("city", data.city)
    formData.set("address", data.address)
    formData.set("email", data.email)
    formData.set("phone", data.phone)
    formData.set("bankName", data.bankName)
    formData.set("iban", data.iban)

    const result = await createCompany(formData)
    if (result?.error) {
      setServerError(result.error)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-10">
        <Stepper currentStep={step} />
      </div>

      {step === 2 && (
        <TypeStep
          selectedType={selectedType}
          onSelect={setSelectedType}
          onBack={() => router.push("/inicio")}
          onContinue={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <DataStep
          form={form}
          selectedTypeLabel={TYPE_LABELS[selectedType]}
          serverError={serverError}
          onBack={() => setStep(2)}
          onSubmit={onSubmit}
        />
      )}
    </div>
  )
}

function TypeStep({
  selectedType,
  onSelect,
  onBack,
  onContinue,
}: {
  selectedType: CompanyTypeId
  onSelect: (id: CompanyTypeId) => void
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <div className="text-center animate-fade-in">
      <h1 className="text-3xl font-bold text-slate-900 mb-3">O que faz esta empresa?</h1>
      <p className="text-slate-500 max-w-2xl mx-auto mb-10">
        Cada empresa tem um único tipo. Se faz mais do que um, criará uma empresa para cada — com
        dados e reputação próprios.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {COMPANY_TYPES.map((type) => {
          const isSelected = selectedType === type.id
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onSelect(type.id)}
              className={cn(
                "relative text-left p-6 rounded-2xl border-2 bg-white transition-all duration-200 hover:shadow-md",
                isSelected
                  ? "border-orange-500 ring-2 ring-orange-100"
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              {isSelected && (
                <span className="absolute top-4 right-4 w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </span>
              )}

              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-16", type.iconWrapper)}>
                {type.icon}
              </div>

              <h3 className="text-lg font-bold text-slate-900 mb-2">{type.title}</h3>
              <p className="text-sm text-slate-500 mb-4">{type.description}</p>
              <div className="pt-4 border-t border-slate-100">
                <span
                  className={cn(
                    "text-sm font-medium",
                    isSelected ? "text-orange-600" : "text-slate-400"
                  )}
                >
                  {type.tag}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <p className="text-sm text-slate-500 max-w-2xl mx-auto mb-8">
        Quer atuar como agente (reservar para terceiros)? Não precisa de escolher aqui — todos os
        utilizadores têm a área de agente incluída.
      </p>

      <div className="flex items-center justify-center gap-4">
        <Button type="button" variant="outline" size="lg" onClick={onBack}>
          Voltar
        </Button>
        <Button type="button" size="lg" onClick={onContinue}>
          Continuar
        </Button>
      </div>
    </div>
  )
}

function DataStep({
  form,
  selectedTypeLabel,
  serverError,
  onBack,
  onSubmit,
}: {
  form: UseFormReturn<CompanyDataFormData>
  selectedTypeLabel: string
  serverError: string | null
  onBack: () => void
  onSubmit: (data: CompanyDataFormData) => void
}) {
  const { register, handleSubmit, formState } = form

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Dados da empresa</h1>
        <p className="text-slate-500">
          Preencha os dados fiscais e de contacto. A empresa fica ativa de imediato.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6"
      >
        {/* Company type (locked from step 2) */}
        <div className="space-y-2">
          <Label>Tipo de empresa</Label>
          <div className="flex items-center gap-2 h-11 px-4 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">
            <Building2 className="w-4 h-4 text-orange-600" />
            {selectedTypeLabel}
          </div>
        </div>

        {/* Legal + commercial name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome legal" error={formState.errors.legalName?.message}>
            <Input placeholder="Ex.: Ivandro Comércio, Lda." {...register("legalName")} />
          </Field>
          <Field label="Nome comercial" error={formState.errors.commercialName?.message}>
            <Input placeholder="Ex.: Rent-a-Car Praia" {...register("commercialName")} />
          </Field>
        </div>

        {/* NIF + country */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="NIF" error={formState.errors.nif?.message}>
            <Input placeholder="Número de identificação fiscal" {...register("nif")} />
          </Field>
          <Field label="País" error={formState.errors.country?.message}>
            <select
              className="flex h-11 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 transition-all duration-200"
              {...register("country")}
            >
              {COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* City + address */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Cidade" error={formState.errors.city?.message}>
            <Input placeholder="Ex.: Praia" {...register("city")} />
          </Field>
          <Field label="Morada" error={formState.errors.address?.message}>
            <Input placeholder="Rua, número, zona" {...register("address")} />
          </Field>
        </div>

        {/* Email + phone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Email da empresa" error={formState.errors.email?.message}>
            <Input type="email" placeholder="geral@empresa.cv" {...register("email")} />
          </Field>
          <Field label="Telefone" error={formState.errors.phone?.message}>
            <Input type="tel" placeholder="+238 999 99 99" {...register("phone")} />
          </Field>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-900 mb-4">Dados bancários</p>
          {/* Bank + IBAN */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Banco" error={formState.errors.bankName?.message}>
              <Input placeholder="Ex.: Banco Comercial do Atlântico" {...register("bankName")} />
            </Field>
            <Field label="IBAN" error={formState.errors.iban?.message}>
              <Input placeholder="CV00 0000 0000 0000 0000 0000 0" {...register("iban")} />
            </Field>
          </div>
        </div>

        {serverError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-4">
          <Button type="button" variant="outline" size="lg" onClick={onBack}>
            Voltar
          </Button>
          <Button type="submit" size="lg" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "A criar empresa..." : "Criar empresa"}
          </Button>
        </div>
      </form>
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
