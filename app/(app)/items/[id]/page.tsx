import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, ArrowLeftRight, AlertTriangle, MapPin } from "lucide-react"

const movementTypeLabels = {
  entrada: { label: 'Entrada', color: 'success' as const },
  salida: { label: 'Salida', color: 'destructive' as const },
  transferencia: { label: 'Transferencia', color: 'secondary' as const },
  ajuste: { label: 'Ajuste', color: 'warning' as const },
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: item }, { data: stockData }, { data: movements }, { data: stockTotal }] = await Promise.all([
    supabase.from("items").select("*, categories(name, color)").eq("id", id).single(),
    supabase.from("stock_by_location").select("*").eq("item_id", id).gt("quantity", 0).order("quantity", { ascending: false }),
    supabase
      .from("movements")
      .select("*, origin_location:origin_location_id(name), destination_location:destination_location_id(name), responsible:responsible_id(full_name)")
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("stock_totals").select("*").eq("item_id", id).single(),
  ])

  if (!item) notFound()

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild className="mt-0.5">
          <Link href="/items"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{item.name}</h1>
            {stockTotal?.is_low_stock && (
              <Badge variant="warning" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />Stock bajo
              </Badge>
            )}
          </div>
          {item.sku && <p className="text-sm text-muted-foreground">SKU: {item.sku}</p>}
          {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {(item.categories as { name: string; color: string } | null) && (
              <Badge variant="outline" style={{ borderColor: (item.categories as { name: string; color: string }).color, color: (item.categories as { name: string; color: string }).color }}>
                {(item.categories as { name: string; color: string }).name}
              </Badge>
            )}
            <Badge variant="secondary">{item.unit}</Badge>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href={`/movements/new?item=${id}`}>
            <ArrowLeftRight className="h-4 w-4 mr-1" />Mover
          </Link>
        </Button>
      </div>

      {/* Stock total */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Stock total</p>
            <p className={`text-3xl font-bold mt-1 ${stockTotal?.is_low_stock ? 'text-yellow-600' : ''}`}>
              {stockTotal?.total_quantity ?? 0}
              <span className="text-base font-normal text-muted-foreground ml-1">{item.unit}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Stock mínimo</p>
            <p className="text-3xl font-bold mt-1">
              {item.min_stock}
              <span className="text-base font-normal text-muted-foreground ml-1">{item.unit}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribución por ubicación */}
      {stockData && stockData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Distribución por ubicación
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {stockData.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3">
                  <Link href={`/locations/${s.location_id}`} className="hover:underline">
                    <p className="font-medium text-sm">{s.location_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{s.location_type}</p>
                  </Link>
                  <span className="font-semibold tabular-nums">
                    {s.quantity} <span className="text-muted-foreground font-normal text-sm">{s.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historial de movimientos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Historial de movimientos
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
                        <span className="text-xs text-muted-foreground">
                          {mov.type === 'entrada' && (mov.destination_location as { name: string } | null)?.name}
                          {mov.type === 'salida' && (mov.origin_location as { name: string } | null)?.name}
                          {mov.type === 'transferencia' && `${(mov.origin_location as { name: string } | null)?.name} → ${(mov.destination_location as { name: string } | null)?.name}`}
                          {mov.type === 'ajuste' && (mov.origin_location as { name: string } | null)?.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(mov.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {(mov.responsible as { full_name: string } | null)?.full_name && ` · ${(mov.responsible as { full_name: string }).full_name}`}
                      </p>
                    </div>
                    <span className="ml-3 font-semibold tabular-nums shrink-0">
                      {mov.quantity} <span className="text-muted-foreground font-normal text-sm">{item.unit}</span>
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
