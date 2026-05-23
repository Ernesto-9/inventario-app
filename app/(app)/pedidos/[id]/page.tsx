import { createClient } from "@/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, User, Clock, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import PedidoActions from "./PedidoActions"
import type { PurchaseRequest, PurchaseRequestItem } from "@/types/database"

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
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default async function PedidoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: profile }, { data: request }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("purchase_requests")
      .select(`
        *,
        locations:location_id(name),
        created_by_profile:profiles!created_by(full_name),
        items:purchase_request_items(*)
      `)
      .eq("id", id)
      .single(),
  ])

  if (!request) notFound()

  const isAdmin = profile?.role === "admin" || profile?.role === "supervisor"
  if (!isAdmin && request.created_by !== user.id) redirect("/pedidos")

  const req = request as PurchaseRequest & {
    locations: { name: string } | null
    created_by_profile: { full_name: string } | null
    items: PurchaseRequestItem[]
  }

  const items = req.items ?? []
  const total = items.length
  const comprados = items.filter(i => i.status === "comprado").length
  const backHref = isAdmin ? "/compras" : "/pedidos"
  const backLabel = isAdmin ? "Compras" : "Mis pedidos"

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 md:px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href={backHref} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-bold text-lg flex-1 truncate">
            {req.locations?.name ?? "Sin obra"}
          </h1>
          <Badge variant={statusVariant[req.status]}>
            {statusLabel[req.status]}
          </Badge>
        </div>
      </div>

      <div className="px-4 md:px-6 py-5 space-y-5 max-w-2xl">
        {/* Meta */}
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 shrink-0" />
            <span>{req.created_by_profile?.full_name ?? "Desconocido"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{formatDate(req.created_at)}</span>
          </div>
          {req.notes && (
            <p className="italic pt-1 pl-6">{req.notes}</p>
          )}
        </div>

        {/* Progreso */}
        {total > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Package className="h-4 w-4" />
                {comprados} de {total} comprado{total !== 1 ? "s" : ""}
              </span>
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

        {/* Ítems + acciones */}
        <PedidoActions
          requestId={req.id}
          currentStatus={req.status}
          items={items}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  )
}
