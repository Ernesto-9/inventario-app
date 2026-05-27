"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Search, Plus, X, Loader2, Store } from "lucide-react"

interface ItemOption {
  id: string
  name: string
  variant_info: string | null
  unit: string
  sku: string | null
}

interface SupplierOption {
  id: string
  name: string
}

interface QuotationRow {
  rowId: string
  item_id: string
  item_name: string
  variant_info: string
  unit: string
  quantity: string
  search: string
  showDropdown: boolean
}

interface NewItemDraft {
  rowId: string
  name: string
  unit: string
  variant_info: string
  selectedSupplierIds: Set<string>
  newSupplierNames: string[]
  newSupplierInput: string
  submitting: boolean
  error: string
}

const UNITS = ["pieza", "kg", "litro", "metro", "caja", "saco", "rollo", "par", "bulto", "galón"]

function makeRow(): QuotationRow {
  return {
    rowId: crypto.randomUUID(),
    item_id: "",
    item_name: "",
    variant_info: "",
    unit: "",
    quantity: "",
    search: "",
    showDropdown: false,
  }
}

export default function NuevaCotizacionPage() {
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({ name: "", notes: "" })
  const [rows, setRows] = useState<QuotationRow[]>([makeRow()])
  const [allItems, setAllItems] = useState<ItemOption[]>([])
  const [allSuppliers, setAllSuppliers] = useState<SupplierOption[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newItem, setNewItem] = useState<NewItemDraft | null>(null)

  useEffect(() => {
    loadCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadCatalog() {
    setLoading(true)
    const [itemsRes, supRes] = await Promise.all([
      supabase.from("items").select("id, name, variant_info, unit, sku").eq("is_active", true).order("name"),
      supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    ])
    setAllItems((itemsRes.data as ItemOption[]) ?? [])
    setAllSuppliers((supRes.data as SupplierOption[]) ?? [])
    setLoading(false)
  }

  function updateRow(rowId: string, patch: Partial<QuotationRow>) {
    setRows(prev => prev.map(r => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  function removeRow(rowId: string) {
    setRows(prev => prev.length === 1 ? [makeRow()] : prev.filter(r => r.rowId !== rowId))
  }

  function addRow() {
    setRows(prev => [...prev, makeRow()])
  }

  function filterItems(search: string): ItemOption[] {
    const q = search.trim().toLowerCase()
    if (!q) return allItems.slice(0, 20)
    return allItems.filter(i => {
      const hay = `${i.name} ${i.variant_info ?? ""} ${i.sku ?? ""}`.toLowerCase()
      return hay.includes(q)
    })
  }

  function selectExistingItem(rowId: string, item: ItemOption) {
    updateRow(rowId, {
      item_id: item.id,
      item_name: item.name,
      variant_info: item.variant_info ?? "",
      unit: item.unit,
      search: item.name + (item.variant_info ? ` — ${item.variant_info}` : ""),
      showDropdown: false,
    })
  }

  function openNewItemModal(rowId: string, prefillName: string) {
    setNewItem({
      rowId,
      name: prefillName.trim(),
      unit: "pieza",
      variant_info: "",
      selectedSupplierIds: new Set(),
      newSupplierNames: [],
      newSupplierInput: "",
      submitting: false,
      error: "",
    })
  }

  function toggleSupplier(supplierId: string) {
    if (!newItem) return
    const next = new Set(newItem.selectedSupplierIds)
    if (next.has(supplierId)) next.delete(supplierId)
    else next.add(supplierId)
    setNewItem({ ...newItem, selectedSupplierIds: next })
  }

  function addNewSupplierName() {
    if (!newItem) return
    const name = newItem.newSupplierInput.trim()
    if (!name) return
    if (newItem.newSupplierNames.includes(name)) return
    if (allSuppliers.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setNewItem({ ...newItem, error: "Ese proveedor ya existe, márcalo en la lista." })
      return
    }
    setNewItem({
      ...newItem,
      newSupplierNames: [...newItem.newSupplierNames, name],
      newSupplierInput: "",
      error: "",
    })
  }

  function removeNewSupplierName(name: string) {
    if (!newItem) return
    setNewItem({
      ...newItem,
      newSupplierNames: newItem.newSupplierNames.filter(n => n !== name),
    })
  }

  async function confirmNewItem() {
    if (!newItem) return
    const name = newItem.name.trim()
    if (!name) return setNewItem({ ...newItem, error: "El nombre es obligatorio" })
    if (newItem.selectedSupplierIds.size === 0 && newItem.newSupplierNames.length === 0) {
      return setNewItem({ ...newItem, error: "Selecciona al menos un proveedor" })
    }

    setNewItem({ ...newItem, submitting: true, error: "" })

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // 1. Crear el item en el catálogo
      const { data: createdItem, error: itemErr } = await supabase
        .from("items")
        .insert({
          name,
          variant_info: newItem.variant_info.trim() || null,
          unit: newItem.unit,
          created_by: user?.id ?? null,
        })
        .select("id, name, variant_info, unit, sku")
        .single()
      if (itemErr) throw new Error(itemErr.message)

      // 2. Crear proveedores nuevos
      const createdSupplierIds: string[] = []
      for (const supName of newItem.newSupplierNames) {
        const { data: s, error: sErr } = await supabase
          .from("suppliers")
          .insert({ name: supName, is_active: true, created_by: user?.id ?? null })
          .select("id, name")
          .single()
        if (sErr) throw new Error(`Proveedor "${supName}": ${sErr.message}`)
        createdSupplierIds.push(s.id)
        setAllSuppliers(prev => [...prev, { id: s.id, name: s.name }].sort((a, b) => a.name.localeCompare(b.name)))
      }

      // 3. Crear liga item ↔ proveedores
      const supplierIds = [...Array.from(newItem.selectedSupplierIds), ...createdSupplierIds]
      const links = supplierIds.map(sid => ({ item_id: createdItem.id, supplier_id: sid }))
      const { error: linkErr } = await supabase.from("item_suppliers").insert(links)
      if (linkErr) throw new Error(linkErr.message)

      // 4. Agregar el item al catálogo local y asignarlo a la fila
      const newOption: ItemOption = {
        id: createdItem.id,
        name: createdItem.name,
        variant_info: createdItem.variant_info,
        unit: createdItem.unit,
        sku: createdItem.sku ?? null,
      }
      setAllItems(prev => [...prev, newOption].sort((a, b) => a.name.localeCompare(b.name)))
      selectExistingItem(newItem.rowId, newOption)

      setNewItem(null)
    } catch (e) {
      setNewItem(n => n ? { ...n, submitting: false, error: (e as Error).message } : null)
    }
  }

  const validRows = useMemo(
    () => rows.filter(r => r.item_id && parseFloat(r.quantity) > 0),
    [rows]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (validRows.length === 0) return setError("Agrega al menos un artículo con cantidad")
    setSubmitting(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: quotation, error: qErr } = await supabase
        .from("quotations")
        .insert({
          name: form.name.trim() || null,
          notes: form.notes.trim() || null,
          status: "abierta",
          created_by: user!.id,
        })
        .select("id")
        .single()
      if (qErr) throw new Error(qErr.message)

      const itemsPayload = validRows.map(r => ({
        quotation_id: quotation.id,
        item_id: r.item_id,
        quantity: parseFloat(r.quantity),
        unit: r.unit || null,
      }))

      const { error: qiErr } = await supabase.from("quotation_items").insert(itemsPayload)
      if (qiErr) throw new Error(qiErr.message)

      router.push(`/cotizaciones/${quotation.id}`)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/cotizaciones"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold">Nueva cotización</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Datos generales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="space-y-2">
              <Label htmlFor="qname">Nombre (opcional)</Label>
              <Input
                id="qname"
                placeholder='Ej: "Material para obra Juárez"'
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qnotes">Notas (opcional)</Label>
              <Textarea
                id="qnotes"
                placeholder="Contexto, plazos, etc."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Artículos a cotizar *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {rows.map(row => (
              <div key={row.rowId} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 min-h-[20px]">
                  {row.item_id && (
                    <span className="text-xs text-muted-foreground truncate">
                      {row.item_name}{row.variant_info ? ` — ${row.variant_info}` : ""}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeRow(row.rowId)}
                    className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar artículo o escribir uno nuevo..."
                    value={row.search}
                    onChange={e => updateRow(row.rowId, { search: e.target.value, showDropdown: true, item_id: "" })}
                    onFocus={() => updateRow(row.rowId, { showDropdown: true })}
                    onBlur={() => setTimeout(() => updateRow(row.rowId, { showDropdown: false }), 150)}
                  />
                  {row.showDropdown && row.search && (
                    <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                      {filterItems(row.search).slice(0, 20).map(i => (
                        <button
                          key={i.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                          onMouseDown={() => selectExistingItem(row.rowId, i)}
                        >
                          <span className="font-medium">{i.name}</span>
                          {i.variant_info && <span className="text-muted-foreground"> — {i.variant_info}</span>}
                          <span className="text-muted-foreground text-xs ml-1">· {i.unit}</span>
                        </button>
                      ))}
                      {row.search.trim() && !filterItems(row.search).some(i => i.name.toLowerCase() === row.search.toLowerCase().trim()) && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors border-t"
                          onMouseDown={() => openNewItemModal(row.rowId, row.search)}
                        >
                          + Crear: &ldquo;{row.search}&rdquo;
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={`Cantidad${row.unit ? ` (${row.unit})` : ""}`}
                  value={row.quantity}
                  onChange={e => updateRow(row.rowId, { quantity: e.target.value })}
                  disabled={!row.item_id}
                />
              </div>
            ))}

            <button
              type="button"
              onClick={addRow}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar artículo
            </button>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting || validRows.length === 0} className="flex-1">
            {submitting ? "Guardando..." : "Guardar y generar mensajes"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/cotizaciones">Cancelar</Link>
          </Button>
        </div>
      </form>

      {/* Modal: crear nuevo artículo con proveedores */}
      {newItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !newItem.submitting && setNewItem(null)}
          />
          <div className="relative z-10 bg-background rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div>
              <h2 className="text-lg font-bold">Nuevo artículo</h2>
              <p className="text-sm text-muted-foreground">Se guardará en el catálogo y se ligará a los proveedores que marques.</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input
                  value={newItem.name}
                  onChange={e => setNewItem(n => n ? { ...n, name: e.target.value } : null)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Unidad</Label>
                  <select
                    value={newItem.unit}
                    onChange={e => setNewItem(n => n ? { ...n, unit: e.target.value } : null)}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  >
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Especificación</Label>
                  <Input
                    placeholder="Opcional — ej: 3/8&quot;"
                    value={newItem.variant_info}
                    onChange={e => setNewItem(n => n ? { ...n, variant_info: e.target.value } : null)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Proveedores *</Label>
                <p className="text-xs text-muted-foreground">Marca todos los que venden este artículo.</p>
                <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                  {allSuppliers.length === 0 && (
                    <p className="text-xs text-muted-foreground p-3">No hay proveedores en el catálogo todavía.</p>
                  )}
                  {allSuppliers.map(s => (
                    <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newItem.selectedSupplierIds.has(s.id)}
                        onChange={() => toggleSupplier(s.id)}
                      />
                      <Store className="h-3.5 w-3.5 text-muted-foreground" />
                      {s.name}
                    </label>
                  ))}
                </div>

                {newItem.newSupplierNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {newItem.newSupplierNames.map(n => (
                      <Badge key={n} variant="secondary" className="gap-1">
                        {n}
                        <button
                          type="button"
                          onClick={() => removeNewSupplierName(n)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="+ Agregar proveedor nuevo..."
                    value={newItem.newSupplierInput}
                    onChange={e => setNewItem(n => n ? { ...n, newSupplierInput: e.target.value } : null)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addNewSupplierName()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addNewSupplierName}
                    disabled={!newItem.newSupplierInput.trim()}
                  >
                    Agregar
                  </Button>
                </div>
              </div>

              {newItem.error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{newItem.error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => !newItem.submitting && setNewItem(null)}
                disabled={newItem.submitting}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={confirmNewItem}
                disabled={newItem.submitting}
                className="flex-1"
              >
                {newItem.submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {newItem.submitting ? "Creando..." : "Crear artículo"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
