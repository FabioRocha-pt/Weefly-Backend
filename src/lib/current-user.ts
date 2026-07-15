import { cache } from "react"

import { createClient } from "@/utils/supabase/server"

export type CurrentUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  initials: string
  phone: string
  country: string
}

function computeInitials(firstName: string, lastName: string, email: string): string {
  const first = firstName.trim()
  const last = lastName.trim()
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || first.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

/**
 * Returns the currently authenticated user, normalized for the UI.
 *
 * Name/phone/country come from the auth user's `user_metadata`, which is
 * populated by the sign-up action (`options.data`). Falls back gracefully for
 * accounts created without that metadata.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const firstName = typeof meta.first_name === "string" ? meta.first_name : ""
  const lastName = typeof meta.last_name === "string" ? meta.last_name : ""
  const country = typeof meta.country === "string" ? meta.country : ""
  const phone =
    typeof meta.phone === "string" ? meta.phone : user.phone ?? ""
  const email = user.email ?? ""

  const fullName =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    (email ? email.split("@")[0] : "Utilizador")

  return {
    id: user.id,
    email,
    firstName,
    lastName,
    fullName,
    initials: computeInitials(firstName, lastName, email),
    phone,
    country,
  }
})
