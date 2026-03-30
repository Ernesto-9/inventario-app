"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, FileText, X, Upload, Search, ScanLine, Loader2, Check, Plus, Camera } from "lucide-react"
import type { Location, Profile, MovementType, AttachmentType } from "@/types/database"
import { toast } from "@/hooks/use-toast"
import imageCompression from "browser-image-compression"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

interface ScannedItem {
  matched_id: string | null
  name: string
  variant_info: string | null
  quantity: number
  unit_cost: number
  is_new?: boolean
  _name: string
  _variant_info: string
  _quantity: string
  _unit_cost: string
}

interface ItemWithStock {
  id: string
  name: string
  unit: string
  sku: string | null
  variant_info?: string | null
}

interface ItemRow {
  rowId: string
  item_id: string | null
  item_name: string
  variant_info: string
  unit: string
  quantity: string
  unit_cost: string
  is_new: boolean
  search: string
  showDropdown: boolean
  availableStock: number | null
}

interface PendingFile {
  file: File
  preview: string
  type: AttachmentType
  name: string
}

function makeRow(overrides?: Partial<ItemRow>): ItemRow {
  return {
    rowId: Math.random().toString(36).slice(2),
    item_id: null,
    item_name: '',
    variant_info: '',
    unit: 'pieza',
    quantity: '',
    unit_cost: '',
    is_new: false,
    search: '',
    showDropdown: false,
    availableStock: null,
    ...overrides,
  }
}

const allMovementTypes: { value: MovementType; label: string; description: string }[] = [
  { value: 'entrada', label: 'Entrada', description: 'Llega mercancía al inventario' },
  { value: 'salida', label: 'Salida', description: 'Sale del inventario (consumo/uso)' },
  { value: 'transferencia', label: 'Transferencia', description: 'Se mueve entre ubicaciones' },
  { value: 'ajuste', label: 'Ajuste', description: 'Corrección de inventario (solo admin)' },
]

export default function NewMovementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ItemWithStock[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [files, setFiles] = useState<PendingFile[]>([])
  const [currentUserId, setCurrentUserId] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)

  const [itemRows, setItemRows] = useState<ItemRow[]>([makeRow()])
  const [showNewItemsDialog, setShowNewItemsDialog] = useState(false)

  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([])
  const [scannedSupplier, setScannedSupplier] = useState("")

  const [form, setForm] = useState({
    type: '' as MovementType | '',
    origin_location_id: searchParams.get('location') ?? '',
    destination_location_id: '',
    notes: '',
    reference_number: '',
    responsible_id: '',
    supplier: '',
  })

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))
  const isMultiType = form.type === 'entrada' || form.type === 'salida'

  const loadData = useCallback(async () => {
    const [itemsRes, locationsRes, profilesRes, userRes] = await Promise.all([
      supabase.from("items").select("id, name, unit, sku, variant_info").eq("is_active", true).order("name"),
      supabase.from("locations").select("id, name, type").eq("is_active", true).order("name"),
      supabase.from("profiles").select("id, full_name, role").order("full_name"),
      supabase.auth.getUser(),
    ])
    setItems((itemsRes.data as ItemWithStock[]) ?? [])
    setLocations((locationsRes.data as Location[]) ?? [])
    setProfiles((profilesRes.data as Profile[]) ?? [])
    const uid = userRes.data.user?.id ?? ""
    setCurrentUserId(uid)
    if (uid) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", uid).single()
      setIsAdmin((profile as { role: string } | null)?.role === "admin")
    }
    const preItemId = searchParams.get('item')
    if (preItemId && itemsRes.data) {
      const preItem = (itemsRes.data as ItemWithStock[]).find(i => i.id === preItemId)
      if (preItem) {
        setItemRows([makeRow({
          item_id: preItem.id,
          item_name: preItem.name,
          variant_info: preItem.variant_info ?? '',
          unit: preItem.unit,
          search: preItem.name + (preItem.variant_info ? ` — ${preItem.variant_info}` : ''),
        })])
      }
    }
  }, [supabase, searchParams])

  useEffect(() => { loadData() }, [loadData])

  function updateRow(rowId: string, updates: Partial<ItemRow>) {
    setItemRows(prev => prev.map(r => r.rowId === rowId ? { ...r, ...updates } : r))
  }

  function removeRow(rowId: string) {
    setItemRows(prev => prev.length > 1 ? prev.filter(r => r.rowId !== rowId) : [makeRow()])
  }

  function addRow() {
    setItemRows(prev => [...prev, makeRow()])
  }

  function filterItems(search: string) {
    if (!search) return items.slice(0, 10)
    const q = search.toLowerCase()
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.sku && i.sku.toLowerCase().includes(q)) ||
      (i.variant_info && i.variant_info.toLowerCase().includes(q))
    )
  }

  function fetchRowStock(rowId: string, itemId: string) {
    if (!form.origin_location_id) return
    supabase.from("stock").select("quantity")
      .eq("item_id", itemId)
      .eq("location_id", form.origin_location_id)
      .single()
      .then(({ data }) => {
        updateRow(rowId, { availableStock: (data as { quantity: number } | null)?.quantity ?? 0 })
      })
  }

  // Re-fetch stock when origin location changes
  useEffect(() => {
    const showOrigin = form.type === 'salida' || form.type === 'transferencia' || form.type === 'ajuste'
    if (!showOrigin || !form.origin_location_id) return
    itemRows.forEach(row => {
      if (row.item_id) fetchRowStock(row.rowId, row.item_id)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.origin_location_id, form.type])

  async function handleScanComprobante(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const processedFile = file.type.startsWith('image/')
      ? await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 })
      : file
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(processedFile) : ''
    setFiles(prev => [...prev, { file: processedFile, preview, type: 'foto', name: file.name }])

    // Trigger AI only for entrada or when type not yet selected
    const shouldScanAI = form.type === 'entrada' || form.type === ''
    if (!shouldScanAI) return

    setScanning(true)
    setScanError(null)
    setScannerOpen(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(processedFile)
      })
      const existingItems = items.map(i => ({ id: i.id, name: i.name, variant_info: i.variant_info, sku: i.sku }))
      const res = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType: processedFile.type, existingItems }),
      })
      if (!res.ok) {
        const err = await res.json()
        setScanError(err.error ?? 'Error al procesar el comprobante')
        setScanning(false)
        return
      }
      const data = await res.json()
      setScannedSupplier(data.supplier ?? '')
      setScannedItems((data.items ?? []).map((i: ScannedItem) => ({
        ...i,
        is_new: !i.matched_id,
        _name: i.name,
        _variant_info: i.variant_info ?? '',
        _quantity: String(i.quantity),
        _unit_cost: String(i.unit_cost),
      })))
    } catch {
      setScanError('Error al leer la imagen')
    }
    setScanning(false)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? [])
    for (const file of selectedFiles) {
      const processedFile = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 })
      const preview = URL.createObjectURL(processedFile)
      setFiles(prev => [...prev, { file: processedFile, preview, type: 'foto', name: file.name }])
    }
    e.target.value = ''
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? [])
    for (const file of selectedFiles) {
      setFiles(prev => [...prev, { file, preview: '', type: 'documento', name: file.name }])
    }
    e.target.value = ''
  }

  function confirmScannedItems() {
    const newRows: ItemRow[] = scannedItems.map(si => makeRow({
      item_id: si.matched_id,
      item_name: si._name,
      variant_info: si._variant_info,
      unit: 'pieza',
      quantity: si._quantity,
      unit_cost: si._unit_cost,
      is_new: !si.matched_id,
      search: si._name + (si._variant_info ? ` — ${si._variant_info}` : ''),
    }))
    setItemRows(prev => {
      const nonEmpty = prev.filter(r => r.item_id || r.item_name.trim())
      return nonEmpty.length ? [...nonEmpty, ...newRows] : newRows
    })
    if (scannedSupplier) setForm(f => ({ ...f, supplier: scannedSupplier, type: f.type || 'entrada' }))
    setScannerOpen(false)
    setScannedItems([])
    setScannedSupplier("")
  }

  async function doSubmit() {
    setLoading(true)
    setError(null)

    const validRows = itemRows.filter(r => (r.item_id || r.item_name.trim()) && r.quantity && parseFloat(r.quantity) > 0)
    const movementIds: string[] = []

    for (const row of validRows) {
      let itemId = row.item_id
      if (row.is_new) {
        const { data: newItem } = await supabase.from("items").insert({
          name: row.item_name.trim(),
          variant_info: row.variant_info.trim() || null,
          unit: row.unit || 'pieza',
          created_by: currentUserId,
        }).select("id").single()
        itemId = (newItem as { id: string } | null)?.id ?? null
      }
      if (!itemId) continue

      const { data: movId, error: rpcError } = await supabase.rpc("create_movement", {
        p_type: form.type as MovementType,
        p_item_id: itemId,
        p_quantity: parseFloat(row.quantity),
        p_origin_location_id: form.origin_location_id || undefined,
        p_destination_location_id: form.destination_location_id || undefined,
        p_notes: form.notes || undefined,
        p_unit_cost: row.unit_cost ? parseFloat(row.unit_cost) : undefined,
        p_reference_number: form.reference_number || undefined,
        p_responsible_id: form.responsible_id || undefined,
        p_supplier: form.supplier || undefined,
      })

      if (rpcError) {
        setError(rpcError.message)
        setLoading(false)
        return
      }
      if (movId) movementIds.push(movId as string)
    }

    // Upload files and link to all movements
    for (const pending of files) {
      const ext = pending.name.split('.').pop()
      const basePath = movementIds[0] ?? `batch-${Date.now()}`
      const path = `movements/${basePath}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage.from("attachments").upload(path, pending.file, { cacheControl: '3600' })
      if (uploadError) continue
      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path)
      for (const movId of movementIds) {
        await supabase.from("movement_attachments").insert({
          movement_id: movId,
          type: pending.type,
          file_url: publicUrl,
          file_name: pending.name,
          file_size: pending.file.size,
          uploaded_by: currentUserId,
        })
      }
    }

    // Cash deduction for entradas
    if (form.type === 'entrada' && movementIds.length > 0) {
      const totalCost = validRows.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_cost) || 0), 0)
      if (totalCost > 0) {
        const { data: activeFunds } = await supabase.from("cash_funds").select("id").eq("is_active", true).limit(1)
        if (activeFunds?.length) {
          await supabase.from("cash_transactions").insert({
            fund_id: (activeFunds[0] as { id: string }).id,
            type: 'gasto',
            amount: totalCost,
            description: `Compra (${movementIds.length} artículo${movementIds.length > 1 ? 's' : ''})`,
            movement_id: movementIds[0],
            created_by: currentUserId,
          })
        }
      }
    }

    toast({ title: `${movementIds.length} movimiento${movementIds.length > 1 ? 's' : ''} registrado${movementIds.length > 1 ? 's' : ''}` })
    router.back()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.type) return setError("Selecciona el tipo de movimiento")

    const validRows = itemRows.filter(r => (r.item_id || r.item_name.trim()) && r.quantity && parseFloat(r.quantity) > 0)
    if (validRows.length === 0) return setError("Agrega al menos un artículo con cantidad")

    if (validRows.some(r => r.is_new)) {
      setShowNewItemsDialog(true)
      return
    }

    await doSubmit()
  }

  const movementTypes = isAdmin ? allMovementTypes : allMovementTypes.filter(t => t.value !== 'ajuste')
  const showOrigin = form.type === 'salida' || form.type === 'transferencia' || form.type === 'ajuste'
  const showDestination = form.type === 'entrada' || form.type === 'transferencia'
  const validRows = itemRows.filter(r => (r.item_id || r.item_name.trim()) && r.quantity && parseFloat(r.quantity) > 0)
  const totalCost = form.type === 'entrada'
    ? validRows.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_cost) || 0), 0)
    : 0

  return (
    <div className="p-4 md:p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">Nuevo movimiento</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tipo */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Tipo de movimiento *</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 pt-0">
            {movementTypes.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setForm(f => ({ ...f, type: t.value }))
                  setItemRows([makeRow()])
                  setError(null)
                }}
                className={`text-left rounded-lg border p-3 transition-colors ${form.type === t.value ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/50'}`}
              >
                <p className="font-medium text-sm">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Artículos */}
        {form.type && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{isMultiType ? 'Artículos *' : 'Artículo *'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {itemRows.map((row) => (
                <div key={row.rowId} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 min-h-[20px]">
                    {row.is_new && <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Nuevo</Badge>}
                    {row.item_id && !row.is_new && (
                      <span className="text-xs text-muted-foreground truncate">
                        {row.item_name}{row.variant_info ? ` — ${row.variant_info}` : ''}
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

                  {/* Item search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar artículo por nombre o SKU..."
                      value={row.search}
                      onChange={e => updateRow(row.rowId, { search: e.target.value, showDropdown: true, item_id: null, is_new: false })}
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
                            onMouseDown={() => {
                              updateRow(row.rowId, {
                                item_id: i.id,
                                item_name: i.name,
                                variant_info: i.variant_info ?? '',
                                unit: i.unit,
                                search: i.name + (i.variant_info ? ` — ${i.variant_info}` : ''),
                                showDropdown: false,
                                is_new: false,
                              })
                              if (showOrigin && form.origin_location_id) fetchRowStock(row.rowId, i.id)
                            }}
                          >
                            <span className="font-medium">{i.name}</span>
                            {i.variant_info && <span className="text-muted-foreground"> — {i.variant_info}</span>}
                            {i.sku && <span className="text-muted-foreground text-xs ml-1">({i.sku})</span>}
                            <span className="text-muted-foreground text-xs ml-1">· {i.unit}</span>
                          </button>
                        ))}
                        {/* Crear nuevo artículo */}
                        {row.search.trim() && !filterItems(row.search).some(i => i.name.toLowerCase() === row.search.toLowerCase().trim()) && (
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors border-t"
                            onMouseDown={() => {
                              updateRow(row.rowId, {
                                item_id: null,
                                item_name: row.search.trim(),
                                variant_info: '',
                                unit: 'pieza',
                                showDropdown: false,
                                is_new: true,
                              })
                            }}
                          >
                            + Crear: &ldquo;{row.search}&rdquo;
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cantidad + costo */}
                  <div className={`grid gap-2 ${form.type === 'entrada' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <div>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder={`Cantidad${row.unit ? ` (${row.unit})` : ''}`}
                        value={row.quantity}
                        onChange={e => updateRow(row.rowId, { quantity: e.target.value })}
                      />
                      {(form.type === 'salida' || form.type === 'transferencia') && row.availableStock !== null && (
                        <p className={`text-xs mt-1 ${row.quantity && parseFloat(row.quantity) > row.availableStock ? 'text-destructive' : 'text-muted-foreground'}`}>
                          Disponible: {row.availableStock} {row.unit}
                        </p>
                      )}
                    </div>
                    {form.type === 'entrada' && (
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="$ Costo unit."
                        value={row.unit_cost}
                        onChange={e => updateRow(row.rowId, { unit_cost: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              ))}

              {isMultiType && (
                <button
                  type="button"
                  onClick={addRow}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Agregar artículo
                </button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Ubicación y detalles */}
        {form.type && (
          <Card>
            <CardContent className="pt-4 space-y-4">
              {showOrigin && (
                <div className="space-y-2">
                  <Label htmlFor="origin">
                    {form.type === 'transferencia' ? 'Origen *' : form.type === 'salida' ? 'Sale de *' : 'Ubicación a ajustar *'}
                  </Label>
                  <Select value={form.origin_location_id} onValueChange={v => update('origin_location_id', v)}>
                    <SelectTrigger id="origin"><SelectValue placeholder="Selecciona ubicación" /></SelectTrigger>
                    <SelectContent>
                      {locations.map(l => (
                        <SelectItem key={l.id} value={l.id}>
                          <span className="flex items-center gap-2">
                            {l.name}
                            <Badge variant="outline" className="text-xs capitalize">{l.type}</Badge>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showDestination && (
                <div className="space-y-2">
                  <Label htmlFor="destination">
                    {form.type === 'transferencia' ? 'Destino *' : 'Entra a *'}
                  </Label>
                  <Select value={form.destination_location_id} onValueChange={v => update('destination_location_id', v)}>
                    <SelectTrigger id="destination"><SelectValue placeholder="Selecciona ubicación" /></SelectTrigger>
                    <SelectContent>
                      {locations.filter(l => l.id !== form.origin_location_id).map(l => (
                        <SelectItem key={l.id} value={l.id}>
                          <span className="flex items-center gap-2">
                            {l.name}
                            <Badge variant="outline" className="text-xs capitalize">{l.type}</Badge>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.type === 'entrada' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="supplier">Proveedor</Label>
                    <Input id="supplier" placeholder="Ej: Ferretería López" value={form.supplier} onChange={e => update('supplier', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ref">No. Factura / Remisión</Label>
                    <Input id="ref" placeholder="FAC-001" value={form.reference_number} onChange={e => update('reference_number', e.target.value)} />
                  </div>
                  {totalCost > 0 && (
                    <p className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                      Se descontarán <strong>${totalCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong> de caja chica automáticamente.
                    </p>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="responsible">Responsable</Label>
                <Select value={form.responsible_id} onValueChange={v => update('responsible_id', v)}>
                  <SelectTrigger id="responsible"><SelectValue placeholder="¿Quién realiza el movimiento?" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" placeholder="Observaciones del movimiento..." value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Comprobante */}
        {form.type && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Comprobante</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative group">
                      {f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.preview} alt={f.name} className="h-16 w-16 object-cover rounded-md border" />
                      ) : (
                        <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center">
                          <FileText className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <Badge variant="secondary" className="absolute -top-1 -right-1 text-[9px] px-1 py-0">
                        {f.type === 'foto' ? 'foto' : 'doc'}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1 -left-1 bg-destructive text-white rounded-full h-4 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Label htmlFor="photo-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                    <Camera className="h-4 w-4" />
                    Foto
                  </div>
                  <input id="photo-upload" type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handlePhotoUpload} />
                </Label>

                <Label htmlFor="scan-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-sm text-primary hover:bg-primary/10 transition-colors">
                    <ScanLine className="h-4 w-4" />
                    Escanear con IA
                  </div>
                  <input id="scan-upload" type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScanComprobante} />
                </Label>

                <Label htmlFor="doc-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                    <Upload className="h-4 w-4" />
                    Documento
                  </div>
                  <input id="doc-upload" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={handleDocUpload} />
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">Las fotos se comprimen automáticamente antes de subirse.</p>
            </CardContent>
          </Card>
        )}

        {error && <p className="text-sm text-destructive border border-destructive/20 bg-destructive/10 rounded-md px-3 py-2">{error}</p>}

        {form.type && (
          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Registrando...</> : "Registrar movimiento"}
          </Button>
        )}
      </form>

      {/* Dialog confirmación artículos nuevos */}
      <Dialog open={showNewItemsDialog} onOpenChange={setShowNewItemsDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar artículos nuevos</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Los siguientes artículos no están en el catálogo y serán creados:</p>
          <ul className="space-y-1.5 mt-2">
            {itemRows.filter(r => r.is_new).map(r => (
              <li key={r.rowId} className="text-sm flex items-center gap-2">
                <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 shrink-0">Nuevo</Badge>
                <span className="font-medium">{r.item_name}</span>
                {r.variant_info && <span className="text-muted-foreground">— {r.variant_info}</span>}
              </li>
            ))}
          </ul>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setShowNewItemsDialog(false)}>Cancelar</Button>
            <Button onClick={() => { setShowNewItemsDialog(false); doSubmit() }}>
              Confirmar y registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog escaneo IA */}
      <Dialog open={scannerOpen} onOpenChange={v => { if (!scanning) setScannerOpen(v) }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Escaneo de comprobante</DialogTitle>
          </DialogHeader>

          {scanning && (
            <div className="flex flex-col items-center py-8 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Analizando comprobante...</p>
            </div>
          )}

          {scanError && (
            <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{scanError}</div>
          )}

          {!scanning && scannedItems.length > 0 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Proveedor</Label>
                <Input value={scannedSupplier} onChange={e => setScannedSupplier(e.target.value)} placeholder="Nombre del proveedor" />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Artículos detectados — revisa y corrige:</p>
                {scannedItems.map((si, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      {si.is_new
                        ? <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Nuevo</Badge>
                        : <Badge variant="outline" className="text-xs text-green-600 border-green-300"><Check className="h-2.5 w-2.5 mr-1" />Existente</Badge>
                      }
                      <button type="button" onClick={() => setScannedItems(prev => prev.filter((_, i) => i !== idx))} className="ml-auto text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Input placeholder="Nombre" value={si._name} onChange={e => setScannedItems(prev => prev.map((s, i) => i === idx ? { ...s, _name: e.target.value } : s))} />
                    <Input placeholder="Especificación (opcional)" value={si._variant_info} onChange={e => setScannedItems(prev => prev.map((s, i) => i === idx ? { ...s, _variant_info: e.target.value } : s))} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" placeholder="Cantidad" value={si._quantity} onChange={e => setScannedItems(prev => prev.map((s, i) => i === idx ? { ...s, _quantity: e.target.value } : s))} />
                      <Input type="number" placeholder="$ Costo unit." value={si._unit_cost} onChange={e => setScannedItems(prev => prev.map((s, i) => i === idx ? { ...s, _unit_cost: e.target.value } : s))} />
                    </div>
                  </div>
                ))}
              </div>

              <Button className="w-full" onClick={confirmScannedItems}>
                Agregar {scannedItems.length} artículo{scannedItems.length > 1 ? 's' : ''} al movimiento
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
