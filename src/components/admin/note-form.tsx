"use client"

import { useRef, useState, useTransition } from "react"
import { Loader2, Send } from "lucide-react"

import { addRequestNote } from "@/actions/travel-requests"
import { useT } from "@/i18n/provider"

/** Internal note composer — notes are staff-only and never shown to clients. */
export function NoteForm({ id }: { id: string }) {
  const t = useT()
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await addRequestNote(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      formRef.current?.reset()
    })
  }

  return (
    <form ref={formRef} action={onSubmit} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea
        name="body"
        rows={3}
        required
        placeholder={t("admin.noteInternal")}
        className="w-full resize-none rounded-lg border border-adm-line bg-adm-panel p-3 text-sm outline-none transition-colors placeholder:text-adm-muted focus:border-adm-ember"
      />
      {error && <p className="text-sm text-adm-ember">{error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-adm-ember px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-adm-ember-dark disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {t("admin.noteAdd")}
        </button>
      </div>
    </form>
  )
}
