import Link from"next/link"
import { notFound } from"next/navigation"
import {
 ArrowLeft,
 Mail,
 Phone,
 AlertTriangle,
 MessageSquare,
} from"lucide-react"

import { cn } from"@/lib/utils"
import { getRequestNotes, getTravelRequest } from"@/lib/travel-requests"
import {
 CABIN_LABELS,
 CHANNEL_LABELS,
 STATUS_LABELS,
 STATUS_STYLES,
 TRIP_TYPE_LABELS,
} from"@/lib/travel-request-status"
import { StatusSelector } from"@/components/admin/status-selector"
import { NoteForm } from"@/components/admin/note-form"

export const dynamic ="force-dynamic"

function formatDate(value: string | null): string {
 if (!value) return"—"
 const [y, m, d] = value.slice(0, 10).split("-")
 return y && m && d ? `${d}/${m}/${y}` : value
}

function formatDateTime(value: string): string {
 return new Intl.DateTimeFormat("pt-PT", {
 dateStyle:"short",
 timeStyle:"short",
 timeZone:"Atlantic/Cape_Verde",
 }).format(new Date(value))
}

function passengers(r: { adults: number; children: number; infants: number }) {
 const parts = [`${r.adults} ${r.adults === 1 ?"adulto" :"adultos"}`]
 if (r.children > 0)
 parts.push(`${r.children} ${r.children === 1 ?"criança" :"crianças"}`)
 if (r.infants > 0)
 parts.push(`${r.infants} ${r.infants === 1 ?"bebé" :"bebés"}`)
 return parts.join(" ·")
}

export default async function RequestDetailPage({
 params,
}: {
 params: { id: string }
}) {
 const request = await getTravelRequest(params.id)
 if (!request) notFound()

 const notes = await getRequestNotes(request.id)
 const lead = request.lead
 const phone = lead ? `${lead.phone_prefix ??""} ${lead.phone ??""}`.trim() :""

 return (
 <div className="space-y-6">
 <Link
 href="/admin"
 className="inline-flex items-center gap-2 text-sm font-medium text-adm-muted transition-colors hover:text-adm-txt"
 >
 <ArrowLeft className="h-4 w-4" />
 Todos os pedidos
 </Link>

 {/* Header */}
 <div className="flex flex-wrap items-start justify-between gap-4">
 <div>
 <p className="font-mono text-xs font-semibold text-adm-ember">
 {request.reference}
 </p>
 <h1 className="mt-1 text-2xl font-bold text-adm-txt">
 {request.origin} → {request.destination}
 </h1>
 <p className="mt-1 text-sm text-adm-muted">
 Recebido a {formatDateTime(request.created_at)} ·{""}
 {CHANNEL_LABELS[lead?.source_channel ??""] ??"—"}
 </p>
 </div>
 <span
 className={cn(
"rounded-full border px-3 py-1.5 text-sm font-medium",
 STATUS_STYLES[request.status]
 )}
 >
 {STATUS_LABELS[request.status]}
 </span>
 </div>

 {/* Email delivery warning */}
 {(!request.team_notified || !request.email_sent) && (
 <div className="flex items-start gap-3 rounded-xl border border-adm-warn/30 bg-adm-warn/10 p-4 text-sm">
 <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-adm-warn" />
 <div className="text-adm-warn">
 {!request.team_notified && (
 <p>A notificação por email para a equipa não foi entregue.</p>
 )}
 {!request.email_sent && (
 <p>
 O cliente <strong>não recebeu</strong> a confirmação por email —
 vale a pena contactá-lo diretamente.
 </p>
 )}
 </div>
 </div>
 )}

 <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
 {/* Left: details */}
 <div className="space-y-6 lg:col-span-2">
 <Panel title="Contacto">
 <dl className="divide-y divide-adm-line-soft">
 <Row label="Nome" value={lead?.full_name ??"—"} />
 <Row
 label="Email"
 value={
 lead?.email ? (
 <a
 href={`mailto:${lead.email}`}
 className="inline-flex items-center gap-1.5 font-medium text-adm-ember hover:text-adm-ember-dark"
 >
 <Mail className="h-3.5 w-3.5" />
 {lead.email}
 </a>
 ) : (
"—"
 )
 }
 />
 <Row
 label="Telefone"
 value={
 phone ? (
 <a
 href={`tel:${phone.replace(/\s+/g,"")}`}
 className="inline-flex items-center gap-1.5 font-medium text-adm-ember hover:text-adm-ember-dark"
 >
 <Phone className="h-3.5 w-3.5" />
 {phone}
 </a>
 ) : (
"—"
 )
 }
 />
 </dl>
 </Panel>

 <Panel title="Pedido">
 <dl className="divide-y divide-adm-line-soft">
 <Row
 label="Tipo de viagem"
 value={TRIP_TYPE_LABELS[request.trip_type] ?? request.trip_type}
 />
 <Row
 label="Trajeto"
 value={`${request.origin} → ${request.destination}`}
 />
 <Row label="Partida" value={formatDate(request.depart_date)} />
 {request.return_date && (
 <Row label="Regresso" value={formatDate(request.return_date)} />
 )}
 <Row label="Passageiros" value={passengers(request)} />
 <Row
 label="Classe"
 value={CABIN_LABELS[request.cabin_class] ?? request.cabin_class}
 />
 </dl>
 </Panel>

 <Panel title="Notas internas">
 <NoteForm id={request.id} />
 {notes.length > 0 && (
 <ul className="mt-5 space-y-3 border-t border-adm-line-soft pt-5">
 {notes.map((note) => (
 <li
 key={note.id}
 className="rounded-lg bg-adm-raise p-3 text-sm"
 >
 <p className="whitespace-pre-wrap text-adm-txt-2">
 {note.body}
 </p>
 <p className="mt-2 text-xs text-adm-muted">
 {note.author_email ??"Equipa"} ·{""}
 {formatDateTime(note.created_at)}
 </p>
 </li>
 ))}
 </ul>
 )}
 {notes.length === 0 && (
 <p className="mt-4 flex items-center gap-2 text-sm text-adm-muted">
 <MessageSquare className="h-4 w-4" />
 Ainda sem notas.
 </p>
 )}
 </Panel>
 </div>

 {/* Right: workflow */}
 <div className="space-y-6">
 <Panel title="Estado">
 <StatusSelector id={request.id} current={request.status} />
 </Panel>

 <Panel title="Ações">
 <div className="space-y-2">
 {lead?.email && (
 <a
 href={`mailto:${lead.email}?subject=${encodeURIComponent(
 `WeeFly · Pedido ${request.reference} (${request.origin} → ${request.destination})`
 )}`}
 className="flex w-full items-center justify-center gap-2 rounded-lg bg-adm-ember px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-adm-ember-dark"
 >
 <Mail className="h-4 w-4" />
 Responder ao cliente
 </a>
 )}
 {phone && (
 <a
 href={`tel:${phone.replace(/\s+/g,"")}`}
 className="flex w-full items-center justify-center gap-2 rounded-lg border border-adm-line px-4 py-2.5 text-sm font-semibold text-adm-txt-2 transition-colors hover:bg-adm-panel-2"
 >
 <Phone className="h-4 w-4" />
 Ligar
 </a>
 )}
 </div>
 </Panel>
 </div>
 </div>
 </div>
 )
}

function Panel({
 title,
 children,
}: {
 title: string
 children: React.ReactNode
}) {
 return (
 <section className="rounded-xl border border-adm-line bg-adm-panel p-5">
 <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-adm-muted">
 {title}
 </h2>
 {children}
 </section>
 )
}

function Row({
 label,
 value,
}: {
 label: string
 value: React.ReactNode
}) {
 return (
 <div className="flex items-center justify-between gap-4 py-2.5">
 <dt className="text-sm text-adm-muted">{label}</dt>
 <dd className="text-right text-sm font-medium text-adm-txt">{value}</dd>
 </div>
 )
}
