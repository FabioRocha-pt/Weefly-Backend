import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

interface StatsCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  trend?: {
    value: string
    isPositive: boolean
  }
  className?: string
  dark?: boolean
}

export function StatsCard({ title, value, icon, trend, className, dark }: StatsCardProps) {
  return (
    <Card className={cn("border-0 shadow-sm", dark ? "bg-gray-800" : "bg-white", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className={cn("text-sm font-medium", dark ? "text-gray-400" : "text-slate-500")}>
              {title}
            </p>
            <p className={cn("text-2xl font-bold mt-1", dark ? "text-white" : "text-slate-900")}>
              {value}
            </p>
            {trend && (
              <p
                className={cn(
                  "text-xs font-medium mt-2 flex items-center",
                  trend.isPositive ? "text-green-500" : "text-red-500"
                )}
              >
                <span>{trend.isPositive ? "↑" : "↓"}</span>
                <span className="ml-1">{trend.value}</span>
              </p>
            )}
          </div>
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              dark ? "bg-orange-600/20 text-orange-500" : "bg-orange-100 text-orange-600"
            )}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
