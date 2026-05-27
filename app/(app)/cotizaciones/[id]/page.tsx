"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft,
  MessageCircle,
  Phone,
  Copy,
  Check,
  Loader2,
  Store,
  AlertCircle,
  Lock,
  Package,
} from "lucide-react"
import { buildQuotationMessage, buildWhatsAppUrl, buildTelUrl, formatPhoneDisplay } from "@/lib/whatsapp"

interface QuotationDetail {
  id: string
  name: string | null
  notes: string | null
  status: string
  created_at: string
}

interface ListItem {
  id: string
  item_id: string
  item_name: string
  unit: string | null
  quantity: number
}

interface SupplierCard {
  supplier_id: string
  supplier_name: string
  phone: string | null
  whatsapp_phone: string | null
  items: { name: string; quantity: number; unit: string | null }[]
}

export default function CotizacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [quotation, setQuotation] = useState<QuotationDetail | null>(null)
  const [items, setItems] = useState<ListItem[]>([])
  const [cards, setCards] = useState<SupplierCard[]>([])
  const [orphanItems, setOrphanItems] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function loadData() {
    setLoading(true)

    const { data: q } = await supabase
      .from("quotations")
      .select("id, name, notes, status, created_at")
      .eq("id", id)
      .single()

    if (!q) {
      setLoading(false)
      return
    }
    setQuotation(q as QuotationDetail)

    const { data: qItems } = await supabase
      .from("quotation_items")
      .select("id, item_id, quantity, unit, items:item_id(name, unit)")
      .eq("quotation_id", id)

    type QiRow = {
      id: string
      item_id: string
      quantity: number
      unit: string | null
      items: { name: string; unit: string } | null
    }
    const normalizedItems: ListItem[] = ((qItems ?? []) as unknown as QiRow[]).map(qi => ({
      id: qi.id,
      item_id: qi.item_id,
      item_name: qi.items?.name ?? "Artículo sin nombre",
      unit: qi.unit ?? qi.items?.unit ?? null,
      quantity: qi.quantity,
    }))
    setItems(normalizedItems)

    if (normalizedItems.length === 0) {
      setCards([])
      setOrphanItems([])
      setLoading(false)
      return
    }

    const itemIds = normalizedItems.map(i => i.item_id)

    const { data: links } = await supabase
      .from("item_suppliers")
      .select("item_id, supplier_id, suppliers:supplier_id(id, name, phone, whatsapp_phone)")
      .in("item_id", itemIds)

    const itemsWithSupplier = new Set<string>()
    const bySupplier = new Map<string, SupplierCard>()

    type LinkRow = {
      item_id: string
      supplier_id: string
      suppliers: { id: string; name: string; phone: string | null; whatsapp_phone: string | null } | null
    }
    ;((links ?? []) as unknown as LinkRow[]).forEach(l => {
      if (!l.suppliers) return
      itemsWithSupplier.add(l.item_id)

      const itm = normalizedItems.find(i => i.item_id === l.item_id)
      if (!itm) return

      if (!bySupplier.has(l.supplier_id)) {
        bySupplier.set(l.supplier_id, {
          supplier_id: l.supplier_id,
          supplier_name: l.suppliers.name,
          phone: l.suppliers.phone,
          whatsapp_phone: l.suppliers.whatsapp_phone,
          items: [],
        })
      }
      bySupplier.get(l.supplier_id)!.items.push({
        name: itm.item_name,
        quantity: itm.quantity,
        unit: itm.unit,
      })
    })

    const sortedCards = Array.from(bySupplier.values()).sort((a, b) => a.supplier_name.localeCompare(b.supplier_name))
    setCards(sortedCards)

    const orphans = normalizedItems.filter(i => !itemsWithSupplier.has(i.item_id))
    setOrphanItems(orphans)

    setLoading(false)
  }

  async function copyMessage(card: SupplierCard) {
    const msg = buildQuotationMessage(card.items)
    await navigator.clipboard.writeText(msg)
    setCopiedId(card.supplier_id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  async function handleClose() {
    if (!quotation) return
    if (!confirm("¿Cerrar esta cotización? Podrás seguir viéndola pero quedará archivada.")) return
    setClosing(true)
    await supabase.from("quotations").update({ status: "cerrada" }).eq("id", id)
    setClosing(false)
    router.refresh()
    loadData()
  }

  async function handleReopen() {
    if (!quotation) return
    setClosing(true)
    await supabase.from("quotations").update({ status: "abierta" }).eq("id", id)
    setClosing(false)
    router.refresh()
    loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!quotation) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Cotización no encontrada.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/cotizaciones">Volver</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/cotizaciones"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold truncate">{quotation.name || "Cotización sin nombre"}</h1>
            <Badge variant={quotation.status === "abierta" ? "default" : "outline"}>
              {quotation.status === "abierta" ? "Abierta" : "Cerrada"}
            </Badge>
          </div>
          {quotation.notes && <p className="text-sm text-muted-foreground">{quotation.notes}</p>}
        </div>
        {quotation.status === "abierta" ? (
          <Button variant="outline" size="sm" onClick={handleClose} disabled={closing}>
            <Lock className="h-4 w-4 mr-1" />
            {closing ? "..." : "Cerrar"}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={handleReopen} disabled={closing}>
            {closing ? "..." : "Reabrir"}
          </Button>
        )}
      </div>

      {/* Resumen de la lista */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Artículos en la lista
            <span className="text-muted-foreground font-normal text-sm">({items.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {items.map(it => (
              <div key={it.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="truncate">{it.item_name}</span>
                <span className="font-semibold tabular-nums shrink-0 ml-3">
                  {it.quantity}
                  {it.unit && <span className="text-muted-foreground font-normal"> {it.unit}</span>}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tarjetas por proveedor */}
      <div className="space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Mensajes por proveedor ({cards.length})
        </h2>

        {cards.length === 0 && orphanItems.length === items.length && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Ninguno de los artículos tiene proveedor ligado.</p>
              <p className="text-xs mt-1">Agrega proveedores a los artículos desde <Link href="/proveedores" className="underline">proveedores</Link> o regístralos al crear una entrada.</p>
            </CardContent>
          </Card>
        )}

        {cards.map(card => {
          const message = buildQuotationMessage(card.items)
          const waUrl = buildWhatsAppUrl(card.whatsapp_phone || card.phone, message)
          const telUrl = buildTelUrl(card.phone)
          const isCopied = copiedId === card.supplier_id

          return (
            <Card key={card.supplier_id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  {card.supplier_name}
                  <span className="text-muted-foreground font-normal text-sm">
                    · {card.items.length} artículo{card.items.length !== 1 ? "s" : ""}
                  </span>
                </CardTitle>
                {(card.phone || card.whatsapp_phone) && (
                  <p className="text-xs text-muted-foreground">
                    {formatPhoneDisplay(card.phone || card.whatsapp_phone)}
                  </p>
                )}
                {!card.phone && !card.whatsapp_phone && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Sin teléfono registrado — <Link href={`/proveedores/${card.supplier_id}`} className="underline ml-1">agregar</Link>
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="text-xs bg-muted/50 rounded-md p-3 whitespace-pre-wrap font-sans leading-relaxed">
                  {message}
                </pre>

                <div className="flex flex-wrap gap-2">
                  {waUrl ? (
                    <Button asChild size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                      <a href={waUrl} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4 mr-1" />
                        Enviar WhatsApp
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" disabled>
                      <MessageCircle className="h-4 w-4 mr-1" />
                      Sin WhatsApp
                    </Button>
                  )}
                  {telUrl && (
                    <Button asChild size="sm" variant="outline">
                      <a href={telUrl}>
                        <Phone className="h-4 w-4 mr-1" />
                        Llamar
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => copyMessage(card)}>
                    {isCopied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                    {isCopied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {orphanItems.length > 0 && cards.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                <AlertCircle className="h-4 w-4" />
                Artículos sin proveedor asignado
                <span className="font-normal text-sm">({orphanItems.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Estos artículos no tienen ningún proveedor ligado, por lo que no aparecen en los mensajes de arriba.
              </p>
              <ul className="text-sm space-y-1">
                {orphanItems.map(i => (
                  <li key={i.id} className="flex items-center justify-between">
                    <span>{i.item_name}</span>
                    <span className="tabular-nums text-muted-foreground text-xs">
                      {i.quantity} {i.unit ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
