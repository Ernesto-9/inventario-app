"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Camera, FileText, X, Upload, Search, ScanLine, Loader2, Check, Pencil } from "lucide-react"
import Link from "next/link"
import type { Location, Profile, MovementType, AttachmentType } from "@/types/database"
import { toast } from "@/hooks/use-toast"
import imageCompression from "browser-image-compression"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface ScannedItem {
  matched_id: string | null
  name: string
  variant_info: string | null
  quantity: number
  unit_cost: number
  is_new?: boolean
  // editable copies
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

interface PendingFile {
  file: File
  preview: string
  type: AttachmentType
  name: string
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
  const [currentUserId, setCurrentUserId] = useState<string>("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [availableStock, setAvailableStock] = useState<number | null>(null)

  // AI scanner
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([])
  const [scannedSupplier, setScannedSupplier] = useState("")
  const [confirmingScanned, setConfirmingScanned] = useState(false)

  // Item search
  const [itemSearch, setItemSearch] = useState("")
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false)
  const itemSearchRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState({
    type: '' as MovementType | '',
    item_id: searchParams.get('item') ?? '',
    quantity: '',
    origin_location_id: searchParams.get('location') ?? '',
    destination_location_id: '',
    notes: '',
    unit_cost: '',
    reference_number: '',
    responsible_id: '',
    supplier: '',
  })

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

    // Preselect item name if coming from URL
    const preselectedItemId = searchParams.get('item')
    if (preselectedItemId && itemsRes.data) {
      const preItem = (itemsRes.data as ItemWithStock[]).find(i => i.id === preselectedItemId)
      if (preItem) setItemSearch(preItem.name + (preItem.sku ? ` (${preItem.sku})` : ''))
    }
  }, [supabase, searchParams])

  useEffect(() => { loadData() }, [loadData])

  // Fetch available stock when item + origin location selected
  useEffect(() => {
    const fetch = async () => {
      const showOrigin = form.type === 'salida' || form.type === 'transferencia' || form.type === 'ajuste'
      if (form.item_id && form.origin_location_id && showOrigin) {
        const { data } = await supabase
          .from("stock")
          .select("quantity")
          .eq("item_id", form.item_id)
          .eq("location_id", form.origin_location_id)
          .single()
        setAvailableStock((data as { quantity: number } | null)?.quantity ?? 0)
      } else {
        setAvailableStock(null)
      }
    }
    fetch()
  }, [form.item_id, form.origin_location_id, form.type, supabase])

  // Close item dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (itemSearchRef.current && !itemSearchRef.current.contains(e.target as Node)) {
        setItemDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  const selectedItem = items.find(i => i.id === form.item_id)

  const movementTypes = isAdmin ? allMovementTypes : allMovementTypes.filter(t => t.value !== 'ajuste')

  const filteredItems = items.filter(i =>
    !itemSearch ||
    i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    (i.sku && i.sku.toLowerCase().includes(itemSearch.toLowerCase())) ||
    (i.variant_info && i.variant_info.toLowerCase().includes(itemSearch.toLowerCase()))
  )

  async function handleScanTicket(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setScanning(true)
    setScanError(null)
    setScannerOpen(true)

    try {
      const compressed = file.type.startsWith('image/')
        ? await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 })
        : file

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(compressed)
      })

      const existingItems = items.map(i => ({ id: i.id, name: i.name, variant_info: i.variant_info, sku: i.sku }))

      const res = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType: compressed.type, existingItems }),
      })

      if (!res.ok) {
        const err = await res.json()
        setScanError(err.error ?? 'Error al procesar')
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

  async function confirmScannedItems() {
    if (!scannedItems.length) return
    setConfirmingScanned(true)

    const { data: activeFunds } = await supabase.from("cash_funds").select("id").eq("is_active", true).limit(1)
    const fundId = (activeFunds?.[0] as { id: string } | undefined)?.id

    for (const si of scannedItems) {
      let itemId = si.matched_id

      // Crear artículo si es nuevo
      if (!itemId) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: newItem } = await supabase.from("items").insert({
          name: si._name,
          variant_info: si._variant_info || null,
          unit: 'pieza',
          created_by: user?.id,
        }).select("id").single()
        itemId = (newItem as { id: string } | null)?.id ?? null
      }

      if (!itemId) continue

      const qty = parseFloat(si._quantity) || 1
      const cost = parseFloat(si._unit_cost) || 0

      const { data: movId } = await supabase.rpc("create_movement", {
        p_type: 'entrada',
        p_item_id: itemId,
        p_quantity: qty,
        p_unit_cost: cost || undefined,
        p_supplier: scannedSupplier || undefined,
        p_notes: 'Registrado por escaneo de ticket',
      })

      // Auto-descuento caja chica
      if (fundId && cost > 0) {
        await supabase.from("cash_transactions").insert({
          fund_id: fundId,
          type: 'gasto',
          amount: qty * cost,
          description: `Compra: ${si._name} x${qty}`,
          movement_id: movId as string,
          created_by: currentUserId,
        })
      }
    }

    setConfirmingScanned(false)
    setScannerOpen(false)
    toast({ title: `${scannedItems.length} entrada(s) registradas desde ticket` })
    router.push('/movements')
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, fileType: AttachmentType) {
    const selectedFiles = Array.from(e.target.files ?? [])
    for (const file of selectedFiles) {
      let processedFile = file
      if (file.type.startsWith('image/')) {
        processedFile = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 })
      }
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(processedFile) : ''
      setFiles(prev => [...prev, { file: processedFile, preview, type: fileType, name: file.name }])
    }
    e.target.value = ''
  }

  async function uploadFiles(movementId: string) {
    for (const pending of files) {
      const ext = pending.name.split('.').pop()
      const path = `movements/${movementId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(path, pending.file, { cacheControl: '3600' })
      if (uploadError) continue
      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path)
      await supabase.from("movement_attachments").insert({
        movement_id: movementId,
        type: pending.type,
        file_url: publicUrl,
        file_name: pending.name,
        file_size: pending.file.size,
        uploaded_by: currentUserId,
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.type) return setError("Selecciona el tipo de movimiento")
    if (!form.item_id) return setError("Selecciona un artículo")
    if (!form.quantity || parseFloat(form.quantity) <= 0) return setError("La cantidad debe ser mayor a 0")

    // Validar stock disponible
    const showOrigin = form.type === 'salida' || form.type === 'transferencia'
    if (showOrigin && availableStock !== null && parseFloat(form.quantity) > availableStock) {
      return setError(`Stock insuficiente. Disponible: ${availableStock} ${selectedItem?.unit ?? ''}`)
    }

    setLoading(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc("create_movement", {
      p_type: form.type,
      p_item_id: form.item_id,
      p_quantity: parseFloat(form.quantity),
      p_origin_location_id: form.origin_location_id || undefined,
      p_destination_location_id: form.destination_location_id || undefined,
      p_notes: form.notes || undefined,
      p_unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : undefined,
      p_reference_number: form.reference_number || undefined,
      p_responsible_id: form.responsible_id || undefined,
      p_supplier: form.supplier || undefined,
    })

    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }

    const movementId = data as string
    if (files.length > 0) await uploadFiles(movementId)

    // Auto-descuento de caja chica si es entrada con costo
    if (form.type === 'entrada' && form.unit_cost && parseFloat(form.unit_cost) > 0) {
      const { data: activeFunds } = await supabase
        .from("cash_funds")
        .select("id")
        .eq("is_active", true)
        .limit(1)

      if (activeFunds && activeFunds.length > 0) {
        const totalCost = parseFloat(form.quantity) * parseFloat(form.unit_cost)
        await supabase.from("cash_transactions").insert({
          fund_id: (activeFunds[0] as { id: string }).id,
          type: 'gasto',
          amount: totalCost,
          description: `Compra: ${selectedItem?.name ?? 'Artículo'} x${form.quantity}`,
          movement_id: movementId,
          created_by: currentUserId,
        })
      }
    }

    toast({ title: "Movimiento registrado", variant: "default" })
    router.push(`/movements/${movementId}`)
    router.refresh()
  }

  const showOrigin = form.type === 'salida' || form.type === 'transferencia' || form.type === 'ajuste'
  const showDestination = form.type === 'entrada' || form.type === 'transferencia'

  return (
    <div className="p-4 md:p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/movements"><ArrowLeft className="h-4 w-4" /></Link>
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
                onClick={() => update('type', t.value)}
                className={`text-left rounded-lg border p-3 transition-colors ${form.type === t.value ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/50'}`}
              >
                <p className="font-medium text-sm">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Artículo con búsqueda */}
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="space-y-2">
              <Label>Artículo *</Label>
              <div className="relative" ref={itemSearchRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9"
                  placeholder="Buscar artículo por nombre o SKU..."
                  value={itemSearch}
                  onChange={e => {
                    setItemSearch(e.target.value)
                    setItemDropdownOpen(true)
                    if (form.item_id) update('item_id', '')
                  }}
                  onFocus={() => setItemDropdownOpen(true)}
                />
                {itemDropdownOpen && filteredItems.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                    {filteredItems.slice(0, 20).map(i => (
                      <button
                        key={i.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                        onMouseDown={() => {
                          update('item_id', i.id)
                          setItemSearch(i.name + (i.variant_info ? ` — ${i.variant_info}` : '') + (i.sku ? ` (${i.sku})` : ''))
                          setItemDropdownOpen(false)
                        }}
                      >
                        <span className="font-medium">{i.name}</span>
                        {i.variant_info && <span className="text-muted-foreground"> — {i.variant_info}</span>}
                        {i.sku && <span className="text-muted-foreground text-xs ml-1">({i.sku})</span>}
                        <span className="text-muted-foreground text-xs ml-1">· {i.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedItem && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                  <span className="font-medium text-foreground">{selectedItem.name}</span>
                  {selectedItem.variant_info && <span>— {selectedItem.variant_info}</span>}
                  <span>· {selectedItem.unit}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">
                Cantidad *{selectedItem && <span className="text-muted-foreground font-normal ml-1">({selectedItem.unit})</span>}
              </Label>
              <Input
                id="quantity"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0"
                value={form.quantity}
                onChange={(e) => update('quantity', e.target.value)}
                required
              />
              {availableStock !== null && (
                <p className={`text-xs ${form.quantity && parseFloat(form.quantity) > availableStock ? 'text-destructive' : 'text-muted-foreground'}`}>
                  Disponible: {availableStock} {selectedItem?.unit}
                </p>
              )}
            </div>

            {/* Origen */}
            {showOrigin && (
              <div className="space-y-2">
                <Label htmlFor="origin">
                  {form.type === 'transferencia' ? 'Origen *' : form.type === 'salida' ? 'Sale de *' : 'Ubicación a ajustar *'}
                </Label>
                <Select value={form.origin_location_id} onValueChange={(v) => update('origin_location_id', v)}>
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

            {/* Destino */}
            {showDestination && (
              <div className="space-y-2">
                <Label htmlFor="destination">
                  {form.type === 'transferencia' ? 'Destino *' : 'Entra a *'}
                </Label>
                <Select value={form.destination_location_id} onValueChange={(v) => update('destination_location_id', v)}>
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

            {/* Responsable */}
            <div className="space-y-2">
              <Label htmlFor="responsible">Responsable</Label>
              <Select value={form.responsible_id} onValueChange={(v) => update('responsible_id', v)}>
                <SelectTrigger id="responsible"><SelectValue placeholder="¿Quién realiza el movimiento?" /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Datos opcionales */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Información adicional</CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-0">
            {form.type === 'entrada' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="unit_cost">Costo unitario ($)</Label>
                    <Input id="unit_cost" type="number" min="0" step="0.01" placeholder="0.00" value={form.unit_cost} onChange={(e) => update('unit_cost', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ref">No. Factura / Remisión</Label>
                    <Input id="ref" placeholder="FAC-001" value={form.reference_number} onChange={(e) => update('reference_number', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplier">Proveedor</Label>
                  <Input id="supplier" placeholder="Ej: Ferretería López" value={form.supplier} onChange={(e) => update('supplier', e.target.value)} />
                </div>
                {form.unit_cost && parseFloat(form.unit_cost) > 0 && form.quantity && (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                    Se descontará <strong>${(parseFloat(form.quantity) * parseFloat(form.unit_cost)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong> de caja chica automáticamente.
                  </p>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" placeholder="Observaciones del movimiento..." value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>

        {/* Adjuntos */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Fotos y documentos</CardTitle></CardHeader>
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
                      {f.type === 'foto' ? 'foto' : f.type === 'factura' ? 'fac' : 'doc'}
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
              <Label htmlFor="foto-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                  <Camera className="h-4 w-4" />Foto
                </div>
                <input id="foto-upload" type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => handleFileChange(e, 'foto')} />
              </Label>
              <Label htmlFor="factura-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                  <FileText className="h-4 w-4" />Factura
                </div>
                <input id="factura-upload" type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => handleFileChange(e, 'factura')} />
              </Label>
              <Label htmlFor="doc-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                  <Upload className="h-4 w-4" />Documento
                </div>
                <input id="doc-upload" type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={(e) => handleFileChange(e, 'documento')} />
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">Las fotos se comprimen automáticamente antes de subirse.</p>

            {/* Escanear ticket con IA */}
            <div className="border-t pt-3">
              <Label htmlFor="scan-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-sm text-primary hover:bg-primary/10 transition-colors">
                  <ScanLine className="h-4 w-4" />
                  Escanear ticket con IA
                </div>
                <input
                  id="scan-upload"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleScanTicket}
                />
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Sube foto de un ticket o factura y la IA registra las entradas automáticamente.
              </p>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive border border-destructive/20 bg-destructive/10 rounded-md px-3 py-2">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? "Registrando..." : "Registrar movimiento"}
        </Button>
      </form>

      {/* Dialog escaneo IA */}
      <Dialog open={scannerOpen} onOpenChange={v => { if (!scanning && !confirmingScanned) setScannerOpen(v) }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Escaneo de ticket</DialogTitle>
          </DialogHeader>

          {scanning && (
            <div className="flex flex-col items-center py-8 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Analizando ticket...</p>
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
                    <Input
                      placeholder="Nombre"
                      value={si._name}
                      onChange={e => setScannedItems(prev => prev.map((s, i) => i === idx ? { ...s, _name: e.target.value } : s))}
                    />
                    <Input
                      placeholder="Especificación (opcional)"
                      value={si._variant_info}
                      onChange={e => setScannedItems(prev => prev.map((s, i) => i === idx ? { ...s, _variant_info: e.target.value } : s))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        placeholder="Cantidad"
                        value={si._quantity}
                        onChange={e => setScannedItems(prev => prev.map((s, i) => i === idx ? { ...s, _quantity: e.target.value } : s))}
                      />
                      <Input
                        type="number"
                        placeholder="$ Costo unit."
                        value={si._unit_cost}
                        onChange={e => setScannedItems(prev => prev.map((s, i) => i === idx ? { ...s, _unit_cost: e.target.value } : s))}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button className="w-full" onClick={confirmScannedItems} disabled={confirmingScanned}>
                {confirmingScanned ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Registrando...</> : `Confirmar ${scannedItems.length} entrada(s)`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
