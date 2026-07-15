import { type NextRequest } from "next/server"
import { updateSession } from "@/utils/supabase/middleware"

export async function middleware(request: NextRequest) {
  // Refreshes the Supabase session and enforces route protection.
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Run on every request path except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - common image assets
     * Feel free to add more public asset extensions here.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
