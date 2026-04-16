"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Pencil, Trash2, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface Category {
  id: string
  name: string
  color: string | null
}

interface StockEntry {
  id: string
  location_id: string
  location_name: string
  quantity: number
}

interface ItemActionsProps {
  item: {
    id: string
    name: string
    variant_info?: string | null
    sku?: string | null
    unit: string
    min_stock: number
    category_id?: string | null
    description?: string | null
    aliases?: string | null
  }
  categories: Category[]
  stockData: StockEntry[]
}

export function ItemActions({ item, categories, stockData }: ItemActionsProps) {
  const supabase = createClient()
  const router = useRouter()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [stockEdits, setStockEdits] = useState<Record<string, string>>(
    Object.fromEntries(stockData.map(s => [s.id, String(s.quantity)]))
  )

  const [form, setForm] = useState({
    name: item.name,
    variant_info: item.variant_info ?? "",
    sku: item.sku ?? "",
    unit: item.unit,
    min_stock: String(item.min_stock),
    category_id: item.category_id ?? "",
    description: item.description ?? "",
    aliases: item.aliases ?? "",
  })

  async function handleSave() {
    if (!form.name.trim()) return
    setEditLoading(true)

    const { error } = await supabase.from("items").update({
      name: form.name.trim(),
      variant_info: form.variant_info.trim() || null,
      sku: form.sku.trim() || null,
      unit: form.unit.trim() || "pieza",
      min_stock: parseFloat(form.min_stock) || 0,
      category_id: form.category_id || null,
      description: form.description.trim() || null,
      aliases: form.aliases.trim() || null,
    }).eq("id", item.id)

    if (error) {
      setEditLoading(false)
      toast({ title: "Error al guardar", variant: "destructive" })
      return
    }

    // Actualizar stock por ubicación
    const stockUpdates = stockData
      .filter(s => parseFloat(stockEdits[s.id] ?? String(s.quantity)) !== s.quantity)
      .map(s => supabase.from("stock").update({ quantity: parseFloat(stockEdits[s.id]) || 0 }).eq("id", s.id))

    if (stockUpdates.length > 0) {
      const results = await Promise.all(stockUpdates)
      const stockError = results.find(r => r.error)?.error
      if (stockError) {
        setEditLoading(false)
        toast({ title: "Error al actualizar stock", variant: "destructive" })
        return
      }
    }

    setEditLoading(false)
    toast({ title: "Artículo actualizado" })
    setEditOpen(false)
    router.refresh()
  }

  async function handleDelete() {
    setDeleteLoading(true)
    const { error } = await supabase.from("items").update({ is_active: false }).eq("id", item.id)
    setDeleteLoading(false)
    if (error) { toast({ title: "Error al eliminar", variant: "destructive" }); return }
    toast({ title: "Artículo eliminado del inventario" })
    router.push("/items")
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil className="h-4 w-4 mr-1" />Editar
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="h-4 w-4 mr-1" />Eliminar
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar artículo</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Variante / especificación</Label>
              <Input placeholder="Ej: M6 × 20mm, Zinc" value={form.variant_info} onChange={e => setForm(f => ({ ...f, variant_info: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SKU</Label>
                <Input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Input placeholder="pieza, kg, litro..." value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Stock mínimo</Label>
              <Input type="number" min="0" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))} />
            </div>
            {stockData.length > 0 && (
              <div className="space-y-1.5">
                <Label>Stock por ubicación</Label>
                <div className="space-y-2">
                  {stockData.map(s => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="text-sm flex-1 truncate text-muted-foreground">{s.location_name}</span>
                      <Input
                        type="number"
                        min="0"
                        className="w-24 text-right"
                        value={stockEdits[s.id] ?? String(s.quantity)}
                        onChange={e => setStockEdits(prev => ({ ...prev, [s.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={form.category_id || "__none__"} onValueChange={v => setForm(f => ({ ...f, category_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin categoría</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nombres alternativos</Label>
              <Input
                placeholder="Ej: CEM-50G, cemento gris (separados por coma)"
                value={form.aliases}
                onChange={e => setForm(f => ({ ...f, aliases: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Cómo lo llaman los proveedores. Ayuda al escaneo de facturas.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={editLoading || !form.name.trim()}>
              {editLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar artículo?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            El artículo se desactivará y dejará de aparecer en el inventario. El historial de movimientos se conserva.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
