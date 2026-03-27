import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, ArrowLeftRight, Package } from "lucide-react"
import type { LocationType } from "@/types/database"

const typeLabels: Record<LocationType, string> = {
  'almacén': 'Almacén', 'obra': 'Obra', 'vehículo': 'Vehículo', 'empleado': 'Empleado', 'otro': 'Otro',
}

const movementTypeLabels = {
  entrada: { label: 'Entrada', color: 'success' as const },
  salida: { label: 'Salida', color: 'destructive' as const },
  transferencia: { label: 'Transferencia', color: 'secondary' as const },
  ajuste: { label: 'Ajuste', color: 'warning' as const },
}

export default async function LocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: location }, { data: stockRows }, { data: movements }] = await Promise.all([
    supabase.from("locations").select("*").eq("id", id).single(),
    supabase.from("stock_by_location").select("*").eq("location_id", id).gt("quantity", 0).order("item_name"),
    supabase
      .from("movements")
      .select("*, items(name, unit), origin_location:origin_location_id(name), destination_location:destination_location_id(name), responsible:responsible_id(full_name)")
      .or(`origin_location_id.eq.${id},destination_location_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  if (!location) notFound()

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/locations"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{location.name}</h1>
            <Badge variant="outline">{typeLabels[location.type as LocationType]}</Badge>
            {!location.is_active && <Badge variant="secondary">Inactivo</Badge>}
          </div>
          {location.description && <p className="text-sm text-muted-foreground">{location.description}</p>}
        </div>
        <Button asChild size="sm">
          <Link href={`/movements/new?location=${id}`}>
            <ArrowLeftRight className="h-4 w-4 mr-1" />Nuevo movimiento
          </Link>
        </Button>
      </div>

      {/* Stock en esta ubicación */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Inventario en esta ubicación
            <span className="text-muted-foreground font-normal text-sm">({stockRows?.length ?? 0} artículos)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stockRows?.length ? (
            <div className="divide-y">
              {stockRows.map((row) => (
                <div key={row.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <Link href={`/items/${row.item_id}`} className="font-medium hover:underline">
                      {row.item_name}
                    </Link>
                    {row.sku && <p className="text-xs text-muted-foreground">SKU: {row.sku}</p>}
                  </div>
                  <span className="font-semibold tabular-nums">
                    {row.quantity} <span className="text-muted-foreground font-normal text-sm">{row.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sin inventario en esta ubicación</p>
          )}
        </CardContent>
      </Card>

      {/* Historial de movimientos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Movimientos recientes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {movements?.length ? (
            <div className="divide-y">
              {movements.map((mov) => {
                const cfg = movementTypeLabels[mov.type as keyof typeof movementTypeLabels]
                return (
                  <Link key={mov.id} href={`/movements/${mov.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={cfg.color}>{cfg.label}</Badge>
                        <span className="font-medium text-sm truncate">{(mov.items as { name: string } | null)?.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(mov.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {(mov.responsible as { full_name: string } | null)?.full_name && ` · ${(mov.responsible as { full_name: string }).full_name}`}
                      </p>
                    </div>
                    <span className="ml-3 font-semibold tabular-nums shrink-0">
                      {mov.quantity} <span className="text-muted-foreground font-normal text-sm">{(mov.items as { unit: string } | null)?.unit}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sin movimientos registrados</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
