"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, ArrowLeft, Loader2, Search } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { Location, Item } from "@/types/database"

interface LineItem {
  id: string
  item_id: string | null
  item_name: string
  quantity: string
  unit: string
  notes: string
}

function newLine(): LineItem {
  return { id: crypto.randomUUID(), item_id: null, item_name: "", quantity: "", unit: "", notes: "" }
}

export default function NuevoPedidoPage() {
  const router = useRouter()
  const supabase = createClient()

  const [locations, setLocations] = useState<Location[]>([])
  const [locationId, setLocationId] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineItem[]>([newLine()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [locationsLoaded, setLocationsLoaded] = useState(false)

  // Item search state per line
  const [searches, setSearches] = useState<Record<string, string>>({})
  const [searchResults, setSearchResults] = useState<Record<string, Item[]>>({})

  const loadLocations = useCallback(async () => {
    if (locationsLoaded) return
    const { data } = await supabase
      .from("locations")
      .select("*")
      .eq("is_active", true)
      .in("type", ["obra", "almacén", "otro"])
      .order("name")
    setLocations(data ?? [])
    setLocationsLoaded(true)
  }, [locationsLoaded, supabase])

  async function searchItems(lineId: string, query: string) {
    setSearches(prev => ({ ...prev, [lineId]: query }))
    if (query.length < 2) {
      setSearchResults(prev => ({ ...prev, [lineId]: [] }))
      return
    }
    const { data } = await supabase
      .from("items")
      .select("id, name, unit")
      .eq("is_active", true)
      .ilike("name", `%${query}%`)
      .limit(8)
    setSearchResults(prev => ({ ...prev, [lineId]: (data ?? []) as Item[] }))
  }

  function selectItem(lineId: string, item: Item) {
    setLines(prev => prev.map(l =>
      l.id === lineId
        ? { ...l, item_id: item.id, item_name: item.name, unit: item.unit }
        : l
    ))
    setSearches(prev => ({ ...prev, [lineId]: "" }))
    setSearchResults(prev => ({ ...prev, [lineId]: [] }))
  }

  function updateLine(lineId: string, field: keyof LineItem, value: string) {
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, [field]: value } : l))
  }

  function clearItemSelection(lineId: string) {
    setLines(prev => prev.map(l =>
      l.id === lineId ? { ...l, item_id: null, item_name: "", unit: "" } : l
    ))
  }

  function removeLine(lineId: string) {
    if (lines.length === 1) return
    setLines(prev => prev.filter(l => l.id !== lineId))
  }

  async function handleSubmit() {
    setError("")
    if (!locationId) { setError("Selecciona la obra del pedido."); return }
    const validLines = lines.filter(l => l.item_name.trim() && l.quantity && parseFloat(l.quantity) > 0)
    if (validLines.length === 0) { setError("Agrega al menos un artículo con cantidad."); return }

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No autenticado")

      // Crear la solicitud
      const { data: req, error: reqErr } = await supabase
        .from("purchase_requests")
        .insert({ created_by: user.id, location_id: locationId, notes: notes || null })
        .select("id")
        .single()

      if (reqErr || !req) throw new Error(reqErr?.message ?? "Error al crear solicitud")

      // Insertar artículos
      const items = validLines.map(l => ({
        request_id: req.id,
        item_id: l.item_id || null,
        item_name: l.item_name.trim(),
        quantity: parseFloat(l.quantity),
        unit: l.unit || null,
        notes: l.notes || null,
      }))

      const { error: itemsErr } = await supabase.from("purchase_request_items").insert(items)
      if (itemsErr) throw new Error(itemsErr.message)

      router.push("/pedidos")
      router.refresh()
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold">Nuevo pedido</h1>
        </div>
      </div>

      <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
        {/* Obra */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold">Para qué obra?</label>
          <select
            className="w-full border rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            value={locationId}
            onChange={e => setLocationId(e.target.value)}
            onFocus={loadLocations}
          >
            <option value="">Selecciona una ubicación...</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>

        {/* Artículos */}
        <div className="space-y-3">
          <label className="text-sm font-semibold">Artículos a pedir</label>

          {lines.map((line, idx) => (
            <div key={line.id} className="border rounded-xl p-4 space-y-3 bg-card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Artículo {idx + 1}</span>
                {lines.length > 1 && (
                  <button
                    onClick={() => removeLine(line.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Buscador de artículo */}
              <div className="relative">
                {line.item_id ? (
                  <div className="flex items-center justify-between border rounded-lg px-3 py-2.5 bg-muted/40">
                    <span className="text-sm font-medium">{line.item_name}</span>
                    <button
                      onClick={() => clearItemSelection(line.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Buscar o escribir artículo..."
                        className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        value={searches[line.id] ?? line.item_name}
                        onChange={e => {
                          searchItems(line.id, e.target.value)
                          updateLine(line.id, "item_name", e.target.value)
                        }}
                      />
                    </div>
                    {(searchResults[line.id]?.length ?? 0) > 0 && (
                      <div className="absolute left-0 right-0 z-20 mt-1 bg-card border rounded-xl shadow-lg overflow-hidden">
                        {searchResults[line.id].map(item => (
                          <button
                            key={item.id}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-b last:border-0"
                            onClick={() => selectItem(line.id, item)}
                          >
                            <span className="font-medium">{item.name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">{item.unit}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Cantidad + unidad */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Cantidad</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    className="w-full border rounded-lg px-3 py-2.5 text-base bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    value={line.quantity}
                    onChange={e => updateLine(line.id, "quantity", e.target.value)}
                  />
                </div>
                <div className="w-28">
                  <label className="text-xs text-muted-foreground mb-1 block">Unidad</label>
                  <input
                    type="text"
                    placeholder="pza, kg..."
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    value={line.unit}
                    onChange={e => updateLine(line.id, "unit", e.target.value)}
                  />
                </div>
              </div>

              {/* Nota */}
              <div>
                <input
                  type="text"
                  placeholder="Nota (opcional)"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  value={line.notes}
                  onChange={e => updateLine(line.id, "notes", e.target.value)}
                />
              </div>
            </div>
          ))}

          <button
            onClick={() => setLines(prev => [...prev, newLine()])}
            className="w-full border-2 border-dashed rounded-xl py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Agregar otro artículo
          </button>
        </div>

        {/* Nota general */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold">Nota general (opcional)</label>
          <textarea
            placeholder="Urgente, para el lunes, etc."
            className="w-full border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">{error}</p>
        )}

        {/* Botón submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-primary text-primary-foreground rounded-xl py-4 text-base font-semibold disabled:opacity-60 flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
          {submitting ? "Enviando..." : "Enviar pedido"}
        </button>

        <div className="h-4" />
      </div>
    </div>
  )
}
