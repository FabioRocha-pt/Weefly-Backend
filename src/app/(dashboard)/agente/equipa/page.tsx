import { UsersAdminPage } from "@/components/pro/users-admin-page"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * ADM-02 · o Admin do parceiro gere os agentes e as secretárias do seu
 * parceiro, sem a WeeFly. Quem não gere ninguém recebe 404.
 */
export default async function EquipaPage() {
  const { t } = await getBoI18n()
  return (
    <UsersAdminPage title={t("bo.pro.team.title")} subtitle={t("bo.pro.team.subtitle")} />
  )
}
