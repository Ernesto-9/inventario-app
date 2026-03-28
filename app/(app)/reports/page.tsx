import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Package, TrendingDown, TrendingUp, Users } from "lucide-react"
import Link from "next/link"
import { ExportCSVButton } from "./ExportCSVButton"
import { StockSearch } from "./StockSearch"

export default async function ReportsPage() {
  const supabase = await createClient()

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: stockTotals },
    { data: weeklyEntradas },
    { data: recentSalidas },
    { data: allEntradas },
  ] = await Promise.all([
    supabase.from("stock_totals").select("*").order("is_low_stock", { ascending: false }).order("item_name"),
    supabase.from("movements").select("quantity, unit_cost").eq("type", "entrada").gte("created_at", oneWeekAgo).not("unit_cost", "is", null),
    supabase.from("movements").select("item_id, quantity, items(name, unit)").eq("type", "salida").gte("created_at", thirtyDaysAgo),
    supabase.from("movements").select("supplier, quantity, unit_cost").eq("type", "entrada").not("supplier", "is", null),
  ])

  const lowStock = stockTotals?.filter(s => s.is_low_stock) ?? []

  // Gastos semanales
  const weeklySpend = weeklyEntradas?.reduce((sum, m) => sum + ((m.quantity ?? 0) * (m.unit_cost ?? 0)), 0) ?? 0

  // Top artículos más usados (últimos 30 días)
  const usageMap = new Map<string, { name: string; unit: string; total: number }>()
  for (const mov of recentSalidas ?? []) {
    const item = mov.items as unknown as { name: string; unit: string } | null
    if (!item) continue
    const existing = usageMap.get(mov.item_id) ?? { name: item.name, unit: item.unit, total: 0 }
    usageMap.set(mov.item_id, { ...existing, total: existing.total + (mov.quantity ?? 0) })
  }
  const topItems = Array.from(usageMap.values()).sort((a, b) => b.total - a.total).slice(0, 10)

  // Top proveedores
  const supplierMap = new Map<string, { count: number; total: number }>()
  for (const mov of allEntradas ?? []) {
    if (!mov.supplier) continue
    const existing = supplierMap.get(mov.supplier) ?? { count: 0, total: 0 }
    supplierMap.set(mov.supplier, {
      count: existing.count + 1,
      total: existing.total + ((mov.quantity ?? 0) * (mov.unit_cost ?? 0)),
    })
  }
  const topSuppliers = Array.from(supplierMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-muted-foreground text-sm">Análisis del inventario</p>
        </div>
        <ExportCSVButton data={stockTotals ?? []} filename="inventario" />
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total artículos</p>
            <p className="text-2xl font-bold mt-1">{stockTotals?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">en catálogo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Gastos esta semana</p>
            <p className="text-2xl font-bold mt-1">
              ${weeklySpend.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">en entradas</p>
          </CardContent>
        </Card>
        <Card className={lowStock.length > 0 ? "border-yellow-300" : ""}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Stock bajo</p>
            <p className={`text-2xl font-bold mt-1 ${lowStock.length > 0 ? 'text-yellow-600' : ''}`}>{lowStock.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">artículos</p>
          </CardContent>
        </Card>
      </div>

      {/* Artículos más usados */}
      {topItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Más usados — últimos 30 días
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {topItems.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-4 text-right">{i + 1}</span>
                    <p className="text-sm font-medium">{item.name}</p>
                  </div>
                  <p className="text-sm font-bold tabular-nums">{item.total} <span className="text-muted-foreground font-normal text-xs">{item.unit}</span></p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top proveedores */}
      {topSuppliers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Top proveedores
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {topSuppliers.map((s, i) => (
                <div key={s.name} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-4 text-right">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.count} compra{s.count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  {s.total > 0 && (
                    <p className="text-sm font-bold tabular-nums">
                      ${s.total.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Stock actual con búsqueda */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" />
              Stock actual
            </CardTitle>
            <ExportCSVButton data={stockTotals ?? []} filename="stock-actual" label="CSV" size="sm" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {stockTotals?.length ? (
            <StockSearch items={stockTotals as any} />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin artículos en inventario.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
