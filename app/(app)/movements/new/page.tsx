"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
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
  aliases?: string | null
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

  const [suppliers, setSuppliers] = useState<string[]>([])
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false)

  const [showNewLocationDialog, setShowNewLocationDialog] = useState(false)
  const [newLocationTarget, setNewLocationTarget] = useState<'origin' | 'destination' | null>(null)
  const [newLocationName, setNewLocationName] = useState('')
  const [newLocationLoading, setNewLocationLoading] = useState(false)

  const [itemRows, setItemRows] = useState<ItemRow[]>([makeRow()])
  const [showNewItemsDialog, setShowNewItemsDialog] = useState(false)

  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([])
  const [scannedSupplier, setScannedSupplier] = useState("")

  const [linkingIdx, setLinkingIdx] = useState<number | null>(null)
  const [linkSearch, setLinkSearch] = useState("")
  const [saveAsAlias, setSaveAsAlias] = useState(false)

  // Mapa de alias (nombre alternativo → item) para matching automático en OCR
  const aliasMap = useMemo(() => {
    const map = new Map<string, ItemWithStock>()
    items.forEach(i => {
      if (i.aliases) {
        i.aliases.split(',').forEach(alias => {
          map.set(alias.trim().toLowerCase(), i)
        })
      }
    })
    return map
  }, [items])

  const [form, setForm] = useState({
    type: '' as MovementType | '',
    origin_location_id: searchParams.get('location') ?? '',
    destination_location_id: '',
    notes: '',
    reference_number: '',
    responsible_id: '',
    supplier: '',
    recipient_name: '',
    ticket_total: '',
  })

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))
  const isMultiType = form.type === 'entrada' || form.type === 'salida'

  const loadData = useCallback(async () => {
    // Intentar con variant_info; si falla (columna no existe aún), reintentar sin ella
    const itemsRes1 = await supabase.from("items").select("id, name, unit, sku, variant_info, aliases").eq("is_active", true).order("name")
    const itemsRes2 = itemsRes1.error
      ? await supabase.from("items").select("id, name, unit, sku").eq("is_active", true).order("name")
      : null
    const itemsData: ItemWithStock[] = ((itemsRes2 ?? itemsRes1).data as ItemWithStock[]) ?? []
    const [locationsRes, profilesRes, userRes, suppliersRes] = await Promise.all([
      supabase.from("locations").select("id, name, type").eq("is_active", true).order("name"),
      supabase.from("profiles").select("id, full_name, role").order("full_name"),
      supabase.auth.getUser(),
      supabase.from("movements").select("supplier").not("supplier", "is", null),
    ])
    setItems(itemsData)
    setLocations((locationsRes.data as Location[]) ?? [])
    setProfiles((profilesRes.data as Profile[]) ?? [])
    const uniqueSuppliers = [...new Set(
      ((suppliersRes.data ?? []) as { supplier: string }[]).map(m => m.supplier).filter(Boolean)
    )].sort()
    setSuppliers(uniqueSuppliers)
    const uid = userRes.data.user?.id ?? ""
    setCurrentUserId(uid)
    if (uid) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", uid).single()
      const admin = (profile as { role: string } | null)?.role === "admin"
      setIsAdmin(admin)
      if (!admin) {
        setForm(f => ({ ...f, responsible_id: uid }))
      }
    }
    const preItemId = searchParams.get('item')
    if (preItemId && itemsData.length > 0) {
      const preItem = itemsData.find(i => i.id === preItemId)
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
    // Construir mapa de alias → item para matching automático
    const aliasMap = new Map<string, ItemWithStock>()
    items.forEach(i => {
      if (i.aliases) {
        i.aliases.split(',').forEach(alias => {
          aliasMap.set(alias.trim().toLowerCase(), i)
        })
      }
    })

    const newRows: ItemRow[] = scannedItems.map(si => {
      // Si tiene matched_id (por OCR) usar ese; si no, buscar por alias
      const resolvedItem = si.matched_id
        ? items.find(i => i.id === si.matched_id) ?? null
        : aliasMap.get(si._name.toLowerCase().trim()) ?? null

      return makeRow({
        item_id: resolvedItem?.id ?? null,
        item_name: resolvedItem?.name ?? si._name,
        variant_info: resolvedItem?.variant_info ?? si._variant_info,
        unit: resolvedItem?.unit ?? 'pieza',
        quantity: si._quantity,
        unit_cost: si._unit_cost,
        is_new: !resolvedItem,
        search: resolvedItem
          ? resolvedItem.name + (resolvedItem.variant_info ? ` — ${resolvedItem.variant_info}` : '')
          : si._name + (si._variant_info ? ` — ${si._variant_info}` : ''),
      })
    })
    setItemRows(prev => {
      const nonEmpty = prev.filter(r => r.item_id || r.item_name.trim())
      return nonEmpty.length ? [...nonEmpty, ...newRows] : newRows
    })
    if (scannedSupplier) setForm(f => ({ ...f, supplier: scannedSupplier, type: f.type || 'entrada' }))
    setScannerOpen(false)
    setScannedItems([])
    setScannedSupplier("")
    setLinkingIdx(null)
  }

  async function handleCreateLocation() {
    if (!newLocationName.trim()) return
    setNewLocationLoading(true)
    const { data, error } = await supabase.from("locations").insert({
      name: newLocationName.trim(),
      type: 'almacén' as const,
      created_by: currentUserId,
    }).select("id, name, type, description, is_active, created_at").single()
    if (!error && data) {
      const newLoc = data as Location
      setLocations(prev => [...prev, newLoc].sort((a, b) => a.name.localeCompare(b.name)))
      if (newLocationTarget === 'origin') update('origin_location_id', newLoc.id)
      else if (newLocationTarget === 'destination') update('destination_location_id', newLoc.id)
      setShowNewLocationDialog(false)
      setNewLocationName('')
    }
    setNewLocationLoading(false)
  }

  async function doSubmit() {
    setLoading(true)
    setError(null)

    const validRows = itemRows.filter(r => (r.item_id || r.item_name.trim()) && r.quantity && parseFloat(r.quantity) > 0)
    const movementIds: string[] = []

    for (const row of validRows) {
      let itemId = row.item_id
      // Si el usuario escribió texto sin seleccionar ni clicar "+Crear", tratarlo como nuevo artículo
      const treatAsNew = row.is_new || (!row.item_id && row.item_name.trim() !== '')
      if (treatAsNew) {
        const { data: newItem, error: itemError } = await supabase.from("items").insert({
          name: row.item_name.trim(),
          variant_info: row.variant_info.trim() || null,
          unit: row.unit || 'pieza',
          created_by: currentUserId,
        }).select("id").single()
        if (itemError) {
          setError(`No se pudo crear el artículo "${row.item_name}": ${itemError.message}`)
          setLoading(false)
          return
        }
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
        p_recipient_name: form.recipient_name || undefined,
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
      const sumOfCosts = validRows.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_cost) || 0), 0)
      const ticketTotalVal = form.ticket_total ? parseFloat(form.ticket_total) : 0
      const cashAmount = ticketTotalVal > 0 ? ticketTotalVal : sumOfCosts
      if (cashAmount > 0) {
        const { data: activeFunds } = await supabase.from("cash_funds").select("id").eq("is_active", true).limit(1)
        if (activeFunds?.length) {
          await supabase.from("cash_transactions").insert({
            fund_id: (activeFunds[0] as { id: string }).id,
            type: 'gasto',
            amount: cashAmount,
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
    if (form.type === 'salida' && !form.recipient_name.trim()) return setError("Indica a quién se le entrega")
    if (form.type === 'entrada' && !form.supplier.trim()) return setError("El proveedor es obligatorio para entradas")
    if (form.type === 'entrada' && !form.ticket_total.trim()) return setError("El total del ticket es obligatorio para entradas")

    if (validRows.some(r => r.is_new || (!r.item_id && r.item_name.trim() !== ''))) {
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
                      onChange={e => updateRow(row.rowId, { search: e.target.value, item_name: e.target.value, showDropdown: true, item_id: null, is_new: false })}
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
                  {form.type === 'entrada' ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[90px_1fr] gap-2">
                        <Select value={row.unit} onValueChange={v => updateRow(row.rowId, { unit: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pieza">Pieza</SelectItem>
                            <SelectItem value="metro">Metro</SelectItem>
                            <SelectItem value="kilo">Kilo</SelectItem>
                            {!['pieza', 'metro', 'kilo'].includes(row.unit) && row.unit && (
                              <SelectItem value={row.unit}>{row.unit}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Cantidad"
                          value={row.quantity}
                          onChange={e => updateRow(row.rowId, { quantity: e.target.value })}
                        />
                      </div>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="$ Costo unit."
                        value={row.unit_cost}
                        onChange={e => updateRow(row.rowId, { unit_cost: e.target.value })}
                      />
                    </div>
                  ) : (
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
                  )}
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
                  <Select value={form.origin_location_id} onValueChange={v => {
                    if (v === '__new_location__') {
                      setNewLocationTarget('origin')
                      setShowNewLocationDialog(true)
                      return
                    }
                    update('origin_location_id', v)
                  }}>
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
                      {isAdmin && (
                        <SelectItem value="__new_location__" className="text-primary font-medium">
                          <span className="flex items-center gap-1">
                            <Plus className="h-3.5 w-3.5" />
                            Crear almacén
                          </span>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showDestination && (
                <div className="space-y-2">
                  <Label htmlFor="destination">
                    {form.type === 'transferencia' ? 'Destino *' : 'Entra a *'}
                  </Label>
                  <Select value={form.destination_location_id} onValueChange={v => {
                    if (v === '__new_location__') {
                      setNewLocationTarget('destination')
                      setShowNewLocationDialog(true)
                      return
                    }
                    update('destination_location_id', v)
                  }}>
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
                      {isAdmin && (
                        <SelectItem value="__new_location__" className="text-primary font-medium">
                          <span className="flex items-center gap-1">
                            <Plus className="h-3.5 w-3.5" />
                            Crear almacén
                          </span>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.type === 'entrada' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="supplier">Proveedor <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <Input
                        id="supplier"
                        placeholder="Ej: Ferretería López"
                        value={form.supplier}
                        autoComplete="off"
                        onChange={e => { update('supplier', e.target.value); setShowSupplierDropdown(true) }}
                        onFocus={() => setShowSupplierDropdown(true)}
                        onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 150)}
                      />
                      {showSupplierDropdown && form.supplier.trim() && (
                        (() => {
                          const filtered = suppliers.filter(s => s.toLowerCase().includes(form.supplier.toLowerCase()))
                          const exactMatch = suppliers.some(s => s.toLowerCase() === form.supplier.toLowerCase().trim())
                          if (filtered.length === 0 && exactMatch) return null
                          return (
                            <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                              {filtered.map(s => (
                                <button
                                  key={s}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                                  onMouseDown={() => { update('supplier', s); setShowSupplierDropdown(false) }}
                                >
                                  {s}
                                </button>
                              ))}
                              {!exactMatch && (
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors border-t"
                                  onMouseDown={() => { update('supplier', form.supplier.trim()); setShowSupplierDropdown(false) }}
                                >
                                  + Usar: &ldquo;{form.supplier.trim()}&rdquo;
                                </button>
                              )}
                            </div>
                          )
                        })()
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ref">No. Factura / Remisión</Label>
                    <Input id="ref" placeholder="FAC-001" value={form.reference_number} onChange={e => update('reference_number', e.target.value)} />
                  </div>
                </>
              )}

              {/* Campo "Entregado a" solo para salidas */}
              {form.type === 'salida' && (
                <div className="space-y-2">
                  <Label htmlFor="recipient">Entregado a *</Label>
                  <div className="relative">
                    <Input
                      id="recipient"
                      placeholder="Nombre del albañil o trabajador"
                      value={form.recipient_name}
                      autoComplete="off"
                      onChange={e => { update('recipient_name', e.target.value); setShowRecipientDropdown(true) }}
                      onFocus={() => setShowRecipientDropdown(true)}
                      onBlur={() => setTimeout(() => setShowRecipientDropdown(false), 150)}
                    />
                    {showRecipientDropdown && form.recipient_name.trim() && (() => {
                      const workers = profiles.filter(p =>
                        p.role === 'trabajador' &&
                        p.full_name.toLowerCase().includes(form.recipient_name.toLowerCase())
                      )
                      if (workers.length === 0) return null
                      return (
                        <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                          {workers.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                              onMouseDown={() => { update('recipient_name', p.full_name); setShowRecipientDropdown(false) }}
                            >
                              {p.full_name}
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* Responsable: solo admin puede cambiar; los demás quedan como ellos mismos */}
              {isAdmin ? (
                <div className="space-y-2">
                  <Label htmlFor="responsible">Responsable del movimiento</Label>
                  <Select value={form.responsible_id} onValueChange={v => update('responsible_id', v)}>
                    <SelectTrigger id="responsible"><SelectValue placeholder="¿Quién realiza el movimiento?" /></SelectTrigger>
                    <SelectContent>
                      {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" placeholder="Observaciones del movimiento..." value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Total del ticket */}
        {form.type === 'entrada' && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Total del ticket <span className="text-destructive">*</span></CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              <Input
                id="ticket_total"
                type="number"
                min="0"
                step="0.01"
                placeholder="$ Total pagado al proveedor"
                value={form.ticket_total}
                onChange={e => update('ticket_total', e.target.value)}
              />
              {totalCost > 0 && (() => {
                const ticketTotalVal = form.ticket_total ? parseFloat(form.ticket_total) : 0
                const effectiveTotal = ticketTotalVal > 0 ? ticketTotalVal : totalCost
                const discount = ticketTotalVal > 0 && ticketTotalVal < totalCost ? totalCost - ticketTotalVal : 0
                const extra = ticketTotalVal > 0 && ticketTotalVal > totalCost ? ticketTotalVal - totalCost : 0
                return (
                  <div className="text-xs bg-muted/30 rounded px-3 py-2 space-y-1">
                    {ticketTotalVal > 0 && ticketTotalVal !== totalCost && (
                      <>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Suma por artículos</span>
                          <span>${totalCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Descuento en ticket</span>
                            <span>−${discount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {extra > 0 && (
                          <div className="flex justify-between text-orange-500">
                            <span>Cargos extra</span>
                            <span>+${extra.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        <div className="border-t border-muted-foreground/20 my-1" />
                      </>
                    )}
                    <div className="flex justify-between font-medium">
                      <span>Se descontarán de caja chica</span>
                      <strong>${effectiveTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    {discount > 0 && (
                      <p className="text-muted-foreground text-[11px] mt-0.5">Los precios unitarios son referencia; el descuento no se distribuye.</p>
                    )}
                  </div>
                )
              })()}
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
                      {(() => {
                        const isRecognized = !!si.matched_id || !!aliasMap.get(si._name.toLowerCase().trim())
                        if (isRecognized) {
                          return <Badge variant="outline" className="text-xs text-green-600 border-green-300"><Check className="h-2.5 w-2.5 mr-1" />Existente</Badge>
                        }
                        return (
                          <>
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">No reconocido</Badge>
                            <button
                              type="button"
                              className="text-xs text-primary underline"
                              onClick={() => { setLinkingIdx(idx); setLinkSearch(""); setSaveAsAlias(false) }}
                            >
                              Ligar a artículo
                            </button>
                          </>
                        )
                      })()}
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

      {/* Dialog: ligar artículo escaneado a artículo del catálogo */}
      <Dialog open={linkingIdx !== null} onOpenChange={open => { if (!open) setLinkingIdx(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ligar a artículo del catálogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {linkingIdx !== null && (
              <p className="text-sm text-muted-foreground">
                Concepto del proveedor: <strong>{scannedItems[linkingIdx]?._name}</strong>
              </p>
            )}
            <Input
              placeholder="Buscar artículo..."
              value={linkSearch}
              onChange={e => setLinkSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
              {items
                .filter(i => {
                  const q = linkSearch.toLowerCase()
                  return !q || i.name.toLowerCase().includes(q) || (i.variant_info ?? '').toLowerCase().includes(q) || (i.sku ?? '').toLowerCase().includes(q)
                })
                .slice(0, 20)
                .map(i => (
                  <button
                    key={i.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                    onClick={async () => {
                      if (linkingIdx === null) return
                      const conceptName = scannedItems[linkingIdx]._name.trim()
                      // Actualizar scannedItems con el matched_id
                      setScannedItems(prev => prev.map((s, idx) =>
                        idx === linkingIdx ? { ...s, matched_id: i.id, is_new: false } : s
                      ))
                      // Guardar alias si el checkbox está marcado
                      if (saveAsAlias && conceptName) {
                        const currentAliases = i.aliases ? i.aliases.split(',').map(a => a.trim()) : []
                        if (!currentAliases.map(a => a.toLowerCase()).includes(conceptName.toLowerCase())) {
                          const newAliases = [...currentAliases, conceptName].join(', ')
                          const { error } = await supabase.from('items').update({ aliases: newAliases }).eq('id', i.id)
                          if (!error) {
                            setItems(prev => prev.map(item => item.id === i.id ? { ...item, aliases: newAliases } : item))
                            toast({ title: "Nombre alternativo guardado para futuros escaneos" })
                          }
                        }
                      }
                      setLinkingIdx(null)
                    }}
                  >
                    <span className="font-medium">{i.name}</span>
                    {i.variant_info && <span className="text-muted-foreground"> — {i.variant_info}</span>}
                  </button>
                ))}
            </div>
            {scannedSupplier && linkingIdx !== null && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveAsAlias}
                  onChange={e => setSaveAsAlias(e.target.checked)}
                  className="rounded border-input"
                />
                Guardar &ldquo;{scannedItems[linkingIdx]?._name}&rdquo; como nombre alternativo del artículo seleccionado
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkingIdx(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog crear almacén */}
      <Dialog open={showNewLocationDialog} onOpenChange={v => { setShowNewLocationDialog(v); if (!v) setNewLocationName('') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Crear almacén</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input
              placeholder="Ej: Almacén Central"
              value={newLocationName}
              onChange={e => setNewLocationName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateLocation()}
              autoFocus
            />
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setShowNewLocationDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateLocation} disabled={!newLocationName.trim() || newLocationLoading}>
              {newLocationLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creando...</> : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
