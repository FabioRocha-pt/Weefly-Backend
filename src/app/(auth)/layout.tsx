import { AuthNavbar } from "@/components/auth/auth-navbar"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen auth-bg">
      <AuthNavbar />
      <main className="flex items-center justify-center py-8 px-4">
        {children}
      </main>
    </div>
  )
}
