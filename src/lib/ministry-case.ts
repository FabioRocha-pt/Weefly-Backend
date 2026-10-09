/**
 * WeeFly · B2G v2 · B2G-15 · B2G-16 · B2G-17 · B2G-18 · o caso, dentro do
 * espaço do ministério.
 *
 * `/ministerios/<org>/<link>/pedidos/<caso>`: a secretária vê as ofertas
 * publicadas, escolhe, regista os passageiros e descarrega os bilhetes — tudo
 * com a sessão do PIN dela (B2G-07). O token do caso deixou de servir para um
 * caso de ministério (`loadPcState` recusa-o sem `{ ministry: true }`, e o
 * `/pc/<token>` reencaminha para aqui).
 *
 * As regras de quem vê o quê:
 *   · a sessão do PIN tem de ser da secretária dona do link (B2G-07);
 *   · o caso tem de ser **do ministério dessa secretária** — senão 404 (outro
 *     ministério, mesmo da mesma empresa, nunca existe aqui);
 *   · as colegas do mesmo ministério veem os casos umas das outras (D-4);
 *   · só a proposta `publicada` (nunca rascunho nem a revisão da empresa), sem
 *     custo (`cost_total` nem é lido) e sem notas do agente; sem pagamento.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { loadSecretarySpace, secretaryForLinkToken, resolveMinistry, type MinistryContext } from "@/lib/ministry"
import { loadPcState, passengersComplete, type PcState } from "@/lib/pc/state"
import { listTicketDocuments } from "@/lib/tickets/store"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Onde o caso está, para a secretária. */
export type SecretaryCaseStep = "waiting" | "options" | "passengers" | "ready" | "issued" | "closed" | "cancelled"

export interface SecretaryCase {
  /** O estado do caso, já limpo para ir para o browser (ver `forSecretary`). */
  state: PcState
  step: SecretaryCaseStep
  readyToIssueAt: string | null
  urgency: 0 | 1 | 2
  notes: string | null
  /** D-4 · quem fez o pedido. */
  authorName: string | null
  closed: boolean
  /** B2G-18 · os PDFs que existem: o combinado e os por passageiro. */
  tickets: { combined: boolean; byPassenger: { id: string; name: string }[] }
}

/**
 * O que vai para o browser da secretária: sem o token do caso (deixou de ser
 * credencial, mas não tem de andar por aí), sem notas do agente, sem
 * pagamento nem comprovativos. O custo nunca chegou a ser lido
 * (`getPublishedProposal` lê as colunas públicas).
 */
function forSecretary(state: PcState): PcState {
  return {
    ...state,
    token: "",
    links: [],
    payment: null,
    proofs: [],
    paymentLinkStatus: null,
    offers: state.offers.map((o) => ({ ...o, agent_note: null })),
    /* O link pessoal da autora não vai para o browser de uma colega. */
    ministry: state.ministry ? { ...state.ministry, appPath: null } : null,
  }
}

async function caseRow(orgId: string, caseId: string) {
  const admin = createAdminClient()
  if (!admin || !UUID.test(caseId)) return null
  const run = (cols: string) =>
    admin.from("booking_cases").select(cols).eq("id", caseId).eq("organisation_id", orgId).maybeSingle()
  let { data, error } = await run("id, token, closed_at, urgency, secretary_id, ready_to_issue_at")
  if (error?.code === "42703") ({ data, error } = await run("id, token, closed_at, secretary_id"))
  if (error || !data) return null
  return data as unknown as {
    id: string
    token: string
    closed_at: string | null
    urgency?: number | null
    secretary_id: string | null
    ready_to_issue_at?: string | null
  }
}

/**
 * O caso para a página da secretária. Nulo — e a página dá 404 — sem sessão,
 * com um caso de outro ministério, ou com um id que não existe.
 */
export async function loadSecretaryCase(
  orgSlug: string,
  linkToken: string,
  caseId: string
): Promise<{ ministry: MinistryContext; data: SecretaryCase } | null> {
  const { lookup, signedIn } = await loadSecretarySpace(orgSlug, linkToken)
  if (!lookup.ok || !signedIn) return null
  const ministry = lookup.ministry

  const row = await caseRow(ministry.org.id, caseId)
  if (!row) return null

  const loaded = await loadPcState(row.token, { ministry: true })
  if (!loaded.ok || loaded.state.caseId !== row.id) return null
  const state = loaded.state

  const admin = createAdminClient()
  let authorName: string | null = null
  let notes: string | null = null
  if (admin) {
    const [{ data: author }, { data: trip }] = await Promise.all([
      row.secretary_id
        ? admin
            .from("ministry_secretaries")
            .select("name")
            .eq("id", row.secretary_id)
            .eq("organisation_id", ministry.org.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("booking_cases").select("trip_request:trip_requests(special_requests)").eq("id", row.id).maybeSingle(),
    ])
    authorName = (author as { name: string } | null)?.name ?? null
    const t = (trip as Record<string, any> | null)?.trip_request
    notes = (Array.isArray(t) ? t[0] : t)?.special_requests ?? null
  }

  const issued = state.stage === "emitido" || Boolean(state.issued.pnr)
  const readyToIssueAt = row.ready_to_issue_at ?? null
  let step: SecretaryCaseStep
  if (state.cancelled) step = "cancelled"
  else if (issued) step = "issued"
  else if (row.closed_at) step = "closed"
  else if (state.selectedOfferId && readyToIssueAt && passengersComplete(state)) step = "ready"
  else if (state.selectedOfferId) step = "passengers"
  else if (state.offers.length) step = "options"
  else step = "waiting"

  let tickets: SecretaryCase["tickets"] = { combined: false, byPassenger: [] }
  if (issued) {
    const docs = await listTicketDocuments(row.id)
    const names = new Map(state.passengers.map((p) => [p.id, `${p.last_name}, ${p.first_name}`]))
    tickets = {
      combined: docs.some((d) => d.passenger_id === null),
      byPassenger: docs
        .filter((d): d is typeof d & { passenger_id: string } => Boolean(d.passenger_id))
        .map((d) => ({ id: d.passenger_id, name: names.get(d.passenger_id) ?? "" })),
    }
  }

  const urgency = Number(row.urgency ?? 0)
  return {
    ministry,
    data: {
      state: forSecretary(state),
      step,
      readyToIssueAt,
      urgency: (urgency === 1 || urgency === 2 ? urgency : 0) as 0 | 1 | 2,
      notes,
      authorName,
      closed: Boolean(row.closed_at),
      tickets,
    },
  }
}

/**
 * Para as server actions do caso: a secretária da sessão, o ministério e o
 * estado completo do caso (não o limpo — é o servidor que o usa). Nulo sem
 * sessão desta secretária ou com um caso de outro ministério.
 */
export async function secretaryCaseAuth(
  orgSlug: string,
  linkToken: string,
  caseId: string
): Promise<{ ministry: MinistryContext; state: PcState } | null> {
  const secretaryId = await secretaryForLinkToken(linkToken)
  if (!secretaryId) return null
  const lookup = await resolveMinistry(orgSlug, linkToken)
  if (!lookup.ok || lookup.ministry.secretary.id !== secretaryId) return null

  const row = await caseRow(lookup.ministry.org.id, caseId)
  if (!row) return null
  const loaded = await loadPcState(row.token, { ministry: true })
  if (!loaded.ok || loaded.state.caseId !== row.id) return null
  return { ministry: lookup.ministry, state: loaded.state }
}

/**
 * `/pc/<token>` de um caso de ministério: para onde o mandar. O link pessoal
 * da secretária que fez o pedido (se ainda estiver activa) — a sessão do PIN
 * dela decide o resto —; senão a página do ministério, que não faz nada.
 * Nulo quando o caso não é de um ministério (o `/pc` segue como sempre).
 */
export async function ministryCaseRedirect(token: string): Promise<string | null> {
  const admin = createAdminClient()
  if (!admin || !token) return null
  const { data } = await admin
    .from("booking_cases")
    .select("id, organisation_id, organisation:organisations(slug), secretary_id")
    .eq("token", token)
    .maybeSingle()
  const row = data as Record<string, any> | null
  if (!row?.organisation_id) return null
  const org = Array.isArray(row.organisation) ? row.organisation[0] : row.organisation
  if (!org?.slug) return "/"

  if (row.secretary_id) {
    const { data: sec } = await admin
      .from("ministry_secretaries")
      .select("link_token, active")
      .eq("id", row.secretary_id)
      .maybeSingle()
    const s = sec as { link_token: string; active: boolean } | null
    if (s?.active && s.link_token) return `/ministerios/${org.slug}/${s.link_token}/pedidos/${row.id}`
  }
  return `/ministerios/${org.slug}`
}
