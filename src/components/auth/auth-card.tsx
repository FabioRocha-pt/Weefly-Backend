import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Card className="w-full max-w-xl border-0 shadow-lg">
      <CardHeader className="text-center p-8">
        <CardTitle className="text-3xl font-bold text-slate-900">{title}</CardTitle>
        {description && (
          <CardDescription className="text-slate-500 mt-2">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer && <div className="px-8 pb-8 text-center">{footer}</div>}
    </Card>
  )
}
