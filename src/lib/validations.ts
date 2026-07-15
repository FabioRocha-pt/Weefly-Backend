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
