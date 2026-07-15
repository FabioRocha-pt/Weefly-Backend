/**
 * Supabase client placeholder.
 *
 * Wire this up with `@supabase/supabase-js` (and `@supabase/ssr` for the App
 * Router) once the backend is provisioned. The auth forms in this project call
 * the methods sketched below; swap these stubs for the real client.
 *
 * Expected env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

export type AuthResult = { error: string | null }

export const supabaseAuth = {
  async signUp(_params: {
    email: string
    password: string
    firstName: string
    lastName: string
    phone?: string
    country?: string
  }): Promise<AuthResult> {
    // return supabase.auth.signUp({ email, password, options: { data: {...} } })
    return { error: null }
  },

  async signInWithPassword(_params: {
    email: string
    password: string
  }): Promise<AuthResult> {
    // return supabase.auth.signInWithPassword({ email, password })
    return { error: null }
  },

  async resetPasswordForEmail(_email: string): Promise<AuthResult> {
    // return supabase.auth.resetPasswordForEmail(email, { redirectTo })
    return { error: null }
  },

  async updatePassword(_password: string): Promise<AuthResult> {
    // return supabase.auth.updateUser({ password })
    return { error: null }
  },

  async signOut(): Promise<AuthResult> {
    // return supabase.auth.signOut()
    return { error: null }
  },
}
