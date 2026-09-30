import { UsersAdminPage } from "@/components/pro/users-admin-page"

/**
 * ADM-02 · o Admin do parceiro gere os agentes e as secretárias do seu
 * parceiro, sem a WeeFly. Quem não gere ninguém recebe 404.
 */
export default function EquipaPage() {
  return (
    <UsersAdminPage
      title="Equipa"
      subtitle="Os agentes e as secretárias da sua empresa. Não se apagam contas: suspendem-se, e o histórico fica."
    />
  )
}
