import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, Store, Phone, MessageCircle, Package } from "lucide-react"
import { buildWhatsAppUrl, buildTelUrl, formatPhoneDisplay } from "@/lib/whatsapp"
import type { Supplier } from "@/types/database"

type SupplierWithCount = Supplier & { item_count: number }

export default async function ProveedoresPage() {
  const supabase = await createClient()

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("*, item_suppliers(count)")
    .eq("is_active", true)
    .order("name")

  const withCount: SupplierWithCount[] = (suppliers ?? []).map((s: Supplier & { item_suppliers: { count: number }[] }) => ({
    ...s,
    item_count: s.item_suppliers?.[0]?.count ?? 0,
  }))

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proveedores</h1>
          <p className="text-muted-foreground text-sm">Catálogo de proveedores con contacto</p>
        </div>
        <Button asChild>
          <Link href="/proveedores/nuevo"><Plus className="h-4 w-4 mr-1" />Nuevo</Link>
        </Button>
      </div>

      {withCount.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Store className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No hay proveedores registrados.</p>
          <Button asChild className="mt-4">
            <Link href="/proveedores/nuevo">Crear primer proveedor</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {withCount.map(s => {
          const whatsappPhone = s.whatsapp_phone || s.phone
          const waUrl = buildWhatsAppUrl(whatsappPhone, "Hola")
          const telUrl = buildTelUrl(s.phone)

          return (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <Link href={`/proveedores/${s.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate flex items-center gap-1.5">
                        <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                        {s.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {s.item_count} artículo{s.item_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {!s.phone && !s.whatsapp_phone && (
                      <Badge variant="outline" className="shrink-0 text-xs">Sin teléfono</Badge>
                    )}
                  </div>
                  {(s.phone || s.whatsapp_phone) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatPhoneDisplay(s.phone || s.whatsapp_phone)}
                    </p>
                  )}
                </Link>

                {(waUrl || telUrl) && (
                  <div className="flex gap-2 pt-1">
                    {waUrl && (
                      <Button variant="outline" size="sm" asChild className="flex-1">
                        <a href={waUrl} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="h-3.5 w-3.5 mr-1" />
                          WhatsApp
                        </a>
                      </Button>
                    )}
                    {telUrl && (
                      <Button variant="outline" size="sm" asChild className="flex-1">
                        <a href={telUrl}>
                          <Phone className="h-3.5 w-3.5 mr-1" />
                          Llamar
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
