import { LoginForm } from "@/components/forms/login-form"
import { safeNextPath } from "@/lib/safe-next"
import { siteContext } from "@/lib/site-meta"

/**
 * PRO-01 · a entrada única do WeeFly Pro.
 *
 * O `redirectedFrom` é posto pelo middleware (e pelo back-office) quando alguém
 * sem sessão abre um link directo. Lê-se aqui, na página, e não com
 * `useSearchParams` no formulário, para não obrigar a página a um Suspense.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { redirectedFrom?: string }
}) {
  const ctx = await siteContext()
  return (
    <div className="w-full max-w-md">
      <LoginForm
        next={safeNextPath(searchParams.redirectedFrom)}
        brandName={ctx.partnerBrand ? ctx.brand.name : null}
      />
    </div>
  )
}
