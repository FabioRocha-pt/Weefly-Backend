import { redirect } from "next/navigation"

export default function RootPage() {
  // Entry point — send visitors to the login screen.
  redirect("/login")
}
