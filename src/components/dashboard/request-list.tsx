import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Request } from "@/types"
import { Calendar, Send, Eye } from "lucide-react"

interface RequestListProps {
  requests: Request[]
  dark?: boolean
}

const STATUS_LABELS: Record<Request["status"], { label: string; variant: "novo" | "proposta" | "confirmada" }> = {
  novo: { label: "Novo", variant: "novo" },
  proposta: { label: "Proposta", variant: "proposta" },
  confirmada: { label: "Confirmada", variant: "confirmada" },
  rejeitada: { label: "Rejeitada", variant: "proposta" },
}

export function RequestList({ requests, dark }: RequestListProps) {
  return (
    <Card className={cn("border-0 shadow-sm", dark ? "bg-gray-800" : "bg-white")}>
      <CardHeader className={cn("pb-4", dark ? "border-gray-700" : "border-slate-100")}>
        <CardTitle className={cn("text-lg", dark ? "text-white" : "text-slate-900")}>
          Pedidos de terceiros
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className={cn(
                "p-4 rounded-xl border",
                dark
                  ? "bg-gray-700/50 border-gray-700"
                  : "bg-slate-50 border-slate-100"
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className={cn("font-semibold", dark ? "text-white" : "text-slate-900")}>
                    {request.clientName}
                  </h4>
                  <p className={cn("text-sm", dark ? "text-gray-400" : "text-slate-500")}>
                    {request.service}
                  </p>
                </div>
                <Badge variant={STATUS_LABELS[request.status].variant}>
                  {STATUS_LABELS[request.status].label}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className={cn("text-sm", dark ? "text-gray-400" : "text-slate-500")}>
                  {request.date}
                </span>
                <div className="flex items-center space-x-2">
                  {request.status === "novo" && (
                    <Button size="sm" variant="ghost" className="h-8">
                      <Calendar className="w-4 h-4 mr-1" />
                      Agendar
                    </Button>
                  )}
                  {request.status === "proposta" && (
                    <Button size="sm" variant="ghost" className="h-8">
                      <Send className="w-4 h-4 mr-1" />
                      Reenviar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8">
                    <Eye className="w-4 h-4 mr-1" />
                    Detalhes
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
