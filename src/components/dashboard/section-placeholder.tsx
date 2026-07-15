import Link from "next/link"
import { Button } from "@/components/ui/button"

interface SectionPlaceholderProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: { label: string; href: string }
}

export function SectionPlaceholder({ icon, title, description, action }: SectionPlaceholderProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-50 flex items-center justify-center mb-6">
          {icon}
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">{title}</h2>
        <p className="text-slate-500 mb-6">{description}</p>
        {action && (
          <Link href={action.href}>
            <Button>{action.label}</Button>
          </Link>
        )}
      </div>
    </div>
  )
}
