import { createClient } from "@/lib/supabase/server"
import { MonthSelector } from "@/components/obras/MonthSelector"
import { ObraSelector } from "@/components/obras/ObraSelector"
import { ObraTasksSection } from "@/components/obras/ObraTasksSection"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import type { Task } from "@/types/database"

interface PageProps {
  searchParams: Promise<{ mes?: string; obra?: string }>
}

type ObraRow = {
  id: string
  created_at: string
  quantity: number
  unit_cost: number | null
  items: { name: string } | null
  destination: { id: string; name: string } | null
  source: { supplier: string | null; reference_number: string | null } | null
}

function formatMXN(amount: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

export default async function ObrasPage({ searchParams }: PageProps) {
  const params = await searchParams
  const now = new Date()
  const currentMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const rawMes = params.mes ?? currentMes
  const mes = /^\d{4}-\d{2}$/.test(rawMes) ? rawMes : currentMes
  const obraId = params.obra ?? ""

  const [yearStr, monthStr] = mes.split("-")
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  const startDate = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const endDate = new Date(Date.UTC(year, month, 1)).toISOString()

  const supabase = await createClient()

  const locationsQuery = supabase
    .from("locations")
    .select("id, name")
    .eq("type", "obra")
    .eq("is_active", true)
    .order("name")

  const movementsQuery = supabase
    .from("movements")
    .select(`
      id,
      created_at,
      quantity,
      unit_cost,
      items!inner(name),
      destination:destination_location_id(id, name),
      source:source_movement_id(supplier, reference_number)
    `)
    .eq("type", "salida")
    .not("destination_location_id", "is", null)
    .gte("created_at", startDate)
    .lt("created_at", endDate)
    .order("created_at", { ascending: false })

  const [{ data: obrasData }, { data: salidasData }] = await Promise.all([locationsQuery, movementsQuery])

  // Query tareas de la obra (solo cuando hay obraId seleccionado)
  let obraTasks: Task[] = []
  if (obraId) {
    const { data: tasksData } = await supabase
      .from("tasks")
      .select(`
        *,
        assigned_profile:profiles!assigned_to_profile(id, full_name, username),
        assigned_external:external_actors!assigned_to_external(id, name, type),
        location:locations!location_id(id, name, type),
        subtasks:tasks!parent_task_id(
          *,
          assigned_profile:profiles!assigned_to_profile(id, full_name, username),
          assigned_external:external_actors!assigned_to_external(id, name, type)
        )
      `)
      .eq("location_id", obraId)
      .is("parent_task_id", null)
      .order("due_date", { ascending: true })
    obraTasks = (tasksData ?? []) as Task[]
  }

  const obras = (obrasData ?? []) as { id: string; name: string }[]

  const allRows = ((salidasData ?? []) as unknown as ObraRow[]).filter(
    r => r.destination !== null
  )

  const rows = obraId
    ? allRows.filter(r => r.destination?.id === obraId)
    : allRows

  const totalGeneral = rows.reduce(
    (sum, r) => sum + (r.unit_cost ?? 0) * r.quantity,
    0
  )

  // Agrupar por obra para totales
  const obraMap = new Map<string, { name: string; total: number }>()
  allRows.forEach(r => {
    if (!r.destination) return
    const existing = obraMap.get(r.destination.id)
    const importe = (r.unit_cost ?? 0) * r.quantity
    if (existing) {
      existing.total += importe
    } else {
      obraMap.set(r.destination.id, { name: r.destination.name, total: importe })
    }
  })

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gastos por Obra</h1>
          <p className="text-sm text-muted-foreground">Materiales salidos a cada obra en el período</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ObraSelector obras={obras} obraId={obraId} mes={mes} />
          <MonthSelector mes={mes} />
          <Button asChild size="sm">
            <Link href="/locations/new?type=obra&back=obras">
              <Plus className="h-4 w-4 mr-1" />
              Nueva obra
            </Link>
          </Button>
        </div>
      </div>

      {/* Resumen de totales por obra */}
      {!obraId && obraMap.size > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from(obraMap.entries())
            .sort((a, b) => b[1].total - a[1].total)
            .map(([id, { name, total }]) => (
              <div key={id} className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground truncate">{name}</p>
                <p className="font-semibold text-sm">{formatMXN(total)}</p>
              </div>
            ))}
        </div>
      )}

      {/* Tabla de detalle */}
      <div className="rounded-lg border border-l-4 border-l-amber-500 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-amber-50">
          <span className="font-semibold text-base text-amber-700">
            {obraId ? (obras.find(o => o.id === obraId)?.name ?? "Obra") : "Todas las obras"}
          </span>
          <span className="text-sm font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800">
            {formatMXN(totalGeneral)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-white text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Proveedor</th>
                <th className="px-4 py-2 font-medium">No. Factura</th>
                <th className="px-4 py-2 font-medium">Concepto</th>
                {!obraId && <th className="px-4 py-2 font-medium">Obra</th>}
                <th className="px-4 py-2 font-medium text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={obraId ? 5 : 6} className="px-4 py-6 text-center text-muted-foreground">
                    Sin movimientos en este período
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {row.source?.supplier ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {row.source?.reference_number ?? "—"}
                    </td>
                    <td className="px-4 py-2 font-medium">
                      {row.items?.name ?? "—"}
                    </td>
                    {!obraId && (
                      <td className="px-4 py-2 text-muted-foreground">
                        {row.destination?.name ?? "—"}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right font-medium">
                      {row.unit_cost != null
                        ? formatMXN(row.unit_cost * row.quantity)
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-amber-50 font-semibold">
                  <td colSpan={obraId ? 4 : 5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-amber-700">
                    Total del período
                  </td>
                  <td className="px-4 py-2 text-right text-amber-700">
                    {formatMXN(totalGeneral)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Tareas de esta obra (solo cuando hay obra seleccionada) */}
      {obraId && (
        <ObraTasksSection tasks={obraTasks} obraId={obraId} />
      )}
    </div>
  )
}
