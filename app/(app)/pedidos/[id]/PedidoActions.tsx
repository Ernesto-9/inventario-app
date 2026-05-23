"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, ShoppingCart } from "lucide-react"
import type { PurchaseRequestItem, PurchaseRequestStatus } from "@/types/database"

interface Props {
  requestId: string
  currentStatus: PurchaseRequestStatus
  items: PurchaseRequestItem[]
  isAdmin: boolean
}

export default function PedidoActions({ requestId, currentStatus, items: initialItems, isAdmin }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [items, setItems] = useState(initialItems)
  const [requestStatus, setRequestStatus] = useState(currentStatus)
  const [loading, setLoading] = useState<string | null>(null)

  async function toggleItem(itemId: string, current: PurchaseRequestStatus | string) {
    const newStatus = current === "comprado" ? "pendiente" : "comprado"
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: newStatus as PurchaseRequestItem["status"] } : i))
    setLoading(itemId)

    const { error } = await supabase
      .from("purchase_request_items")
      .update({ status: newStatus })
      .eq("id", itemId)

    if (error) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: current as PurchaseRequestItem["status"] } : i))
    } else {
      router.refresh()
    }
    setLoading(null)
  }

  async function markEnProceso() {
    setLoading("status")
    const { error } = await supabase
      .from("purchase_requests")
      .update({ status: "en_proceso" })
      .eq("id", requestId)
    if (!error) {
      setRequestStatus("en_proceso")
      router.refresh()
    }
    setLoading(null)
  }

  async function cancelRequest() {
    if (!confirm("¿Cancelar este pedido? Esta acción no se puede deshacer.")) return
    setLoading("cancel")
    const { error } = await supabase
      .from("purchase_requests")
      .update({ status: "cancelada" })
      .eq("id", requestId)
    if (!error) router.refresh()
    setLoading(null)
  }

  const isClosed = requestStatus === "completada" || requestStatus === "cancelada"

  return (
    <div className="space-y-4">
      {/* Lista de ítems */}
      <div className="space-y-2">
        {items.map(item => (
          <div
            key={item.id}
            className={`border rounded-xl p-4 flex items-start gap-3 transition-colors ${
              item.status === "comprado" ? "bg-muted/40 opacity-75" : "bg-card"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className={`font-medium leading-snug ${item.status === "comprado" ? "line-through text-muted-foreground" : ""}`}>
                {item.item_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {item.quantity}{item.unit ? ` ${item.unit}` : ""}
              </p>
              {item.notes && (
                <p className="text-xs text-muted-foreground mt-1 italic">{item.notes}</p>
              )}
            </div>

            {isAdmin ? (
              <button
                onClick={() => toggleItem(item.id, item.status)}
                disabled={loading === item.id || isClosed}
                className={`shrink-0 h-7 w-7 rounded-full border-2 flex items-center justify-center transition-colors ${
                  item.status === "comprado"
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/40 hover:border-primary"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {item.status === "comprado" && <Check className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <Badge variant={item.status === "comprado" ? "outline" : "secondary"} className="shrink-0">
                {item.status === "comprado" ? "Comprado" : "Pendiente"}
              </Badge>
            )}
          </div>
        ))}

        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Sin artículos en este pedido</p>
        )}
      </div>

      {/* Botones de admin */}
      {isAdmin && !isClosed && (
        <div className="flex flex-wrap gap-2 pt-1">
          {requestStatus === "pendiente" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={markEnProceso}
              disabled={loading === "status"}
            >
              <ShoppingCart className="h-4 w-4 mr-1.5" />
              Marcar en proceso
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={cancelRequest}
            disabled={loading === "cancel"}
          >
            Cancelar pedido
          </Button>
        </div>
      )}
    </div>
  )
}
