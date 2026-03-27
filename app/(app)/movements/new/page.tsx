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
import { ArrowLeft, Camera, FileText, X, Upload } from "lucide-react"
import Link from "next/link"
import type { Item, Location, Profile, MovementType, AttachmentType } from "@/types/database"
import { toast } from "@/hooks/use-toast"
import imageCompression from "browser-image-compression"

const movementTypes: { value: MovementType; label: string; description: string }[] = [
  { value: 'entrada', label: 'Entrada', description: 'Llega mercancía al inventario' },
  { value: 'salida', label: 'Salida', description: 'Sale del inventario (consumo/uso)' },
  { value: 'transferencia', label: 'Transferencia', description: 'Se mueve entre ubicaciones' },
  { value: 'ajuste', label: 'Ajuste', description: 'Corrección de inventario físico' },
]

interface PendingFile {
  file: File
  preview: string
  type: AttachmentType
  name: string
}

export default function NewMovementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [files, setFiles] = useState<PendingFile[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>("")

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
  })

  const loadData = useCallback(async () => {
    const [itemsRes, locationsRes, profilesRes, userRes] = await Promise.all([
      supabase.from("items").select("id, name, unit, sku").eq("is_active", true).order("name"),
      supabase.from("locations").select("id, name, type").eq("is_active", true).order("name"),
      supabase.from("profiles").select("id, full_name, role").order("full_name"),
      supabase.auth.getUser(),
    ])
    setItems((itemsRes.data as Item[]) ?? [])
    setLocations((locationsRes.data as Location[]) ?? [])
    setProfiles((profilesRes.data as Profile[]) ?? [])
    setCurrentUserId(userRes.data.user?.id ?? "")
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  const selectedItem = items.find(i => i.id === form.item_id)

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
    })

    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }

    const movementId = data as string
    if (files.length > 0) await uploadFiles(movementId)

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

        {/* Artículo */}
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="item">Artículo *</Label>
              <Select value={form.item_id} onValueChange={(v) => update('item_id', v)}>
                <SelectTrigger id="item"><SelectValue placeholder="Selecciona un artículo" /></SelectTrigger>
                <SelectContent>
                  {items.map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}{i.sku ? ` (${i.sku})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unit_cost">Costo unitario ($)</Label>
                  <Input id="unit_cost" type="number" min="0" step="0.01" placeholder="0.00" value={form.unit_cost} onChange={(e) => update('unit_cost', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ref">No. Factura / Remisión</Label>
                  <Input id="ref" placeholder="Ej: FAC-001" value={form.reference_number} onChange={(e) => update('reference_number', e.target.value)} />
                </div>
              </div>
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
                  <Camera className="h-4 w-4" />
                  Foto
                </div>
                <input
                  id="foto-upload"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileChange(e, 'foto')}
                />
              </Label>

              <Label htmlFor="factura-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                  <FileText className="h-4 w-4" />
                  Factura
                </div>
                <input
                  id="factura-upload"
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileChange(e, 'factura')}
                />
              </Label>

              <Label htmlFor="doc-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                  <Upload className="h-4 w-4" />
                  Documento
                </div>
                <input
                  id="doc-upload"
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileChange(e, 'documento')}
                />
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">Las fotos se comprimen automáticamente antes de subirse.</p>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive border border-destructive/20 bg-destructive/10 rounded-md px-3 py-2">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? "Registrando..." : "Registrar movimiento"}
        </Button>
      </form>
    </div>
  )
}
