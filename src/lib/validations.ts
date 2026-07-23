import { z } from "zod"

export const registerSchema = z.object({
  firstName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  lastName: z.string().min(2, "Apelido deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  country: z.string().min(1, "Selecione um país"),
  phone: z.string().min(6, "Número de telefone inválido"),
  password: z.string().min(8, "Password deve ter pelo menos 8 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As passwords não coincidem",
  path: ["confirmPassword"],
})

export type RegisterFormData = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Password é obrigatória"),
  rememberMe: z.boolean().optional(),
})

export type LoginFormData = z.infer<typeof loginSchema>

export const passwordResetSchema = z.object({
  email: z.string().email("Email inválido"),
})

export type PasswordResetFormData = z.infer<typeof passwordResetSchema>

export const newPasswordSchema = z.object({
  password: z.string().min(8, "Password deve ter pelo menos 8 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As passwords não coincidem",
  path: ["confirmPassword"],
})

export type NewPasswordFormData = z.infer<typeof newPasswordSchema>

export const companyTypeSchema = z.object({
  type: z.enum(["rental", "housing", "tourism"], {
    required_error: "Selecione um tipo de empresa",
  }),
})

export type CompanyTypeFormData = z.infer<typeof companyTypeSchema>

export const companyDataSchema = z.object({
  legalName: z.string().min(2, "Nome legal é obrigatório"),
  commercialName: z.string().min(2, "Nome comercial é obrigatório"),
  nif: z.string().min(5, "NIF inválido"),
  country: z.string().min(1, "Selecione um país"),
  city: z.string().min(2, "Cidade é obrigatória"),
  address: z.string().min(5, "Morada é obrigatória"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(6, "Telefone inválido"),
  bankName: z.string().min(2, "Nome do banco é obrigatório"),
  iban: z.string().min(15, "IBAN inválido"),
})

export type CompanyDataFormData = z.infer<typeof companyDataSchema>

// --- Concierge · Travel Request ---------------------------------------------

/**
 * Client-facing travel request (WeeFly Concierge, module M3).
 *
 * Mirrors the TripRequest entity from the technical spec: trip type, route,
 * dates, passenger split and cabin class, plus the contact data needed to open
 * a lead. Passenger counts are coerced because they arrive from number inputs
 * as strings. The refinements below encode the cross-field rules the flat
 * per-field checks can't express.
 */
export const travelRequestSchema = z
  .object({
    tripType: z.enum(["round_trip", "one_way", "multi_city"], {
      required_error: "Selecione o tipo de viagem",
    }),
    origin: z.string().min(2, "Indique a origem"),
    destination: z.string().min(2, "Indique o destino"),
    departDate: z.string().min(1, "Indique a data de partida"),
    // Kept optional at field level; the round-trip rule is enforced below.
    returnDate: z.string().optional().or(z.literal("")),
    // Driven by stepper counters that always set real numbers.
    adults: z.number().int().min(1, "Pelo menos 1 adulto").max(9),
    children: z.number().int().min(0).max(9),
    infants: z.number().int().min(0).max(9),
    cabinClass: z.enum(["economy", "business", "first"], {
      required_error: "Selecione a classe",
    }),
    title: z.enum(["mr", "ms"], { required_error: "Selecione o título" }),
    fullName: z.string().min(3, "Indique o nome completo (como no passaporte)"),
    email: z.string().email("Email inválido"),
    phonePrefix: z.string().min(1, "Selecione o indicativo"),
    phone: z.string().min(6, "Número de telefone inválido"),
    // GDPR / Lei nº 133/V/2001: explicit consent captured on the public form.
    consent: z.boolean().refine((v) => v === true, {
      message: "É necessário aceitar para continuar",
    }),
  })
  .refine(
    (d) => d.tripType !== "round_trip" || Boolean(d.returnDate),
    { message: "Indique a data de regresso", path: ["returnDate"] }
  )
  .refine(
    (d) => !d.returnDate || !d.departDate || d.returnDate >= d.departDate,
    { message: "O regresso não pode ser antes da partida", path: ["returnDate"] }
  )
  .refine((d) => d.infants <= d.adults, {
    message: "Cada bebé tem de viajar com um adulto",
    path: ["infants"],
  })

export type TravelRequestFormData = z.infer<typeof travelRequestSchema>

export function getPasswordStrength(password: string): {
  score: number
  label: string
  color: string
} {
  let score = 0

  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++

  if (score <= 2) return { score, label: "Fraca", color: "text-red-500" }
  if (score <= 3) return { score, label: "Boa", color: "text-yellow-500" }
  return { score, label: "Excelente", color: "text-green-500" }
}
