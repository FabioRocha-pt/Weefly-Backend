import { PasswordResetRequestForm } from "@/components/forms/password-reset-form"

/* FIX-01 · `?expirado=1` vem do /auth/callback quando o link de recuperação
   tem mais de 1 hora: o formulário abre com o aviso e pede-se um link novo. */
export default function RecuperarPasswordPage({
  searchParams,
}: {
  searchParams?: { expirado?: string }
}) {
  return (
    <div className="w-full max-w-md">
      <PasswordResetRequestForm expired={searchParams?.expirado === "1"} />
    </div>
  )
}
