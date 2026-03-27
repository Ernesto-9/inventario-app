import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, FileText, Image as ImageIcon } from "lucide-react"

const movementTypeConfig = {
  entrada: { label: 'Entrada', variant: 'success' as const },
  salida: { label: 'Salida', variant: 'destructive' as const },
  transferencia: { label: 'Transferencia', variant: 'secondary' as const },
  ajuste: { label: 'Ajuste', variant: 'warning' as const },
}

export default async function MovementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: mov } = await supabase
    .from("movements")
    .select(`
      *,
      items(name, unit, sku),
      origin_location:origin_location_id(name, type),
      destination_location:destination_location_id(name, type),
      responsible:responsible_id(full_name),
      created_by_profile:created_by(full_name),
      movement_attachments(*)
    `)
    .eq("id", id)
    .single()

  if (!mov) notFound()

  const cfg = movementTypeConfig[mov.type as keyof typeof movementTypeConfig]
  const item = mov.items as { name: string; unit: string; sku: string | null } | null
  const origin = mov.origin_location as { name: string; type: string } | null
  const dest = mov.destination_location as { name: string; type: string } | null
  const responsible = mov.responsible as { full_name: string } | null
  const createdBy = mov.created_by_profile as { full_name: string } | null
  const attachments = mov.movement_attachments as Array<{ id: string; type: string; file_url: string; file_name: string; file_size: number | null; created_at: string }> ?? []

  const photos = attachments.filter(a => a.type === 'foto')
  const docs = attachments.filter(a => a.type !== 'foto')

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/movements"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
            <h1 className="text-xl font-bold">{item?.name}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(mov.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* Detalles */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Detalles del movimiento</CardTitle></CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Artículo</p>
              <p className="font-medium text-sm">{item?.name}</p>
              {item?.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cantidad</p>
              <p className="font-bold text-lg">{mov.quantity} <span className="text-sm font-normal text-muted-foreground">{item?.unit}</span></p>
            </div>
          </div>

          {origin && (
            <div>
              <p className="text-xs text-muted-foreground">{mov.type === 'transferencia' ? 'Origen' : mov.type === 'salida' ? 'Salió de' : 'Ubicación'}</p>
              <p className="font-medium text-sm">{origin.name} <span className="text-xs text-muted-foreground capitalize">({origin.type})</span></p>
            </div>
          )}

          {dest && (
            <div>
              <p className="text-xs text-muted-foreground">{mov.type === 'transferencia' ? 'Destino' : 'Entró a'}</p>
              <p className="font-medium text-sm">{dest.name} <span className="text-xs text-muted-foreground capitalize">({dest.type})</span></p>
            </div>
          )}

          {responsible && (
            <div>
              <p className="text-xs text-muted-foreground">Responsable</p>
              <p className="font-medium text-sm">{responsible.full_name}</p>
            </div>
          )}

          {createdBy && (
            <div>
              <p className="text-xs text-muted-foreground">Registrado por</p>
              <p className="font-medium text-sm">{createdBy.full_name}</p>
            </div>
          )}

          {mov.reference_number && (
            <div>
              <p className="text-xs text-muted-foreground">No. Factura / Remisión</p>
              <p className="font-medium text-sm">{mov.reference_number}</p>
            </div>
          )}

          {mov.unit_cost && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Costo unitario</p>
                <p className="font-medium text-sm">${mov.unit_cost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Costo total</p>
                <p className="font-bold text-sm">${(mov.unit_cost * mov.quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          )}

          {mov.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Notas</p>
              <p className="text-sm whitespace-pre-wrap">{mov.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fotos */}
      {photos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Fotos ({photos.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photos.map(a => (
                <a key={a.id} href={a.file_url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.file_url}
                    alt={a.file_name}
                    className="w-full aspect-square object-cover rounded-md border hover:opacity-90 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documentos */}
      {docs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documentos ({docs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {docs.map(a => (
              <a
                key={a.id}
                href={a.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted/50 transition-colors"
              >
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.file_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{a.type}</p>
                </div>
                {a.file_size && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {(a.file_size / 1024).toFixed(0)} KB
                  </span>
                )}
              </a>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
