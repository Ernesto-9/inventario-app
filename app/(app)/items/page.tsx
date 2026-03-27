import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, Package, AlertTriangle } from "lucide-react"

export default async function ItemsPage() {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from("stock_totals")
    .select("*")
    .order("item_name")

  const lowStock = items?.filter(i => i.is_low_stock) ?? []

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Artículos</h1>
          <p className="text-muted-foreground text-sm">Catálogo de inventario</p>
        </div>
        <Button asChild>
          <Link href="/items/new"><Plus className="h-4 w-4 mr-1" />Nuevo</Link>
        </Button>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              {lowStock.length} artículo{lowStock.length > 1 ? 's' : ''} bajo el stock mínimo
            </p>
            <p className="text-xs text-yellow-700 mt-0.5">
              {lowStock.slice(0, 3).map(i => i.item_name).join(', ')}{lowStock.length > 3 ? ` y ${lowStock.length - 3} más` : ''}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items?.map((item) => (
          <Link key={item.item_id} href={`/items/${item.item_id}`}>
            <Card className={`hover:shadow-md transition-shadow cursor-pointer ${item.is_low_stock ? 'border-yellow-300' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.item_name}</p>
                    {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                  </div>
                  {item.is_low_stock && (
                    <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                  )}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div>
                    {item.category_name && (
                      <Badge
                        variant="outline"
                        style={{ borderColor: item.category_color ?? undefined, color: item.category_color ?? undefined }}
                        className="text-xs"
                      >
                        {item.category_name}
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`text-lg font-bold ${item.is_low_stock ? 'text-yellow-600' : ''}`}>
                      {item.total_quantity}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                  </div>
                </div>

                {item.is_low_stock && (
                  <p className="text-xs text-yellow-600 mt-1">
                    Mínimo: {item.min_stock} {item.unit}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {!items?.length && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No hay artículos en el catálogo.</p>
          <Button asChild className="mt-4">
            <Link href="/items/new">Agregar primer artículo</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
