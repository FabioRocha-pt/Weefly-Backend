import { z } from "zod"

/*
 * As mensagens destes esquemas são chaves de tradução, não frases.
 *
 * Um esquema é importado tanto por um componente de cliente como por uma
 * server action, e nenhum dos dois sabe, no momento em que o módulo é
 * carregado, em que idioma vai ser lido. Guardar aqui a chave e traduzir no
 * sítio onde o erro é desenhado — `t(error.message)` — é o que permite que a
 * mesma regra sirva as três línguas.
 *
 * O tradutor devolve a própria chave quando não a encontra, por isso uma
 * mensagem esquecida aparece como `validation.qualquerCoisa` no ecrã em vez de
 * deitar o formulário abaixo.
 */

export const registerSchema = z.object({
  firstName: z.string().min(2, "validation.nameMin"),
  lastName: z.string().min(2, "validation.lastNameMin"),
  email: z.string().email("validation.emailInvalid"),
  country: z.string().min(1, "validation.countryRequired"),
  phone: z.string().min(6, "validation.phoneInvalid"),
  password: z.string().min(8, "validation.passwordMin"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "validation.passwordsMismatch",
  path: ["confirmPassword"],
})

export type RegisterFormData = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: z.string().email("validation.emailInvalid"),
  password: z.string().min(1, "validation.passwordRequired"),
  rememberMe: z.boolean().optional(),
})

export type LoginFormData = z.infer<typeof loginSchema>

export const passwordResetSchema = z.object({
  email: z.string().email("validation.emailInvalid"),
})

export type PasswordResetFormData = z.infer<typeof passwordResetSchema>

export const newPasswordSchema = z.object({
  password: z.string().min(8, "validation.passwordMin"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "validation.passwordsMismatch",
  path: ["confirmPassword"],
})

export type NewPasswordFormData = z.infer<typeof newPasswordSchema>

export const companyTypeSchema = z.object({
  type: z.enum(["rental", "housing", "tourism"], {
    required_error: "validation.companyTypeRequired",
  }),
})

export type CompanyTypeFormData = z.infer<typeof companyTypeSchema>

export const companyDataSchema = z.object({
  legalName: z.string().min(2, "validation.legalNameRequired"),
  commercialName: z.string().min(2, "validation.commercialNameRequired"),
  nif: z.string().min(5, "validation.nifInvalid"),
  country: z.string().min(1, "validation.countryRequired"),
  city: z.string().min(2, "validation.cityRequired"),
  address: z.string().min(5, "validation.addressRequired"),
  email: z.string().email("validation.emailInvalid"),
  phone: z.string().min(6, "validation.phoneShort"),
  bankName: z.string().min(2, "validation.bankNameRequired"),
  iban: z.string().min(15, "validation.ibanInvalid"),
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
      required_error: "validation.tripTypeRequired",
    }),
    origin: z.string().min(2, "validation.originRequired"),
    destination: z.string().min(2, "validation.destinationRequired"),
    departDate: z.string().min(1, "validation.departDateRequired"),
    // Kept optional at field level; the round-trip rule is enforced below.
    returnDate: z.string().optional().or(z.literal("")),
    // Driven by stepper counters that always set real numbers.
    adults: z.number().int().min(1, "validation.adultsMin").max(9),
    children: z.number().int().min(0).max(9),
    infants: z.number().int().min(0).max(9),
    cabinClass: z.enum(["economy", "business", "first"], {
      required_error: "validation.cabinRequired",
    }),
    title: z.enum(["mr", "ms"], { required_error: "validation.titleRequired" }),
    fullName: z.string().min(3, "validation.fullNameRequired"),
    email: z.string().email("validation.emailInvalid"),
    phonePrefix: z.string().min(1, "validation.prefixRequired"),
    phone: z.string().min(6, "validation.phoneInvalid"),
    // GDPR / Lei nº 133/V/2001: explicit consent captured on the public form.
    consent: z.boolean().refine((v) => v === true, {
      message: "validation.consentRequired",
    }),
  })
  .refine(
    (d) => d.tripType !== "round_trip" || Boolean(d.returnDate),
    { message: "validation.returnDateRequired", path: ["returnDate"] }
  )
  .refine(
    (d) => !d.returnDate || !d.departDate || d.returnDate >= d.departDate,
    { message: "validation.returnBeforeDepart", path: ["returnDate"] }
  )
  .refine((d) => d.infants <= d.adults, {
    message: "validation.infantPerAdult",
    path: ["infants"],
  })

export type TravelRequestFormData = z.infer<typeof travelRequestSchema>

/**
 * Força da password.
 *
 * Devolve `level` — `weak`, `good` ou `excellent` — em vez de uma palavra: quem
 * desenha o indicador precisa de comparar o nível para escolher a cor e o
 * número de barras, e comparar contra texto traduzido partia o indicador assim
 * que a pessoa mudasse de idioma.
 */
export function getPasswordStrength(password: string): {
  score: number
  level: "weak" | "good" | "excellent"
  color: string
} {
  let score = 0

  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++

  if (score <= 2) return { score, level: "weak", color: "text-red-500" }
  if (score <= 3) return { score, level: "good", color: "text-yellow-500" }
  return { score, level: "excellent", color: "text-green-500" }
}

// --- Passenger details (Link 2) ----------------------------------------------

const today = () => new Date().toISOString().slice(0, 10)

/** C-06 · a data de nascimento mais antiga aceitável: 120 anos atrás. */
export const MAX_AGE_YEARS = 120

const oldestBirthDate = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - MAX_AGE_YEARS)
  return d.toISOString().slice(0, 10)
}

/**
 * C-06 · a idade **à data da viagem**, e não à data da marcação.
 *
 * É a regra das companhias e é a que decide o preço: quem faz 12 anos entre a
 * reserva e a partida viaja como adulto, com tarifa de adulto e sem desconto de
 * criança. Calcular a idade a partir de hoje dá o número certo hoje e o número
 * errado no aeroporto — e a diferença descobre-se ao balcão do check-in, já com
 * o bilhete emitido em nome errado.
 *
 * Devolve anos completos na data dada.
 */
export function ageAt(birthDate: string, onDate: string): number {
  const born = new Date(birthDate)
  const when = new Date(onDate)
  if (Number.isNaN(born.getTime()) || Number.isNaN(when.getTime())) return 0

  let years = when.getFullYear() - born.getFullYear()
  const monthDiff = when.getMonth() - born.getMonth()
  /* Ainda não fez anos nesse ano: desconta um. */
  if (monthDiff < 0 || (monthDiff === 0 && when.getDate() < born.getDate())) {
    years--
  }
  return Math.max(0, years)
}

/** As fronteiras de tarifa das companhias: bebé < 2, criança < 12, adulto. */
export type FareAge = "infant" | "child" | "adult"

export function fareAgeAt(birthDate: string, travelDate: string): FareAge {
  const age = ageAt(birthDate, travelDate)
  if (age < 2) return "infant"
  if (age < 12) return "child"
  return "adult"
}

/**
 * C-06 · o aviso de quem muda de tarifa entre a marcação e a partida.
 *
 * "Um alerta dispara se uma criança fizer 12 anos entre a marcação e a
 * partida." A mesma fronteira existe aos 2 anos, e pela mesma razão — um bebé
 * de colo que faz 2 anos passa a ocupar lugar — por isso as duas são
 * verificadas aqui.
 *
 * Devolve nulo quando nada muda, e uma descrição do que muda quando muda.
 */
export function fareAgeChange(
  birthDate: string,
  bookingDate: string,
  travelDate: string
): { from: FareAge; to: FareAge; turns: number } | null {
  if (!birthDate || !travelDate) return null

  const from = fareAgeAt(birthDate, bookingDate)
  const to = fareAgeAt(birthDate, travelDate)
  if (from === to) return null

  return { from, to, turns: to === "adult" ? 12 : 2 }
}

export const passengerSchema = z.object({
  passengerType: z.enum(["adult", "child", "infant"]),
  firstName: z.string().trim().min(2, "validation.firstNameRequired"),
  lastName: z.string().trim().min(2, "validation.lastNameRequired"),
  gender: z.enum(["m", "f", "x"], { required_error: "validation.genderRequired" }),
  /*
   * C-06 · as duas pontas de uma data de nascimento.
   *
   * O futuro já era recusado. O que faltava era a outra ponta: um `1066-04-12`
   * passava, e um erro de digitação no ano é o engano mais comum deste campo —
   * escreve-se `1889` em vez de `1989` e ninguém repara até a companhia
   * recusar o bilhete.
   *
   * 120 anos é o limite do critério, e é generoso de propósito: a pessoa mais
   * velha de que há registo viveu 122, e um limite apertado recusaria um
   * centenário verdadeiro.
   */
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "validation.birthDateInvalid")
    .refine((d) => d <= today(), "validation.birthDateFuture")
    .refine((d) => d >= oldestBirthDate(), "validation.birthDateTooOld"),
  nationality: z.string().trim().min(2, "validation.nationalityRequired"),
  passportNumber: z
    .string()
    .trim()
    .min(5, "validation.passportInvalid")
    .max(20, "validation.passportInvalid"),
  // Most carriers require the passport to outlive the trip; a passport that has
  // already expired is always rejected, so block it at the form.
  passportExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "validation.passportExpiryInvalid")
    .refine((d) => d > today(), "validation.passportExpired"),
})

export type PassengerFormData = z.infer<typeof passengerSchema>

export const passengerDetailsSchema = z.object({
  passengers: z.array(passengerSchema).min(1, "validation.passengersMin"),
})

export type PassengerDetailsFormData = z.infer<typeof passengerDetailsSchema>
