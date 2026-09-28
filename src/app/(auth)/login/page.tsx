import { LoginForm } from "@/components/forms/login-form"
import { safeNextPath } from "@/lib/safe-next"

/**
 * PRO-01 · a entrada única do WeeFly Pro.
 *
 * O `redirectedFrom` é posto pelo middleware (e pelo back-office) quando alguém
 * sem sessão abre um link directo. Lê-se aqui, na página, e não com
 * `useSearchParams` no formulário, para não obrigar a página a um Suspense.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectedFrom?: string }
}) {
  return (
    <div className="w-full max-w-md">
      <LoginForm next={safeNextPath(searchParams.redirectedFrom)} />
    </div>
  )
}
