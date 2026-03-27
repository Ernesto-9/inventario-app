import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, ArrowLeftRight, Package, MapPin, Plus, TrendingDown, TrendingUp } from "lucide-react"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: profile },
    { data: stockTotals },
    { data: recentMovements },
    { data: locationCount },
    { data: itemCount },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user!.id).single(),
    supabase.from("stock_totals").select("*").order("item_name"),
    supabase
      .from("movements")
      .select("id, type, quantity, created_at, items(name, unit), origin_location:origin_location_id(name), destination_location:destination_location_id(name)")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("locations").select("id", { count: "exact" }).eq("is_active", true),
    supabase.from("items").select("id", { count: "exact" }).eq("is_active", true),
  ])

  const lowStockItems = stockTotals?.filter(s => s.is_low_stock) ?? []
  const totalItems = stockTotals?.length ?? 0

  const movementTypeConfig = {
    entrada: { label: 'Entrada', icon: TrendingUp, color: 'text-green-600' },
    salida: { label: 'Salida', icon: TrendingDown, color: 'text-red-500' },
    transferencia: { label: 'Transfer.', icon: ArrowLeftRight, color: 'text-blue-500' },
    ajuste: { label: 'Ajuste', icon: Package, color: 'text-yellow-500' },
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hola, {profile?.full_name?.split(' ')[0] ?? 'Usuario'}</h1>
          <p className="text-muted-foreground text-sm capitalize">{profile?.role ?? 'supervisor'}</p>
        </div>
        <Button asChild>
          <Link href="/movements/new">
            <Plus className="h-4 w-4 mr-1" />Movimiento
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Artículos</p>
            <p className="text-2xl font-bold mt-1">{itemCount?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">en catálogo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ubicaciones</p>
            <p className="text-2xl font-bold mt-1">{locationCount?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">activas</p>
          </CardContent>
        </Card>
        <Card className={lowStockItems.length > 0 ? "border-yellow-300" : ""}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Stock bajo</p>
            <p className={`text-2xl font-bold mt-1 ${lowStockItems.length > 0 ? 'text-yellow-600' : ''}`}>
              {lowStockItems.length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">artículos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Con inventario</p>
            <p className="text-2xl font-bold mt-1">
              {stockTotals?.filter(s => s.total_quantity > 0).length ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">de {totalItems}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas de stock bajo */}
      {lowStockItems.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="h-4 w-4" />
              Artículos bajo el stock mínimo
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {lowStockItems.slice(0, 5).map(item => (
              <Link key={item.item_id} href={`/items/${item.item_id}`} className="flex items-center justify-between py-1.5 hover:bg-yellow-100/50 rounded px-2 -mx-2 transition-colors">
                <div>
                  <p className="text-sm font-medium text-yellow-900">{item.item_name}</p>
                  {item.category_name && <p className="text-xs text-yellow-700">{item.category_name}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-yellow-600">{item.total_quantity} {item.unit}</p>
                  <p className="text-xs text-yellow-700">mín: {item.min_stock}</p>
                </div>
              </Link>
            ))}
            {lowStockItems.length > 5 && (
              <Link href="/reports" className="block text-xs text-yellow-700 hover:underline pt-1">
                +{lowStockItems.length - 5} artículos más →
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { href: '/movements/new', label: 'Nuevo movimiento', icon: ArrowLeftRight },
          { href: '/items/new', label: 'Nuevo artículo', icon: Package },
          { href: '/locations/new', label: 'Nueva ubicación', icon: MapPin },
          { href: '/reports', label: 'Ver reportes', icon: TrendingUp },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <p className="text-xs font-medium leading-tight">{label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Actividad reciente */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Actividad reciente</span>
            <Link href="/movements" className="text-xs text-muted-foreground hover:underline font-normal">
              Ver todo →
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentMovements?.length ? (
            <div className="divide-y">
              {recentMovements.map(mov => {
                const cfg = movementTypeConfig[mov.type as keyof typeof movementTypeConfig]
                const Icon = cfg.icon
                const item = mov.items as unknown as { name: string; unit: string } | null
                const origin = mov.origin_location as unknown as { name: string } | null
                const dest = mov.destination_location as unknown as { name: string } | null
                return (
                  <Link key={mov.id} href={`/movements/${mov.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                    <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item?.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {cfg.label}
                        {mov.type === 'entrada' && dest && ` → ${dest.name}`}
                        {mov.type === 'salida' && origin && ` ← ${origin.name}`}
                        {mov.type === 'transferencia' && origin && dest && ` ${origin.name} → ${dest.name}`}
                        {' · '}{new Date(mov.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums shrink-0">{mov.quantity} {item?.unit}</span>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin movimientos aún.</p>
              <Button asChild size="sm" className="mt-3">
                <Link href="/movements/new">Registrar primero</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
