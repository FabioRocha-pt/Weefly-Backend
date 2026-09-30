/**
 * WeeFly · I18N-01 · o dicionário do back-office, em PT e EN.
 *
 * "Um dicionário próprio do backoffice." Separado do público de propósito: o
 * público tem quatro línguas e é o cliente que as escolhe pelo link; este tem
 * duas e é o agente que escolhe, nas Definições. Misturar os dois era a forma
 * mais curta de uma frase do ecrã do agente acabar num email ao cliente.
 *
 * Tudo debaixo de `bo.`, dividido por partes (uma por área do back-office),
 * para que cada área se edite sem tocar nas outras. `npm run i18n:check`
 * garante que PT e EN têm as mesmas chaves.
 *
 * Sem imports de servidor.
 */

import type { Dictionary } from "../translate"

import shellPt from "./parts/shell.pt.json"
import shellEn from "./parts/shell.en.json"
import queuePt from "./parts/queue.pt.json"
import queueEn from "./parts/queue.en.json"
import caseViewPt from "./parts/caseView.pt.json"
import caseViewEn from "./parts/caseView.en.json"
import paymentsPt from "./parts/payments.pt.json"
import paymentsEn from "./parts/payments.en.json"
import issuancePt from "./parts/issuance.pt.json"
import issuanceEn from "./parts/issuance.en.json"
import composerPt from "./parts/composer.pt.json"
import composerEn from "./parts/composer.en.json"
import proPt from "./parts/pro.pt.json"
import proEn from "./parts/pro.en.json"
import actionsPt from "./parts/actions.pt.json"
import actionsEn from "./parts/actions.en.json"

export const BO_LOCALES = ["pt", "en"] as const
export type BoLocale = (typeof BO_LOCALES)[number]
export const BO_DEFAULT_LOCALE: BoLocale = "pt"

export function isBoLocale(value: unknown): value is BoLocale {
  return value === "pt" || value === "en"
}

function merge(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key]
    if (
      value && typeof value === "object" && !Array.isArray(value) &&
      current && typeof current === "object" && !Array.isArray(current)
    ) {
      merge(current as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      target[key] = value
    }
  }
  return target
}

const PARTS: Record<BoLocale, Dictionary[]> = {
  pt: [shellPt, queuePt, caseViewPt, paymentsPt, issuancePt, composerPt, proPt, actionsPt],
  en: [shellEn, queueEn, caseViewEn, paymentsEn, issuanceEn, composerEn, proEn, actionsEn],
}

const BO_DICTIONARIES: Record<BoLocale, Dictionary> = {
  pt: PARTS.pt.reduce<Dictionary>((acc, part) => merge(acc, part as Record<string, unknown>), {}),
  en: PARTS.en.reduce<Dictionary>((acc, part) => merge(acc, part as Record<string, unknown>), {}),
}

export function getBoDictionary(locale: BoLocale): Dictionary {
  return BO_DICTIONARIES[locale]
}
