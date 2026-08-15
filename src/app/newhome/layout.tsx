import type { Metadata } from "next"

import { getI18n } from "@/i18n/server"

export function generateMetadata(): Metadata {
  const { t } = getI18n()
  return {
    title: t("meta.newHomeTitle"),
    description: t("meta.newHomeDescription"),
  }
}

/**
 * Standalone shell for the Phase-2 conversational home.
 *
 * The brief calls for the platform's Phase-2 identity — Ember Red (#FF4747),
 * Plus Jakarta Sans, clean white background — which differs from the existing
 * dashboard theme, so this subtree is self-contained. The font is loaded at
 * runtime (matching how the app already pulls Google Fonts in globals.css) and
 * applied via a wrapper so nothing else in the app is affected.
 */
export default function NewHomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className="min-h-screen bg-white text-slate-900 antialiased"
      style={{
        fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
      }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      {children}
    </div>
  )
}
