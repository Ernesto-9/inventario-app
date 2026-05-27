"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Package, Phone, MessageCircle, Trash2, Loader2 } from "lucide-react"
import { buildWhatsAppUrl, buildTelUrl } from "@/lib/whatsapp"
import type { Supplier } from "@/types/database"

interface LinkedItem {
  item_id: string
  item_name: string
  unit: string
  last_cost: number | null
}

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [items, setItems] = useState<LinkedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: "",
    phone: "",
    whatsapp_phone: "",
    notes: "",
  })

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function loadData() {
    setLoading(true)
    const { data: sup } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", id)
      .single()

    if (sup) {
      setSupplier(sup as Supplier)
      setForm({
        name: sup.name ?? "",
        phone: sup.phone ?? "",
        whatsapp_phone: sup.whatsapp_phone ?? "",
        notes: sup.notes ?? "",
      })

      const { data: linked } = await supabase
        .from("item_suppliers")
        .select("item_id, items:item_id(id, name, unit)")
        .eq("supplier_id", id)

      const itemIds = (linked ?? []).map((l: { item_id: string }) => l.item_id)
      let history: Record<string, number> = {}
      if (itemIds.length > 0) {
        const { data: hist } = await supabase
          .from("supplier_item_history")
          .select("item_id, unit_cost, created_at")
          .eq("supplier", sup.name)
          .in("item_id", itemIds)
          .order("created_at", { ascending: false })

        ;(hist ?? []).forEach((h: { item_id: string; unit_cost: number }) => {
          if (!(h.item_id in history)) history[h.item_id] = h.unit_cost
        })
      }

      type LinkRow = { item_id: string; items: { name: string; unit: string } | null }
      const withCost: LinkedItem[] = ((linked ?? []) as unknown as LinkRow[])
        .map(l => ({
          item_id: l.item_id,
          item_name: l.items?.name ?? "Sin nombre",
          unit: l.items?.unit ?? "",
          last_cost: history[l.item_id] ?? null,
        }))
        .sort((a, b) => a.item_name.localeCompare(b.item_name))

      setItems(withCost)
    }
    setLoading(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) return setError("El nombre es obligatorio")
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from("suppliers")
      .update({
        name,
        phone: form.phone.trim() || null,
        whatsapp_phone: form.whatsapp_phone.trim() || null,
        notes: form.notes.trim() || null,
      })
      .eq("id", id)

    if (error) {
      setError(error.message)
      setSaving(false)
    } else {
      setSaving(false)
      router.refresh()
      loadData()
    }
  }

  async function handleDelete() {
    if (!confirm("¿Desactivar este proveedor? No aparecerá en listas pero se conservan los datos históricos.")) return
    setDeleting(true)
    const { error } = await supabase
      .from("suppliers")
      .update({ is_active: false })
      .eq("id", id)

    if (error) {
      setError(error.message)
      setDeleting(false)
    } else {
      router.push("/proveedores")
      router.refresh()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!supplier) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Proveedor no encontrado.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/proveedores">Volver</Link>
        </Button>
      </div>
    )
  }

  const whatsappPhone = form.whatsapp_phone || form.phone
  const waUrl = buildWhatsAppUrl(whatsappPhone, "Hola")
  const telUrl = buildTelUrl(form.phone)

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/proveedores"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold flex-1 truncate">{supplier.name}</h1>
        <div className="flex gap-2">
          {waUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4 mr-1" />WhatsApp
              </a>
            </Button>
          )}
          {telUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={telUrl}>
                <Phone className="h-4 w-4 mr-1" />Llamar
              </a>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  placeholder="Si es distinto al teléfono"
                  value={form.whatsapp_phone}
                  onChange={e => setForm(f => ({ ...f, whatsapp_phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "Guardando..." : "Guardar cambios"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {deleting ? "..." : "Desactivar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Artículos ligados
            <span className="text-muted-foreground font-normal text-sm">({items.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sin artículos ligados todavía.
            </p>
          ) : (
            <div className="divide-y">
              {items.map(it => (
                <div key={it.item_id} className="flex items-center justify-between px-4 py-3">
                  <Link href={`/items/${it.item_id}`} className="font-medium hover:underline flex-1 min-w-0 truncate">
                    {it.item_name}
                  </Link>
                  <div className="text-right text-sm shrink-0 ml-3">
                    {it.last_cost != null ? (
                      <span className="font-semibold tabular-nums">
                        ${it.last_cost.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        <span className="text-muted-foreground font-normal"> / {it.unit}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Sin precio registrado</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
