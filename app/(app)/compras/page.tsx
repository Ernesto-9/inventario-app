import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Route, Package, MapPin, User, Clock, CheckCircle2 } from "lucide-react"
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
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default async function ComprasPage() {
  const supabase = await createClient()

  const { data: requests } = await supabase
    .from("purchase_requests")
    .select(`
      *,
      locations:location_id(id, name, type),
      profiles:created_by(id, full_name),
      purchase_request_items(id, status, item_name)
    `)
    .neq("status", "cancelada")
    .order("created_at", { ascending: false })

  type RequestWithJoins = PurchaseRequest & {
    locations: { id: string; name: string; type: string } | null
    profiles: { id: string; full_name: string } | null
    purchase_request_items: { id: string; status: string; item_name: string }[]
  }

  const allRequests = (requests ?? []) as RequestWithJoins[]

  const pending = allRequests.filter(r => r.status === "pendiente" || r.status === "en_proceso")
  const completed = allRequests.filter(r => r.status === "completada")

  const totalPendingItems = pending.reduce(
    (acc, r) => acc + (r.purchase_request_items?.filter(i => i.status === "pendiente").length ?? 0),
    0
  )

  return (
    <div className="flex flex-col gap-0 min-h-screen">
      {/* Header */}
      <div className="border-b px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pedidos de compra</h1>
            {totalPendingItems > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {totalPendingItems} artículo{totalPendingItems !== 1 ? "s" : ""} por comprar
              </p>
            )}
          </div>
          {pending.length > 0 && (
            <Link
              href="/compras/ruta"
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Route className="h-4 w-4" />
              Armar ruta
            </Link>
          )}
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Pendientes */}
        {pending.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Activos ({pending.length})
            </h2>
            {pending.map(req => {
              const total = req.purchase_request_items?.length ?? 0
              const comprados = req.purchase_request_items?.filter(i => i.status === "comprado").length ?? 0

              return (
                <Link key={req.id} href={`/pedidos/${req.id}`} className="block border rounded-xl p-5 bg-card space-y-3 hover:bg-accent/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-base truncate">
                          {req.locations?.name ?? "Sin obra"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        {req.profiles?.full_name ?? "Desconocido"}
                      </div>
                    </div>
                    <Badge variant={statusVariant[req.status]}>
                      {statusLabel[req.status]}
                    </Badge>
                  </div>

                  {/* Items preview */}
                  {total > 0 && (
                    <div className="space-y-1">
                      {req.purchase_request_items.slice(0, 3).map(item => (
                        <div key={item.id} className="flex items-center gap-2 text-sm">
                          <div className={`h-1.5 w-1.5 rounded-full ${item.status === "comprado" ? "bg-green-500" : "bg-muted-foreground"}`} />
                          <span className={item.status === "comprado" ? "line-through text-muted-foreground" : ""}>
                            {item.item_name}
                          </span>
                        </div>
                      ))}
                      {total > 3 && (
                        <p className="text-xs text-muted-foreground pl-3.5">
                          +{total - 3} más
                        </p>
                      )}
                    </div>
                  )}

                  {/* Progreso */}
                  {total > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{comprados} de {total} comprado{total !== 1 ? "s" : ""}</span>
                        <span>{Math.round((comprados / total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all"
                          style={{ width: `${(comprados / total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {req.notes && (
                    <p className="text-sm text-muted-foreground italic">{req.notes}</p>
                  )}

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(req.created_at)}
                  </div>
                </Link>
              )
            })}
          </section>
        )}

        {pending.length === 0 && (
          <div className="text-center py-16 border rounded-xl bg-card">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
            <p className="font-medium">No hay pedidos pendientes</p>
            <p className="text-sm text-muted-foreground mt-1">Todo está al día.</p>
          </div>
        )}

        {/* Completados */}
        {completed.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Completados ({completed.length})
            </h2>
            {completed.map(req => {
              const total = req.purchase_request_items?.length ?? 0

              return (
                <Link key={req.id} href={`/pedidos/${req.id}`} className="block border rounded-xl p-4 bg-card/50 opacity-70 space-y-2 hover:opacity-90 transition-opacity">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{req.locations?.name ?? "Sin obra"}</span>
                      <span className="text-xs text-muted-foreground shrink-0">— {req.profiles?.full_name}</span>
                    </div>
                    <Badge variant="outline">{total} art.</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(req.created_at)}
                  </div>
                </Link>
              )
            })}
          </section>
        )}
      </div>
    </div>
  )
}
