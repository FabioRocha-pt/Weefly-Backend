/**
 * WeeFly Concierge — Central Intake persistence.
 *
 * Turns a validated travel request into a Lead + TripRequest. Channel-agnostic
 * on purpose: the browser form passes `source_channel: "browser"`, and the
 * WhatsApp webhook will pass "whatsapp" against the same function.
 *
 * Writes go through the service-role client, so this module is SERVER ONLY.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import type { TravelRequestFormData } from "@/lib/validations"

export type SourceChannel = "browser" | "whatsapp" | "chat" | "manual"

export interface SavedTravelRequest {
  leadId: string
  tripRequestId: string
  /** Human-friendly reference, e.g. "WF-2608-0001". */
  reference: string
}

/** Postgres unique-violation — two submissions from a new address raced. */
const UNIQUE_VIOLATION = "23505"

/**
 * Find-or-create the lead for this email address.
 *
 * One lead per person: a repeat customer accumulates trip requests rather than
 * fragmenting into duplicate contacts. Contact details are refreshed on each
 * submission, since the newest spelling of a name or phone is the best one.
 */
async function upsertLead(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  data: TravelRequestFormData,
  sourceChannel: SourceChannel
): Promise<string> {
  const email = data.email.trim().toLowerCase()

  const contact = {
    title: data.title,
    full_name: data.fullName.trim(),
    email,
    phone_prefix: data.phonePrefix,
    phone: data.phone.trim(),
    source_channel: sourceChannel,
    consent: data.consent,
    consent_at: data.consent ? new Date().toISOString() : null,
  }

  const existing = await admin
    .from("leads")
    .select("id")
    .eq("email", email)
    .maybeSingle()

  if (existing.data?.id) {
    // Don't overwrite the original source_channel — where a lead first came
    // from is worth keeping.
    const { source_channel: _ignored, ...refreshable } = contact
    await admin.from("leads").update(refreshable).eq("id", existing.data.id)
    return existing.data.id
  }

  const inserted = await admin
    .from("leads")
    .insert(contact)
    .select("id")
    .single()

  if (inserted.error) {
    if (inserted.error.code === UNIQUE_VIOLATION) {
      // Lost the race — the concurrent insert won, so adopt its lead.
      const retry = await admin
        .from("leads")
        .select("id")
        .eq("email", email)
        .single()
      if (retry.data?.id) return retry.data.id
    }
    throw inserted.error
  }

  return inserted.data.id
}

/**
 * Persist a travel request. Returns null when Supabase isn't configured, so a
 * missing key degrades the same way a missing Resend key does — the customer
 * still gets a response instead of a 500.
 */
export async function saveTravelRequest(
  data: TravelRequestFormData,
  options: {
    sourceChannel?: SourceChannel
    emailSent?: boolean
    teamNotified?: boolean
  } = {}
): Promise<SavedTravelRequest | null> {
  const admin = createAdminClient()
  if (!admin) {
    console.warn(
      "[concierge] SUPABASE_SERVICE_ROLE_KEY not set — request not persisted."
    )
    return null
  }

  const {
    sourceChannel = "browser",
    emailSent = false,
    teamNotified = false,
  } = options

  try {
    const leadId = await upsertLead(admin, data, sourceChannel)

    const { data: trip, error } = await admin
      .from("trip_requests")
      .insert({
        lead_id: leadId,
        trip_type: data.tripType,
        origin: data.origin.trim(),
        destination: data.destination.trim(),
        depart_date: data.departDate,
        return_date: data.returnDate || null,
        adults: data.adults,
        children: data.children,
        infants: data.infants,
        cabin_class: data.cabinClass,
        email_sent: emailSent,
        team_notified: teamNotified,
      })
      .select("id, reference")
      .single()

    if (error) throw error

    return { leadId, tripRequestId: trip.id, reference: trip.reference }
  } catch (err) {
    console.error("[concierge] Failed to persist travel request:", err)
    return null
  }
}

/**
 * Record how the transactional emails actually went, after the fact.
 *
 * The request is persisted *before* the emails are attempted so a mail outage
 * can never lose a lead; this backfills the delivery outcome so the back-office
 * can flag "client never received a confirmation".
 */
export async function markEmailOutcome(
  tripRequestId: string,
  outcome: { emailSent: boolean; teamNotified: boolean }
): Promise<void> {
  const admin = createAdminClient()
  if (!admin) return

  const { error } = await admin
    .from("trip_requests")
    .update({
      email_sent: outcome.emailSent,
      team_notified: outcome.teamNotified,
    })
    .eq("id", tripRequestId)

  if (error) {
    console.error("[concierge] Failed to record email outcome:", error)
  }
}
