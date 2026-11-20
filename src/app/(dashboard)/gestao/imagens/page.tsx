import { notFound } from "next/navigation"

import { boIdentity } from "@/lib/bo-access"
import { listCityImages } from "@/lib/city-images"
import { CityImagesAdmin, type CityImageRowView } from "@/components/pro/city-images-admin"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * Admin · IMG-01 · a biblioteca de imagens das cidades: carregar, substituir
 * e desativar, e os aeroportos que usam cada uma. Só o Admin WeeFly — a
 * server action volta a verificar.
 */

export const dynamic = "force-dynamic"

export default async function ImagensPage() {
  const identity = await boIdentity()
  if (!identity?.profile || identity.profile.manageUsers !== "all" || !identity.profile.crossPartner) notFound()

  const { t } = await getBoI18n()
  const rows = await listCityImages({ fresh: true })

  const cities: CityImageRowView[] = rows.map((r) => ({
    code: r.code,
    cityName: r.cityName,
    airports: r.airportCodes,
    alt: r.alt,
    small: r.imageSmall,
    hasImage: Boolean(r.imageLarge && r.imageSmall),
    active: r.active,
    updatedAt: r.updatedAt,
    changedByEmail: r.changedByEmail,
  }))

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.cityImages.title")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.cityImages.subtitle")}</p>
      </div>
      <CityImagesAdmin cities={cities} />
    </div>
  )
}
