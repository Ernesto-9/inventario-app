"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Store,
  Check,
  Package,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import type { SupplierItemHistory } from "@/types/database"

interface PendingItem {
  id: string
  request_id: string
  item_id: string | null
  item_name: string
  quantity: number
  unit: string | null
  notes: string | null
  assigned_supplier: string | null
  location_id: string
  location_name: string
  requested_by: string
}

interface PurchaseModal {
  item: PendingItem
  actualQty: string
  actualCost: string
  supplier: string
  submitting: boolean
  error: string
}

export default function RutaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [items, setItems] = useState<PendingItem[]>([])
  const [history, setHistory] = useState<Record<string, SupplierItemHistory[]>>({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<PurchaseModal | null>(null)
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set(["Sin proveedor"]))
  const [supplierOverrides, setSupplierOverrides] = useState<Record<string, string>>({})
  const [supplierSearches, setSupplierSearches] = useState<Record<string, string>>({})

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: rawItems } = await supabase
      .from("purchase_request_items")
      .select(`
        id,
        request_id,
        item_id,
        item_name,
        quantity,
        unit,
        notes,
        assigned_supplier,
        purchase_requests!inner(
          location_id,
          status,
          locations:location_id(name),
          profiles:created_by(full_name)
        )
      `)
      .eq("status", "pendiente")

    if (!rawItems) { setLoading(false); return }

    // Filtrar solo de requests activos
    const pending: PendingItem[] = rawItems
      .filter((i: any) =>
        i.purchase_requests?.status === "pendiente" ||
        i.purchase_requests?.status === "en_proceso"
      )
      .map((i: any) => ({
        id: i.id,
        request_id: i.request_id,
        item_id: i.item_id,
        item_name: i.item_name,
        quantity: i.quantity,
        unit: i.unit,
        notes: i.notes,
        assigned_supplier: i.assigned_supplier,
        location_id: i.purchase_requests.location_id,
        location_name: i.purchase_requests.locations?.name ?? "Sin obra",
        requested_by: i.purchase_requests.profiles?.full_name ?? "Desconocido",
      }))

    setItems(pending)

    // Inicializar supplier overrides con los asignados previamente
    const overrides: Record<string, string> = {}
    pending.forEach(item => {
      if (item.assigned_supplier) overrides[item.id] = item.assigned_supplier
    })
    setSupplierOverrides(overrides)

    // Cargar historial de proveedores para items del catálogo
    const uniqueItemIds = [...new Set(pending.map(i => i.item_id).filter(Boolean))] as string[]
    if (uniqueItemIds.length > 0) {
      const { data: hist } = await supabase
        .from("supplier_item_history")
        .select("supplier, item_id, unit_cost, created_at, item_name, unit")
        .in("item_id", uniqueItemIds)
        .order("created_at", { ascending: false })

      // Agrupar por item_id, top proveedor primero
      const grouped: Record<string, SupplierItemHistory[]> = {}
      ;(hist ?? []).forEach((h: SupplierItemHistory) => {
        if (!grouped[h.item_id]) grouped[h.item_id] = []
        // Solo guardar las últimas 5 entradas por proveedor
        const existing = grouped[h.item_id].find(x => x.supplier === h.supplier)
        if (!existing) grouped[h.item_id].push(h)
      })
      setHistory(grouped)

      // Auto-asignar proveedor más reciente para items sin asignación
      setSupplierOverrides(prev => {
        const updated = { ...prev }
        pending.forEach(item => {
          if (!updated[item.id] && item.item_id && grouped[item.item_id]?.[0]) {
            updated[item.id] = grouped[item.item_id][0].supplier
          }
        })
        return updated
      })
    }

    setLoading(false)
  }

  function getEffectiveSupplier(item: PendingItem): string {
    return supplierOverrides[item.id] || item.assigned_supplier || "Sin proveedor"
  }

  // Agrupar items por proveedor efectivo
  const grouped = items.reduce<Record<string, PendingItem[]>>((acc, item) => {
    const supplier = getEffectiveSupplier(item)
    if (!acc[supplier]) acc[supplier] = []
    acc[supplier].push(item)
    return acc
  }, {})

  const supplierNames = Object.keys(grouped).sort((a, b) => {
    if (a === "Sin proveedor") return 1
    if (b === "Sin proveedor") return -1
    return a.localeCompare(b)
  })

  function toggleSupplier(name: string) {
    setExpandedSuppliers(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  async function saveSupplierAssignment(itemId: string, supplier: string) {
    await supabase
      .from("purchase_request_items")
      .update({ assigned_supplier: supplier || null })
      .eq("id", itemId)
  }

  function openPurchaseModal(item: PendingItem) {
    const topSupplier = supplierOverrides[item.id] || ""
    const lastCost = item.item_id && history[item.item_id]?.find(h => h.supplier === topSupplier)?.unit_cost
    setModal({
      item,
      actualQty: String(item.quantity),
      actualCost: lastCost ? String(lastCost) : "",
      supplier: topSupplier,
      submitting: false,
      error: "",
    })
  }

  async function confirmPurchase() {
    if (!modal) return
    const qty = parseFloat(modal.actualQty)
    if (!qty || qty <= 0) {
      setModal(m => m ? { ...m, error: "Ingresa una cantidad válida." } : null)
      return
    }
    setModal(m => m ? { ...m, submitting: true, error: "" } : null)

    try {
      // 1. Actualizar el item en purchase_request_items
      const { error: updateErr } = await supabase
        .from("purchase_request_items")
        .update({
          status: "comprado",
          purchased_quantity: qty,
          actual_unit_cost: modal.actualCost ? parseFloat(modal.actualCost) : null,
          assigned_supplier: modal.supplier || null,
        })
        .eq("id", modal.item.id)

      if (updateErr) throw new Error(updateErr.message)

      // 2. Si el item está en el catálogo, crear movimiento de entrada
      if (modal.item.item_id) {
        const { error: movErr } = await supabase.rpc("create_movement", {
          p_type: "entrada",
          p_item_id: modal.item.item_id,
          p_quantity: qty,
          p_destination_location_id: modal.item.location_id,
          p_unit_cost: modal.actualCost ? parseFloat(modal.actualCost) : undefined,
          p_supplier: modal.supplier || undefined,
          p_notes: `Compra desde pedido. ${modal.item.notes ?? ""}`.trim(),
        })
        if (movErr) throw new Error(movErr.message)
      }

      setModal(null)
      // Quitar el item de la lista local
      setItems(prev => prev.filter(i => i.id !== modal.item.id))
    } catch (e: unknown) {
      setModal(m => m ? { ...m, submitting: false, error: (e as Error).message } : null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="border-b px-6 py-5 sticky top-0 bg-background z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Ruta de compra</h1>
            {items.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {items.length} artículo{items.length !== 1 ? "s" : ""} en {supplierNames.length} tienda{supplierNames.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 py-20 text-center px-6">
          <Check className="h-12 w-12 text-green-500 mb-3" />
          <p className="font-medium text-lg">Todo comprado</p>
          <p className="text-sm text-muted-foreground mt-1">No hay artículos pendientes.</p>
        </div>
      )}

      <div className="px-6 py-4 space-y-4">
        {supplierNames.map((supplierName, idx) => {
          const supplierItems = grouped[supplierName]
          const isExpanded = expandedSuppliers.has(supplierName)

          return (
            <div key={supplierName} className="border rounded-xl overflow-hidden bg-card">
              {/* Cabecera del proveedor */}
              <button
                onClick={() => toggleSupplier(supplierName)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                    {idx + 1}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      {supplierName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {supplierItems.length} artículo{supplierItems.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {/* Artículos del proveedor */}
              {isExpanded && (
                <div className="border-t divide-y">
                  {supplierItems.map(item => {
                    const itemHistory = item.item_id ? history[item.item_id] ?? [] : []
                    const effectiveSupplier = supplierOverrides[item.id] || item.assigned_supplier || ""

                    return (
                      <div key={item.id} className="px-5 py-4 space-y-3">
                        {/* Nombre y origen */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5 min-w-0">
                            <p className="font-medium leading-tight">{item.item_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity} {item.unit ?? ""} · {item.location_name}
                            </p>
                            {item.notes && (
                              <p className="text-xs text-muted-foreground italic">{item.notes}</p>
                            )}
                          </div>
                          <button
                            onClick={() => openPurchaseModal(item)}
                            className="shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Comprado
                          </button>
                        </div>

                        {/* Proveedor asignable */}
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground font-medium">Proveedor</p>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Escribe o selecciona proveedor..."
                              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                              value={supplierSearches[item.id] ?? effectiveSupplier}
                              onChange={e => {
                                setSupplierSearches(prev => ({ ...prev, [item.id]: e.target.value }))
                                setSupplierOverrides(prev => ({ ...prev, [item.id]: e.target.value }))
                              }}
                              onBlur={async () => {
                                const val = supplierOverrides[item.id] ?? ""
                                await saveSupplierAssignment(item.id, val)
                                setSupplierSearches(prev => {
                                  const n = { ...prev }
                                  delete n[item.id]
                                  return n
                                })
                                // Reload to re-group
                                setItems(prev => [...prev])
                              }}
                            />
                          </div>

                          {/* Sugerencias de historial */}
                          {itemHistory.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {itemHistory.map(h => (
                                <button
                                  key={h.supplier}
                                  onClick={async () => {
                                    setSupplierOverrides(prev => ({ ...prev, [item.id]: h.supplier }))
                                    await saveSupplierAssignment(item.id, h.supplier)
                                    setItems(prev => [...prev])
                                  }}
                                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                    effectiveSupplier === h.supplier
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-background hover:bg-muted border-border"
                                  }`}
                                >
                                  {h.supplier}
                                  {h.unit_cost && (
                                    <span className="ml-1 opacity-70">
                                      ${h.unit_cost.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}

                          {itemHistory.length === 0 && item.item_id && (
                            <p className="text-xs text-muted-foreground">Sin historial de proveedores para este artículo.</p>
                          )}
                          {!item.item_id && (
                            <p className="text-xs text-muted-foreground">Artículo libre — no está en el catálogo.</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal: confirmar compra */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !modal.submitting && setModal(null)} />
          <div className="relative z-10 bg-background rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 space-y-5 shadow-xl">
            <div>
              <h2 className="text-lg font-bold">Marcar como comprado</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{modal.item.item_name}</p>
            </div>

            <div className="space-y-4">
              {/* Proveedor */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Proveedor</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  value={modal.supplier}
                  onChange={e => setModal(m => m ? { ...m, supplier: e.target.value } : null)}
                  placeholder="Nombre del proveedor"
                />
              </div>

              {/* Cantidad real */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Cantidad comprada <span className="text-muted-foreground font-normal">({modal.item.unit ?? "pza"})</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="w-full border rounded-lg px-3 py-2.5 text-base bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  value={modal.actualQty}
                  onChange={e => setModal(m => m ? { ...m, actualQty: e.target.value } : null)}
                />
                <p className="text-xs text-muted-foreground">
                  Pedido original: {modal.item.quantity} {modal.item.unit ?? ""}
                </p>
              </div>

              {/* Precio unitario */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Precio unitario <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="w-full border rounded-lg pl-7 pr-3 py-2.5 text-base bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    value={modal.actualCost}
                    onChange={e => setModal(m => m ? { ...m, actualCost: e.target.value } : null)}
                    placeholder="0.00"
                  />
                </div>
                {modal.actualQty && modal.actualCost && (
                  <p className="text-xs text-muted-foreground">
                    Total: ${(parseFloat(modal.actualQty) * parseFloat(modal.actualCost)).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>

              {!modal.item.item_id && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2.5">
                  <Package className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Este artículo no está en el catálogo. No se creará movimiento de inventario.</span>
                </div>
              )}

              {modal.error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2.5">{modal.error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => !modal.submitting && setModal(null)}
                disabled={modal.submitting}
                className="flex-1 border rounded-lg py-3 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPurchase}
                disabled={modal.submitting}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {modal.submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {modal.submitting ? "Registrando..." : "Confirmar compra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
