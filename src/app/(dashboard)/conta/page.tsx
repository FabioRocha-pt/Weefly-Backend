import { getCurrentUser } from "@/lib/current-user"
import { accessProfile, requireApprovedAccount } from "@/lib/pro-account"
import { getBoAccess } from "@/lib/bo-access"
import { ProfileForm } from "@/components/pro/profile-form"
import { getI18n } from "@/i18n/server"

/**
 * PRO-13 · o perfil básico. Nome e telefone editam-se; a empresa e o perfil de
 * acesso só se leem — quem os muda é o Admin.
 */
export default async function ContaPage() {
  const { t } = getI18n()
  const [account, user, bo] = await Promise.all([
    requireApprovedAccount(),
    getCurrentUser(),
    getBoAccess(),
  ])

  /* O perfil de acesso: master, ou o papel no Concierge quando existe, ou
     simplesmente membro da empresa. */
  const profile =
    accessProfile(account) === "master"
      ? t("profile.roleMaster")
      : bo.ok
        ? t(`profile.roleBo.${bo.identity.role}`)
        : t("profile.roleMember")

  const company = account.partner?.name ?? (bo.ok ? bo.identity.tenant?.partnerName : null) ?? "—"

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("profile.title")}</h1>
        <p className="text-slate-500 mt-1">{t("profile.subtitle")}</p>
      </div>
      <ProfileForm
        firstName={user?.firstName ?? ""}
        lastName={user?.lastName ?? ""}
        phone={user?.phone ?? ""}
        email={user?.email ?? account.email}
        company={company}
        profile={profile}
      />
    </div>
  )
}
