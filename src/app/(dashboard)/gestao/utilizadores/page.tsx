import { UsersAdminPage } from "@/components/pro/users-admin-page"
import { getBoI18n } from "@/i18n/bo-server"

/** ADM-02 · no Admin: todas as contas, de todos os parceiros. */
export default async function UtilizadoresPage() {
  const { t } = await getBoI18n()
  return (
    <UsersAdminPage title={t("bo.pro.users.title")} subtitle={t("bo.pro.users.subtitle")} />
  )
}
