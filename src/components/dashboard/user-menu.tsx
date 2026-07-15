"use client"

import { useState } from "react"
import { LogOut, ChevronDown } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { signOut } from "@/actions/auth"

export type UserMenuData = {
  fullName: string
  email: string
  initials: string
}

export function UserMenu({ user }: { user: UserMenuData | null }) {
  const [open, setOpen] = useState(false)

  if (!user) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-slate-900 text-white font-semibold">
            {user.initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-[10rem] truncate">
          {user.fullName}
        </span>
        <ChevronDown className="hidden sm:block w-4 h-4 text-slate-400" />
      </button>

      {open && (
        <>
          {/* click-away layer */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-full mt-2 w-64 z-50 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <p className="font-semibold text-slate-900 truncate">{user.fullName}</p>
              <p className="text-sm text-slate-500 truncate">{user.email}</p>
            </div>

            <form action={signOut}>
              <button
                type="submit"
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Terminar sessão
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
