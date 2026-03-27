import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, Paperclip } from "lucide-react"

const movementTypeConfig = {
  entrada: { label: 'Entrada', variant: 'success' as const },
  salida: { label: 'Salida', variant: 'destructive' as const },
  transferencia: { label: 'Transferencia', variant: 'secondary' as const },
  ajuste: { label: 'Ajuste', variant: 'warning' as const },
}

export default async function MovementsPage() {
  const supabase = await createClient()

  const { data: movements } = await supabase
    .from("movements")
    .select(`
      id, type, quantity, created_at, reference_number,
      items(name, unit),
      origin_location:origin_location_id(name),
      destination_location:destination_location_id(name),
      responsible:responsible_id(full_name),
      created_by_profile:created_by(full_name),
      movement_attachments(id)
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Historial</h1>
          <p className="text-muted-foreground text-sm">Todos los movimientos de inventario</p>
        </div>
        <Button asChild>
          <Link href="/movements/new"><Plus className="h-4 w-4 mr-1" />Nuevo</Link>
        </Button>
      </div>

      <div className="space-y-2">
        {movements?.map((mov) => {
          const cfg = movementTypeConfig[mov.type as keyof typeof movementTypeConfig]
          const item = mov.items as unknown as { name: string; unit: string } | null
          const origin = mov.origin_location as unknown as { name: string } | null
          const dest = mov.destination_location as unknown as { name: string } | null
          const responsible = mov.responsible as unknown as { full_name: string } | null
          const attachmentCount = (mov.movement_attachments as { id: string }[])?.length ?? 0

          return (
            <Link key={mov.id} href={`/movements/${mov.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        <span className="font-medium text-sm truncate">{item?.name}</span>
                        {attachmentCount > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Paperclip className="h-3 w-3" />{attachmentCount}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {mov.type === 'entrada' && dest && `→ ${dest.name}`}
                        {mov.type === 'salida' && origin && `← ${origin.name}`}
                        {mov.type === 'transferencia' && origin && dest && `${origin.name} → ${dest.name}`}
                        {mov.type === 'ajuste' && origin && origin.name}
                        {responsible && ` · ${responsible.full_name}`}
                        {mov.reference_number && ` · ${mov.reference_number}`}
                      </p>

                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(mov.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-bold tabular-nums">{mov.quantity}</span>
                      <span className="text-xs text-muted-foreground ml-1">{item?.unit}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {!movements?.length && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No hay movimientos registrados.</p>
          <Button asChild className="mt-4">
            <Link href="/movements/new">Registrar primer movimiento</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
