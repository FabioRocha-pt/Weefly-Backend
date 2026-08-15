"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/utils/supabase/server"
import {
  REQUEST_STATUSES,
  type RequestStatus,
} from "@/lib/travel-request-status"
import { getI18n } from "@/i18n/server"

export type RequestActionState = { error: string | null }

function field(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Move a request through the status workflow.
 *
 * No explicit staff check: the `Staff can update trip requests` RLS policy
 * rejects the write for anyone outside platform_staff, so a non-staff caller
 * gets zero rows updated rather than a silent success.
 */
export async function updateRequestStatus(
  formData: FormData
): Promise<RequestActionState> {
  const { t } = getI18n()
  const id = field(formData, "id")
  const status = field(formData, "status")

  if (!id) return { error: t("errors.invalidRequest") }
  if (!REQUEST_STATUSES.includes(status as RequestStatus)) {
    return { error: t("errors.invalidStatus") }
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from("trip_requests")
    .update({ status })
    .eq("id", id)
    .select("id")

  if (error) {
    console.error("[back-office] updateRequestStatus failed:", error)
    return { error: t("errors.statusUpdateFailed") }
  }
  if (!data || data.length === 0) {
    return { error: t("errors.noPermissionRequest") }
  }

  revalidatePath("/admin")
  revalidatePath(`/admin/pedidos/${id}`)
  return { error: null }
}

/** Append an internal note. `author_id` must equal auth.uid() per RLS. */
export async function addRequestNote(
  formData: FormData
): Promise<RequestActionState> {
  const { t } = getI18n()
  const id = field(formData, "id")
  const body = field(formData, "body")

  if (!id) return { error: t("errors.invalidRequest") }
  if (!body) return { error: t("errors.emptyNote") }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: t("errors.sessionExpired") }

  const { error } = await supabase.from("trip_request_notes").insert({
    trip_request_id: id,
    author_id: user.id,
    author_email: user.email ?? null,
    body,
  })

  if (error) {
    console.error("[back-office] addRequestNote failed:", error)
    return { error: t("errors.noteSaveFailed") }
  }

  revalidatePath(`/admin/pedidos/${id}`)
  return { error: null }
}
