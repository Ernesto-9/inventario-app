"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Search, Package, ArrowLeftRight, MapPin, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

type Tab = "articulos" | "movimientos" | "ubicaciones"

const movTypeConfig = {
  entrada: { label: 'Entrada', color: 'text-green-600', icon: TrendingUp },
  salida: { label: 'Salida', color: 'text-red-500', icon: TrendingDown },
  transferencia: { label: 'Transfer.', color: 'text-blue-500', icon: ArrowLeftRight },
  ajuste: { label: 'Ajuste', color: 'text-yellow-500', icon: Package },
}

export default function BuscarPage() {
  const supabase = createClient()
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<Tab>("articulos")
  const [items, setItems] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    const [itemsRes, movRes, locRes] = await Promise.all([
      supabase
        .from("stock_totals")
        .select("item_id, item_name, unit, min_stock, total_quantity, is_low_stock, category_name, sku"),
      supabase
        .from("movements")
        .select("id, type, quantity, created_at, supplier, reference_number, items(name, unit), origin_location:origin_location_id(name), destination_location:destination_location_id(name), responsible:responsible_id(full_name)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("locations")
        .select("id, name, type, description, is_active"),
    ])
    setItems(itemsRes.data ?? [])
    setMovements(movRes.data ?? [])
    setLocations(locRes.data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadAll() }, [loadAll])

  const q = query.toLowerCase()

  const filteredItems = items.filter(i =>
    !q ||
    i.item_name?.toLowerCase().includes(q) ||
    i.sku?.toLowerCase().includes(q) ||
    i.category_name?.toLowerCase().includes(q)
  )

  const filteredMovements = movements.filter(m => {
    if (!q) return true
    const item = m.items as any
    const origin = m.origin_location as any
    const dest = m.destination_location as any
    const resp = m.responsible as any
    return (
      item?.name?.toLowerCase().includes(q) ||
      m.type?.toLowerCase().includes(q) ||
      m.supplier?.toLowerCase().includes(q) ||
      m.reference_number?.toLowerCase().includes(q) ||
      origin?.name?.toLowerCase().includes(q) ||
      dest?.name?.toLowerCase().includes(q) ||
      resp?.full_name?.toLowerCase().includes(q) ||
      m.created_at?.includes(q)
    )
  })

  const filteredLocations = locations.filter(l =>
    !q ||
    l.name?.toLowerCase().includes(q) ||
    l.type?.toLowerCase().includes(q) ||
    l.description?.toLowerCase().includes(q)
  )

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Buscar</h1>
        <p className="text-muted-foreground text-sm">Artículos, movimientos y ubicaciones</p>
      </div>

      {/* Barra de búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, proveedor, fecha, ubicación..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: "articulos", label: `Artículos (${filteredItems.length})` },
          { key: "movimientos", label: `Movimientos (${filteredMovements.length})` },
          { key: "ubicaciones", label: `Ubicaciones (${filteredLocations.length})` },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <>
          {/* Artículos */}
          {tab === "articulos" && (
            <div className="space-y-2">
              {filteredItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sin resultados</p>
              ) : filteredItems.map(item => (
                <Link key={item.item_id} href={`/items/${item.item_id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{item.item_name}</p>
                          {item.is_low_stock && <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.category_name && (
                            <span className="text-xs text-muted-foreground">{item.category_name}</span>
                          )}
                          {item.sku && <span className="text-xs text-muted-foreground">· SKU: {item.sku}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold text-sm ${item.is_low_stock ? 'text-yellow-600' : ''}`}>
                          {item.total_quantity} {item.unit}
                        </p>
                        {item.min_stock > 0 && (
                          <p className="text-xs text-muted-foreground">mín: {item.min_stock}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {/* Movimientos */}
          {tab === "movimientos" && (
            <div className="space-y-2">
              {filteredMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sin resultados</p>
              ) : filteredMovements.map(mov => {
                const cfg = movTypeConfig[mov.type as keyof typeof movTypeConfig]
                const Icon = cfg?.icon ?? Package
                const item = mov.items as any
                const origin = mov.origin_location as any
                const dest = mov.destination_location as any
                const resp = mov.responsible as any
                return (
                  <Link key={mov.id} href={`/movements/${mov.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-3 flex items-start gap-3">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg?.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{cfg?.label}</Badge>
                            <span className="font-medium text-sm truncate">{item?.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {mov.type === 'entrada' && dest && `→ ${dest.name}`}
                            {mov.type === 'salida' && origin && `← ${origin.name}`}
                            {mov.type === 'transferencia' && origin && dest && `${origin.name} → ${dest.name}`}
                            {mov.type === 'ajuste' && origin && origin.name}
                            {resp && ` · ${resp.full_name}`}
                            {mov.supplier && ` · ${mov.supplier}`}
                            {mov.reference_number && ` · ${mov.reference_number}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(mov.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-sm tabular-nums">{mov.quantity} {item?.unit}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Ubicaciones */}
          {tab === "ubicaciones" && (
            <div className="space-y-2">
              {filteredLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sin resultados</p>
              ) : filteredLocations.map(loc => (
                <Link key={loc.id} href={`/locations/${loc.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{loc.name}</p>
                          {loc.description && (
                            <p className="text-xs text-muted-foreground truncate">{loc.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs capitalize">{loc.type}</Badge>
                        {!loc.is_active && <Badge variant="secondary" className="text-xs">Inactivo</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
