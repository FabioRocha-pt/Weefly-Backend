"use client"

import { useState, useTransition } from"react"
import { Check, Loader2 } from"lucide-react"

import { cn } from"@/lib/utils"
import { updateRequestStatus } from"@/actions/travel-requests"
import {
 REQUEST_STATUSES,
 STATUS_LABELS,
 type RequestStatus,
} from"@/lib/travel-request-status"

/**
 * Status workflow control. Optimistic on the button that was clicked, with a
 * revert if the server action rejects (e.g. RLS denies a non-staff user).
 */
export function StatusSelector({
 id,
 current,
}: {
 id: string
 current: RequestStatus
}) {
 const [status, setStatus] = useState<RequestStatus>(current)
 const [error, setError] = useState<string | null>(null)
 const [pending, startTransition] = useTransition()

 function change(next: RequestStatus) {
 if (next === status || pending) return
 const previous = status
 setStatus(next)
 setError(null)

 const formData = new FormData()
 formData.set("id", id)
 formData.set("status", next)

 startTransition(async () => {
 const result = await updateRequestStatus(formData)
 if (result.error) {
 setStatus(previous)
 setError(result.error)
 }
 })
 }

 return (
 <div>
 <div className="flex flex-wrap gap-2">
 {REQUEST_STATUSES.map((s) => {
 const active = s === status
 return (
 <button
 key={s}
 type="button"
 onClick={() => change(s)}
 disabled={pending}
 className={cn(
"flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-all disabled:opacity-60",
 active
 ?"border-adm-ember bg-adm-ember/10 text-adm-ember-dark"
 :"border-adm-line bg-adm-panel text-adm-txt-2 hover:border-adm-muted"
 )}
 >
 {active &&
 (pending ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <Check className="h-3.5 w-3.5" />
 ))}
 {STATUS_LABELS[s]}
 </button>
 )
 })}
 </div>
 {error && <p className="mt-2 text-sm text-adm-ember">{error}</p>}
 </div>
 )
}
