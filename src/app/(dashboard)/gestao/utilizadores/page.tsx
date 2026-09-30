import { UsersAdminPage } from "@/components/pro/users-admin-page"

/** ADM-02 · no Admin: todas as contas, de todos os parceiros. */
export default function UtilizadoresPage() {
  return (
    <UsersAdminPage
      title="Utilizadores e permissões"
      subtitle="Cada conta tem um perfil, um parceiro e os módulos ligados. Não se apagam contas: suspendem-se."
    />
  )
}
