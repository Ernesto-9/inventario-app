import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Fuel, ChevronRight } from "lucide-react"
import { AddVehicleDialog } from "./AddVehicleDialog"
import type { Vehicle } from "@/types/database"

type FuelRow = {
  vehicle_id: string
  liters: number
  fuel_type: "diesel" | "gasolina"
  date: string
  total_cost: number
}

function formatLiters(n: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(n)
}

function formatFuelDate(d: string) {
  // d viene como "YYYY-MM-DD" (columna DATE) — formatear sin desfase de zona horaria
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}

export default async function CombustiblePage() {
  const supabase = await createClient()

  const [vehiclesRes, entriesRes] = await Promise.all([
    supabase.from("vehicles").select("*").eq("is_active", true).order("name"),
    supabase
      .from("fuel_entries")
      .select("vehicle_id, liters, fuel_type, date, total_cost")
      .order("date", { ascending: false }),
  ])

  const vehicles = (vehiclesRes.data ?? []) as Vehicle[]
  const entries = (entriesRes.data ?? []) as FuelRow[]

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Fuel className="h-6 w-6 text-amber-600" />
          <h1 className="text-2xl font-bold">Combustible</h1>
        </div>
        <div className="flex items-center gap-2">
          <AddVehicleDialog />
          <Button asChild>
            <Link href="/combustible/nueva">Registrar carga</Link>
          </Button>
        </div>
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No hay vehículos. Agrega uno para empezar.
        </div>
      ) : (
        <div className="space-y-2">
          {vehicles.map((v) => {
            const vEntries = entries.filter((e) => e.vehicle_id === v.id)
            const totalLiters = vEntries.reduce((s, e) => s + e.liters, 0)
            const last = vEntries[0] ?? null
            return (
              <Link
                key={v.id}
                href={`/combustible/${v.id}`}
                className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="space-y-1">
                  <p className="font-semibold">{v.name}</p>
                  {last ? (
                    <p className="text-sm text-muted-foreground">
                      Última carga: {formatFuelDate(last.date)} · {formatLiters(last.liters)} L · {last.fuel_type}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin registros</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatLiters(totalLiters)} L</p>
                    <p className="text-xs text-muted-foreground">total cargado</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
