import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Download, Package } from "lucide-react"
import { ExportCSVButton } from "./ExportCSVButton"

export default async function ReportsPage() {
  const supabase = await createClient()

  const [{ data: stockTotals }, { data: stockByLocation }] = await Promise.all([
    supabase.from("stock_totals").select("*").order("is_low_stock", { ascending: false }).order("item_name"),
    supabase.from("stock_by_location").select("*").gt("quantity", 0).order("item_name").order("location_name"),
  ])

  const lowStock = stockTotals?.filter(s => s.is_low_stock) ?? []

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-muted-foreground text-sm">Estado actual del inventario</p>
        </div>
        <ExportCSVButton data={stockTotals ?? []} filename="inventario" />
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total artículos</p>
            <p className="text-2xl font-bold mt-1">{stockTotals?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card className={lowStock.length > 0 ? "border-yellow-300" : ""}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Bajo mínimo</p>
            <p className={`text-2xl font-bold mt-1 ${lowStock.length > 0 ? 'text-yellow-600' : ''}`}>{lowStock.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sin stock</p>
            <p className="text-2xl font-bold mt-1">{stockTotals?.filter(s => s.total_quantity === 0).length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Stock bajo mínimo */}
      {lowStock.length > 0 && (
        <Card className="border-yellow-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="h-4 w-4" />
              Bajo stock mínimo ({lowStock.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {lowStock.map(item => (
                <Link key={item.item_id} href={`/items/${item.item_id}`} className="flex items-center justify-between px-4 py-3 hover:bg-yellow-50 transition-colors">
                  <div>
                    <p className="font-medium text-sm">{item.item_name}</p>
                    {item.category_name && <p className="text-xs text-muted-foreground">{item.category_name}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-yellow-600 text-sm">{item.total_quantity} {item.unit}</p>
                    <p className="text-xs text-muted-foreground">mín: {item.min_stock}</p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock completo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4" />
            Stock actual — todos los artículos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stockTotals?.length ? (
            <div className="divide-y">
              {stockTotals.map(item => (
                <Link key={item.item_id} href={`/items/${item.item_id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{item.item_name}</p>
                      {item.is_low_stock && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.category_name && (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{ borderColor: item.category_color ?? undefined, color: item.category_color ?? undefined }}
                        >
                          {item.category_name}
                        </Badge>
                      )}
                      {item.sku && <span className="text-xs text-muted-foreground">SKU: {item.sku}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`font-bold text-sm ${item.is_low_stock ? 'text-yellow-600' : item.total_quantity === 0 ? 'text-muted-foreground' : ''}`}>
                      {item.total_quantity} {item.unit}
                    </p>
                    {item.min_stock > 0 && (
                      <p className="text-xs text-muted-foreground">mín: {item.min_stock}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin artículos en inventario.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stock por ubicación */}
      {stockByLocation && stockByLocation.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Detalle por ubicación</CardTitle>
              <ExportCSVButton
                data={stockByLocation}
                filename="stock-por-ubicacion"
                label="Exportar detalle"
                size="sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {stockByLocation.map(row => (
                <div key={row.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.item_name}</p>
                    <div className="flex items-center gap-1.5">
                      <Link href={`/locations/${row.location_id}`} className="text-xs text-muted-foreground hover:underline truncate">
                        {row.location_name}
                      </Link>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">{row.location_type}</Badge>
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums ml-3 shrink-0">
                    {row.quantity} <span className="text-muted-foreground font-normal text-xs">{row.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
