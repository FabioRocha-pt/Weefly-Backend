import type { MinistryTravellerChange } from "@/lib/travellers"
import type { Translator } from "@/i18n/translate"

/**
 * B2G-25 · D-11 · "Cada registo e cada alteração ficam no Admin, com quem fez
 * e quando." O histórico das fichas de passageiros de um ministério: quem
 * (a secretária pelo nome, ou o email do back-office), quando, que ficha, e se
 * foi um registo novo ou que campos mudaram. Só leitura.
 */
export function TravellerChangeLog({
  changes,
  t,
  locale,
}: {
  changes: MinistryTravellerChange[]
  t: Translator
  locale: string
}) {
  const stamp = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pt-PT", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Atlantic/Cape_Verde",
    }).format(new Date(iso))

  return (
    <section className="max-w-6xl mx-auto rounded-xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">{t("bo.travellerLog.title")}</h2>
        <p className="text-xs text-slate-500">{t("bo.travellerLog.intro")}</p>
      </header>
      {changes.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">{t("bo.travellerLog.none")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">{t("bo.travellerLog.when")}</th>
                <th className="px-4 py-2">{t("bo.travellerLog.traveller")}</th>
                <th className="px-4 py-2">{t("bo.travellerLog.what")}</th>
                <th className="px-4 py-2">{t("bo.travellerLog.who")}</th>
                <th className="px-4 py-2">{t("bo.travellerLog.source")}</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">{stamp(c.createdAt)}</td>
                  <td className="px-4 py-2 font-semibold text-slate-900">{c.travellerName}</td>
                  <td className="px-4 py-2 text-slate-700">
                    {c.created
                      ? t("bo.travellerLog.created")
                      : t("bo.travellerLog.changed", { fields: c.fields.join(", ") || "—" })}
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {c.by ?? "—"}
                    {c.bySecretary && <span className="ml-1 text-xs text-slate-500">({t("bo.travellerLog.secretary")})</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{t(`bo.travellerLog.sources.${c.source}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
