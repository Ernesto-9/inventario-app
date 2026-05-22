import { createClient } from "@/lib/supabase/server"
import { MonthSelector } from "@/components/gastos/MonthSelector"
import { TabSelector } from "@/components/gastos/TabSelector"

const VALID_TABS = ["IPC", "Empresarial", "Arrendamiento", "Acumulado"] as const
type TabKey = typeof VALID_TABS[number]

interface PageProps {
  searchParams: Promise<{ mes?: string; tab?: string }>
}

const RAZON_COLORS = {
  IPC: {
    border: "border-l-cyan-500",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    badge: "bg-cyan-100 text-cyan-800",
  },
  Empresarial: {
    border: "border-l-purple-500",
    bg: "bg-purple-50",
    text: "text-purple-700",
    badge: "bg-purple-100 text-purple-800",
  },
  Arrendamiento: {
    border: "border-l-orange-500",
    bg: "bg-orange-50",
    text: "text-orange-700",
    badge: "bg-orange-100 text-orange-800",
  },
  Acumulado: {
    border: "border-l-slate-500",
    bg: "bg-slate-50",
    text: "text-slate-700",
    badge: "bg-slate-100 text-slate-800",
  },
}

type GastoRow = {
  id: string
  quantity: number
  unit_cost: number
  supplier: string | null
  razon_social: string
  created_at: string
  items: { name: string } | null
  responsible: { full_name: string } | null
  created_by_profile: { full_name: string } | null
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

function total(rows: GastoRow[]) {
  return rows.reduce((sum, r) => sum + r.unit_cost * r.quantity, 0)
}

function GastoTable({
  label,
  rows,
  showRazonSocial = false,
  colorKey,
}: {
  label: string
  rows: GastoRow[]
  showRazonSocial?: boolean
  colorKey: keyof typeof RAZON_COLORS
}) {
  const colors = RAZON_COLORS[colorKey]
  const totalAmount = total(rows)

  return (
    <div className={`rounded-lg border border-l-4 ${colors.border} overflow-hidden`}>
      <div className={`flex items-center justify-between px-4 py-3 ${colors.bg}`}>
        <span className={`font-semibold text-base ${colors.text}`}>{label}</span>
        <span className={`text-sm font-medium px-2 py-0.5 rounded ${colors.badge}`}>
          {formatMXN(totalAmount)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-white text-left text-muted-foreground">
              {showRazonSocial && (
                <th className="px-4 py-2 font-medium">Razón Social</th>
              )}
              <th className="px-4 py-2 font-medium">Concepto</th>
              <th className="px-4 py-2 font-medium">Proveedor</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium text-right">Monto</th>
              <th className="px-4 py-2 font-medium">Realizado por</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={showRazonSocial ? 6 : 5}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  Sin gastos en este período
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const rs = row.razon_social as keyof typeof RAZON_COLORS
                const rsBadge = RAZON_COLORS[rs] ?? RAZON_COLORS.Acumulado
                const realizado =
                  row.responsible?.full_name ?? row.created_by_profile?.full_name ?? "—"
                return (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                    {showRazonSocial && (
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${rsBadge.badge}`}>
                          {row.razon_social}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-2 font-medium">{row.items?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.supplier ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatMXN(row.unit_cost * row.quantity)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{realizado}</td>
                  </tr>
                )
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className={`${colors.bg} font-semibold`}>
                <td
                  colSpan={showRazonSocial ? 4 : 3}
                  className={`px-4 py-2 text-right text-xs uppercase tracking-wide ${colors.text}`}
                >
                  Total del período
                </td>
                <td className={`px-4 py-2 text-right ${colors.text}`}>
                  {formatMXN(totalAmount)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

export default async function GastosPage({ searchParams }: PageProps) {
  const params = await searchParams
  const now = new Date()
  const currentMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const rawMes = params.mes ?? currentMes
  const mes = /^\d{4}-\d{2}$/.test(rawMes) ? rawMes : currentMes
  const tab: TabKey = (VALID_TABS as readonly string[]).includes(params.tab ?? "") ? params.tab as TabKey : "IPC"

  const [yearStr, monthStr] = mes.split("-")
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  const startDate = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const endDate = new Date(Date.UTC(year, month, 1)).toISOString()

  const supabase = await createClient()

  const { data: gastos } = await supabase
    .from("movements")
    .select(`
      id,
      quantity,
      unit_cost,
      supplier,
      razon_social,
      created_at,
      items!inner(name),
      responsible:responsible_id(full_name),
      created_by_profile:created_by(full_name)
    `)
    .eq("type", "entrada")
    .not("razon_social", "is", null)
    .not("unit_cost", "is", null)
    .gte("created_at", startDate)
    .lt("created_at", endDate)
    .order("created_at", { ascending: false })

  const rows = (gastos ?? []) as unknown as GastoRow[]
  const ipc = rows.filter((r) => r.razon_social === "IPC")
  const empresarial = rows.filter((r) => r.razon_social === "Empresarial")
  const arrendamiento = rows.filter((r) => r.razon_social === "Arrendamiento")

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gastos</h1>
          <p className="text-sm text-muted-foreground">Entradas clasificadas por razón social</p>
        </div>
        <MonthSelector mes={mes} />
      </div>

      <TabSelector tab={tab} mes={mes} />

      {tab === "IPC" && <GastoTable label="IPC" rows={ipc} colorKey="IPC" />}
      {tab === "Empresarial" && <GastoTable label="Empresarial" rows={empresarial} colorKey="Empresarial" />}
      {tab === "Arrendamiento" && <GastoTable label="Arrendamiento" rows={arrendamiento} colorKey="Arrendamiento" />}
      {tab === "Acumulado" && <GastoTable label="Acumulado" rows={rows} showRazonSocial colorKey="Acumulado" />}
    </div>
  )
}
