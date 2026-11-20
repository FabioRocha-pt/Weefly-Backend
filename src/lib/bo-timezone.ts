/**
 * WeeFly · E8 · o fuso das horas do back-office.
 *
 * O teste do VIP (19 de novembro): "o backoffice mostra horas diferentes para
 * os mesmos acontecimentos". Era verdade: o Concierge escrevia tudo em
 * `Atlantic/Cape_Verde`, e as páginas do WeeFly Pro formatavam sem fuso — no
 * servidor, que corre em UTC (ver `ecosystem.config.js`). A mesma hora saía
 * com uma hora de diferença conforme o ecrã.
 *
 * Agora há um fuso só: **o da conta de quem está a ver**
 * (`user_metadata.bo_timezone`, como a língua em `bo_locale`). Escolhe-se nas
 * Definições; quem nunca escolheu fica com o do seu browser, guardado na conta
 * à primeira visita (`BoTimeZoneSync`); sem nada, Cabo Verde, que era o que o
 * Concierge já mostrava.
 *
 * Só para o que o agente **vê**. O que se escreve ao cliente (emails, o link,
 * o bilhete) e as contas de "que dia é hoje" (alertas, finanças) continuam em
 * Cabo Verde, de propósito: não dependem de quem tem o ecrã aberto.
 *
 * Sem imports de servidor: os componentes de cliente usam isto.
 */

export const BO_DEFAULT_TIME_ZONE = "Atlantic/Cape_Verde"

/** Um nome IANA que este motor conhece ("Europe/Lisbon"). */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value })
    return true
  } catch {
    return false
  }
}

/**
 * O fuso escrito para se ler: "Praia (GMT-1)".
 *
 * A cidade e o desvio, os dois: "GMT-1" sozinho não diz a quem está em Lisboa
 * porque é que a hora não é a dele, e "Praia" sozinho não diz que hora é.
 */
export function timeZoneLabel(timeZone: string, tag = "pt-PT", at: Date = new Date()): string {
  const city = (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ")
  let offset = ""
  try {
    offset =
      new Intl.DateTimeFormat(tag, { timeZone, timeZoneName: "shortOffset" })
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")?.value ?? ""
  } catch {
    /* um motor sem `shortOffset`: fica a cidade */
  }
  /* Cabo Verde é o fuso da casa: dizê-lo pelo nome do país, como a equipa diz. */
  const name = timeZone === BO_DEFAULT_TIME_ZONE ? "Cabo Verde" : city
  return offset ? `${name} (${offset})` : name
}

/**
 * Os fusos que as Definições oferecem: Cabo Verde, os países dos parceiros e
 * a diáspora. O do browser junta-se a esta lista quando não está nela.
 */
export const BO_TIME_ZONES: readonly string[] = [
  "Atlantic/Cape_Verde",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/London",
  "Europe/Amsterdam",
  "America/New_York",
  "America/Fortaleza",
  "Africa/Dakar",
  "Africa/Bissau",
  "Africa/Conakry",
  "Africa/Freetown",
  "Africa/Bamako",
  "Africa/Abidjan",
  "Africa/Accra",
  "Africa/Lome",
  "Africa/Lagos",
  "Africa/Douala",
  "Africa/Sao_Tome",
  "Africa/Luanda",
  "Africa/Kinshasa",
  "Africa/Casablanca",
  "Africa/Tunis",
  "Africa/Lusaka",
  "Africa/Maputo",
  "Africa/Johannesburg",
  "Africa/Nairobi",
]
