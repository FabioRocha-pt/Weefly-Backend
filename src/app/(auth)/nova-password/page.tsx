import { NewPasswordForm } from "@/components/forms/new-password-form"
import { createClient } from "@/utils/supabase/server"

/**
 * OCT-04 · a página onde o link de recuperação aterra, já com sessão (ver
 * `auth/callback`). Mostra a conta que vai mudar de password.
 */
export default async function NovaPasswordPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="w-full max-w-md">
      <NewPasswordForm email={user?.email ?? null} />
    </div>
  )
}
