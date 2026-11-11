/**
 * WeeFly · I18N-01/02 · o dicionário do back-office, em PT, EN e FR.
 *
 * "Um dicionário próprio do backoffice." Separado do público de propósito: o
 * público tem quatro línguas e é o cliente que as escolhe pelo link; este tem
 * duas e é o agente que escolhe, nas Definições. Misturar os dois era a forma
 * mais curta de uma frase do ecrã do agente acabar num email ao cliente.
 *
 * Tudo debaixo de `bo.`, dividido por partes (uma por área do back-office),
 * para que cada área se edite sem tocar nas outras. `npm run i18n:check`
 * garante que PT, EN e FR têm as mesmas chaves.
 *
 * Sem imports de servidor.
 */

import type { Dictionary } from "../translate"

import shellPt from "./parts/shell.pt.json"
import shellEn from "./parts/shell.en.json"
import shellFr from "./parts/shell.fr.json"
import queuePt from "./parts/queue.pt.json"
import queueEn from "./parts/queue.en.json"
import queueFr from "./parts/queue.fr.json"
import caseViewPt from "./parts/caseView.pt.json"
import caseViewEn from "./parts/caseView.en.json"
import caseViewFr from "./parts/caseView.fr.json"
import paymentsPt from "./parts/payments.pt.json"
import paymentsEn from "./parts/payments.en.json"
import paymentsFr from "./parts/payments.fr.json"
import issuancePt from "./parts/issuance.pt.json"
import issuanceEn from "./parts/issuance.en.json"
import issuanceFr from "./parts/issuance.fr.json"
import composerPt from "./parts/composer.pt.json"
import composerEn from "./parts/composer.en.json"
import composerFr from "./parts/composer.fr.json"
import proPt from "./parts/pro.pt.json"
import proEn from "./parts/pro.en.json"
import proFr from "./parts/pro.fr.json"
import actionsPt from "./parts/actions.pt.json"
import actionsEn from "./parts/actions.en.json"
import actionsFr from "./parts/actions.fr.json"
import b2gPt from "./parts/b2g.pt.json"
import b2gEn from "./parts/b2g.en.json"
import b2gFr from "./parts/b2g.fr.json"
import financePt from "./parts/finance.pt.json"
import financeEn from "./parts/finance.en.json"
import financeFr from "./parts/finance.fr.json"
import adminCasesPt from "./parts/adminCases.pt.json"
import adminCasesEn from "./parts/adminCases.en.json"
import adminCasesFr from "./parts/adminCases.fr.json"
import travellersPt from "./parts/travellers.pt.json"
import travellersEn from "./parts/travellers.en.json"
import travellersFr from "./parts/travellers.fr.json"
import vipPt from "./parts/vip.pt.json"
import vipEn from "./parts/vip.en.json"
import vipFr from "./parts/vip.fr.json"
import ministriesPt from "./parts/ministries.pt.json"
import ministriesEn from "./parts/ministries.en.json"
import ministriesFr from "./parts/ministries.fr.json"
import queuesPt from "./parts/queues.pt.json"
import queuesEn from "./parts/queues.en.json"
import queuesFr from "./parts/queues.fr.json"
import offersPt from "./parts/offers.pt.json"
import offersEn from "./parts/offers.en.json"
import offersFr from "./parts/offers.fr.json"
import activityPt from "./parts/activity.pt.json"
import activityEn from "./parts/activity.en.json"
import activityFr from "./parts/activity.fr.json"
import airlinesPt from "./parts/airlines.pt.json"
import airlinesEn from "./parts/airlines.en.json"
import airlinesFr from "./parts/airlines.fr.json"
import rolesPt from "./parts/roles.pt.json"
import rolesEn from "./parts/roles.en.json"
import rolesFr from "./parts/roles.fr.json"

export const BO_LOCALES = ["pt", "en", "fr"] as const
export type BoLocale = (typeof BO_LOCALES)[number]
export const BO_DEFAULT_LOCALE: BoLocale = "pt"

export function isBoLocale(value: unknown): value is BoLocale {
  return typeof value === "string" && (BO_LOCALES as readonly string[]).includes(value)
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
  pt: [shellPt, queuePt, caseViewPt, paymentsPt, issuancePt, composerPt, proPt, actionsPt, b2gPt, financePt, adminCasesPt, travellersPt, vipPt, ministriesPt, queuesPt, offersPt, activityPt, airlinesPt, rolesPt],
  en: [shellEn, queueEn, caseViewEn, paymentsEn, issuanceEn, composerEn, proEn, actionsEn, b2gEn, financeEn, adminCasesEn, travellersEn, vipEn, ministriesEn, queuesEn, offersEn, activityEn, airlinesEn, rolesEn],
  fr: [shellFr, queueFr, caseViewFr, paymentsFr, issuanceFr, composerFr, proFr, actionsFr, b2gFr, financeFr, adminCasesFr, travellersFr, vipFr, ministriesFr, queuesFr, offersFr, activityFr, airlinesFr, rolesFr],
}

const BO_DICTIONARIES: Record<BoLocale, Dictionary> = {
  pt: PARTS.pt.reduce<Dictionary>((acc, part) => merge(acc, part as Record<string, unknown>), {}),
  en: PARTS.en.reduce<Dictionary>((acc, part) => merge(acc, part as Record<string, unknown>), {}),
  fr: PARTS.fr.reduce<Dictionary>((acc, part) => merge(acc, part as Record<string, unknown>), {}),
}

export function getBoDictionary(locale: BoLocale): Dictionary {
  return BO_DICTIONARIES[locale]
}
