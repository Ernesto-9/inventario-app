import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, FileText, Package, Clock } from "lucide-react"
import type { Quotation } from "@/types/database"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default async function CotizacionesPage() {
  const supabase = await createClient()

  const { data: quotations } = await supabase
    .from("quotations")
    .select("*, quotation_items(id)")
    .order("created_at", { ascending: false })

  const rows = (quotations ?? []) as (Quotation & { quotation_items: { id: string }[] })[]

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cotizaciones</h1>
          <p className="text-muted-foreground text-sm">Listas de artículos para pedir precios</p>
        </div>
        <Button asChild>
          <Link href="/cotizaciones/nueva"><Plus className="h-4 w-4 mr-1" />Nueva</Link>
        </Button>
      </div>

      {rows.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No hay cotizaciones todavía.</p>
          <Button asChild className="mt-4">
            <Link href="/cotizaciones/nueva">Crear primera cotización</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(q => {
          const total = q.quotation_items?.length ?? 0
          return (
            <Link key={q.id} href={`/cotizaciones/${q.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium truncate flex-1">
                      {q.name || "Cotización sin nombre"}
                    </p>
                    <Badge variant={q.status === "abierta" ? "default" : "outline"}>
                      {q.status === "abierta" ? "Abierta" : "Cerrada"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {total} artículo{total !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(q.created_at)}
                    </span>
                  </div>
                  {q.notes && (
                    <p className="text-xs text-muted-foreground italic truncate">{q.notes}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
