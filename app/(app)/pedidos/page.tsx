import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Plus, Package, MapPin, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { PurchaseRequest } from "@/types/database"

const statusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completada: "Completada",
  cancelada: "Cancelada",
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pendiente: "default",
  en_proceso: "secondary",
  completada: "outline",
  cancelada: "destructive",
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default async function PedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: requests } = await supabase
    .from("purchase_requests")
    .select(`
      *,
      locations:location_id(id, name),
      purchase_request_items(id, status)
    `)
    .eq("created_by", user!.id)
    .order("created_at", { ascending: false })

  const typedRequests = (requests ?? []) as (PurchaseRequest & {
    locations: { id: string; name: string } | null
    purchase_request_items: { id: string; status: string }[]
  })[]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Mis pedidos</h1>
          <Link
            href="/pedidos/nuevo"
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4" />
            Nuevo
          </Link>
        </div>
      </div>

      {/* Lista */}
      <div className="px-4 py-4 space-y-3">
        {typedRequests.length === 0 && (
          <div className="text-center py-16">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No tienes pedidos todavía</p>
            <Link
              href="/pedidos/nuevo"
              className="mt-4 inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Crear primer pedido
            </Link>
          </div>
        )}

        {typedRequests.map((req) => {
          const total = req.purchase_request_items?.length ?? 0
          const comprados = req.purchase_request_items?.filter(i => i.status === "comprado").length ?? 0

          return (
            <div
              key={req.id}
              className="bg-card border rounded-xl p-4 space-y-3"
            >
              {/* Obra + status */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-base truncate">
                    {req.locations?.name ?? "Sin obra"}
                  </span>
                </div>
                <Badge variant={statusVariant[req.status]}>
                  {statusLabel[req.status]}
                </Badge>
              </div>

              {/* Progreso de artículos */}
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {total === 0
                    ? "Sin artículos"
                    : req.status === "completada"
                    ? `${total} artículo${total !== 1 ? "s" : ""} comprado${total !== 1 ? "s" : ""}`
                    : `${comprados} de ${total} comprado${total !== 1 ? "s" : ""}`}
                </span>
              </div>

              {/* Barra de progreso */}
              {total > 0 && req.status !== "cancelada" && (
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all"
                    style={{ width: `${(comprados / total) * 100}%` }}
                  />
                </div>
              )}

              {/* Nota */}
              {req.notes && (
                <p className="text-sm text-muted-foreground italic">{req.notes}</p>
              )}

              {/* Fecha */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatDate(req.created_at)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
