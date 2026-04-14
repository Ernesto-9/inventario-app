"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Package, AlertTriangle, Search, Pencil, Trash2, Loader2 } from "lucide-react"
import type { StockTotal, StockByLocation, Category } from "@/types/database"
import { toast } from "@/hooks/use-toast"

interface LastEntry {
  item_id: string
  created_at: string
  supplier: string | null
}

interface EditForm {
  name: string
  variant_info: string
  sku: string
  unit: string
  min_stock: string
  category_id: string
  description: string
}

export default function InventarioPage() {
  const supabase = createClient()

  const [items, setItems] = useState<StockTotal[]>([])
  const [locationMap, setLocationMap] = useState<Map<string, StockByLocation[]>>(new Map())
  const [lastEntries, setLastEntries] = useState<Map<string, LastEntry>>(new Map())
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: "", variant_info: "", sku: "", unit: "", min_stock: "", category_id: "", description: "" })
  const [editLoading, setEditLoading] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const [stockRes, locRes, movRes, profileRes, catRes] = await Promise.all([
      supabase.from("stock_totals").select("*").order("item_name"),
      supabase.from("stock_by_location").select("*").gt("quantity", 0),
      supabase.from("movements").select("item_id, created_at, supplier")
        .eq("type", "entrada").order("created_at", { ascending: false }).limit(1000),
      user ? supabase.from("profiles").select("role").eq("id", user.id).single() : Promise.resolve({ data: null }),
      supabase.from("categories").select("*").order("name"),
    ])

    setItems((stockRes.data as StockTotal[]) ?? [])

    const locMap = new Map<string, StockByLocation[]>()
    for (const loc of (locRes.data as StockByLocation[]) ?? []) {
      if (!locMap.has(loc.item_id)) locMap.set(loc.item_id, [])
      locMap.get(loc.item_id)!.push(loc)
    }
    setLocationMap(locMap)

    const entryMap = new Map<string, LastEntry>()
    for (const m of (movRes.data ?? []) as LastEntry[]) {
      if (!entryMap.has(m.item_id)) entryMap.set(m.item_id, m)
    }
    setLastEntries(entryMap)

    setIsAdmin((profileRes.data as { role: string } | null)?.role === "admin")
    setCategories((catRes.data as Category[]) ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(i =>
      i.item_name.toLowerCase().includes(q) ||
      (i.sku && i.sku.toLowerCase().includes(q)) ||
      (i.category_name && i.category_name.toLowerCase().includes(q))
    )
  }, [items, search])

  function openEdit(item: StockTotal) {
    supabase.from("items").select("*").eq("id", item.item_id).single().then(({ data }) => {
      if (!data) return
      setEditForm({
        name: data.name ?? "",
        variant_info: (data as { variant_info?: string | null }).variant_info ?? "",
        sku: data.sku ?? "",
        unit: data.unit ?? "",
        min_stock: String(data.min_stock ?? 0),
        category_id: (data as { category_id?: string | null }).category_id ?? "",
        description: data.description ?? "",
      })
      setEditingId(item.item_id)
    })
  }

  async function handleSave() {
    if (!editingId || !editForm.name.trim()) return
    setEditLoading(true)
    const { error } = await supabase.from("items").update({
      name: editForm.name.trim(),
      variant_info: editForm.variant_info.trim() || null,
      sku: editForm.sku.trim() || null,
      unit: editForm.unit.trim() || "pieza",
      min_stock: parseFloat(editForm.min_stock) || 0,
      category_id: editForm.category_id || null,
      description: editForm.description.trim() || null,
    }).eq("id", editingId)

    if (!error) {
      toast({ title: "Artículo actualizado" })
      setEditingId(null)
      loadAll()
    } else {
      toast({ title: "Error al guardar", variant: "destructive" })
    }
    setEditLoading(false)
  }

  async function handleDelete() {
    if (!deletingId) return
    setDeleteLoading(true)
    const { error } = await supabase.from("items").update({ is_active: false }).eq("id", deletingId)
    if (!error) {
      toast({ title: "Artículo eliminado del inventario" })
      setDeletingId(null)
      setItems(prev => prev.filter(i => i.item_id !== deletingId))
    } else {
      toast({ title: "Error al eliminar", variant: "destructive" })
    }
    setDeleteLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Inventario</h1>
        <p className="text-muted-foreground text-sm">{items.length} artículo{items.length !== 1 ? "s" : ""} registrado{items.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, SKU o categoría..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Tabla desktop */}
      <div className="hidden md:block rounded-lg border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Artículo</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Categoría</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Ubicación</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Cantidad total</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Última entrada</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Último proveedor</th>
              {isAdmin && <th className="px-4 py-3 w-20" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map(item => {
              const locs = locationMap.get(item.item_id) ?? []
              const last = lastEntries.get(item.item_id)
              return (
                <tr
                  key={item.item_id}
                  className={`transition-colors hover:bg-muted/30 ${item.is_low_stock ? "bg-yellow-50/60" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {item.is_low_stock && <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />}
                      <div>
                        <p className="font-medium leading-tight">{item.item_name}</p>
                        {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {item.category_name ? (
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{ borderColor: item.category_color ?? undefined, color: item.category_color ?? undefined }}
                      >
                        {item.category_name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {locs.length > 0 ? (
                      <div className="space-y-0.5">
                        {locs.map(l => (
                          <div key={l.id} className="text-xs">
                            <span className="font-medium">{l.location_name}</span>
                            <span className="text-muted-foreground ml-1">({l.quantity} {l.unit})</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">Sin stock</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold tabular-nums text-base ${item.is_low_stock ? "text-yellow-600" : ""}`}>
                      {item.total_quantity}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                    {item.is_low_stock && (
                      <p className="text-xs text-yellow-600">mín: {item.min_stock}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {last
                      ? new Date(last.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {last?.supplier ?? "—"}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingId(item.item_id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{search ? "No se encontraron artículos." : "No hay artículos en el inventario."}</p>
            {!search && <p className="text-xs mt-1">Registra una entrada para agregar artículos al inventario.</p>}
          </div>
        )}
      </div>

      {/* Tarjetas móvil */}
      <div className="md:hidden grid gap-2">
        {filtered.map(item => {
          const locs = locationMap.get(item.item_id) ?? []
          const last = lastEntries.get(item.item_id)
          return (
            <div
              key={item.item_id}
              className={`border rounded-lg p-4 space-y-2 ${item.is_low_stock ? "border-yellow-300" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.is_low_stock && <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />}
                    <p className="font-medium">{item.item_name}</p>
                  </div>
                  {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                  {item.category_name && (
                    <Badge
                      variant="outline"
                      className="text-xs mt-1"
                      style={{ borderColor: item.category_color ?? undefined, color: item.category_color ?? undefined }}
                    >
                      {item.category_name}
                    </Badge>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-lg font-bold tabular-nums ${item.is_low_stock ? "text-yellow-600" : ""}`}>
                    {item.total_quantity}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                  {item.is_low_stock && <p className="text-xs text-yellow-600">mín: {item.min_stock}</p>}
                </div>
              </div>

              {locs.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {locs.map(l => `${l.location_name}: ${l.quantity} ${l.unit}`).join(" · ")}
                </p>
              )}

              {last && (
                <p className="text-xs text-muted-foreground">
                  Última entrada: {new Date(last.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                  {last.supplier && ` · ${last.supplier}`}
                </p>
              )}

              {isAdmin && (
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => openEdit(item)}>
                    <Pencil className="h-3 w-3" />Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setDeletingId(item.item_id)}
                  >
                    <Trash2 className="h-3 w-3" />Eliminar
                  </Button>
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{search ? "No se encontraron artículos." : "No hay artículos en el inventario."}</p>
          </div>
        )}
      </div>

      {/* Dialog: editar artículo */}
      <Dialog open={!!editingId} onOpenChange={open => { if (!open) setEditingId(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar artículo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Variante / especificación</Label>
              <Input
                placeholder="Ej: M6 × 20mm, Zinc"
                value={editForm.variant_info}
                onChange={e => setEditForm(f => ({ ...f, variant_info: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SKU</Label>
                <Input value={editForm.sku} onChange={e => setEditForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Input
                  placeholder="pieza, kg, litro..."
                  value={editForm.unit}
                  onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Stock mínimo</Label>
              <Input
                type="number"
                min="0"
                value={editForm.min_stock}
                onChange={e => setEditForm(f => ({ ...f, min_stock: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select
                value={editForm.category_id || "__none__"}
                onValueChange={v => setEditForm(f => ({ ...f, category_id: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin categoría</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={editLoading || !editForm.name.trim()}>
              {editLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar eliminación */}
      <Dialog open={!!deletingId} onOpenChange={open => { if (!open) setDeletingId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar artículo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            El artículo se desactivará y dejará de aparecer en el inventario. El historial de movimientos se conserva.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
