import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft } from "lucide-react"
import type { FuelEntry, Vehicle } from "@/types/database"

function formatMXN(amount: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatLiters(n: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(n)
}

function formatFuelDate(d: string) {
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}

interface PageProps {
  params: Promise<{ vehicleId: string }>
}

export default async function VehicleHistoryPage({ params }: PageProps) {
  const { vehicleId } = await params
  const supabase = await createClient()

  const [vehicleRes, entriesRes] = await Promise.all([
    supabase.from("vehicles").select("*").eq("id", vehicleId).single(),
    supabase
      .from("fuel_entries")
      .select("*, vehicles(name), cash_funds(name)")
      .eq("vehicle_id", vehicleId)
      .order("date", { ascending: false }),
  ])

  const vehicle = vehicleRes.data as Vehicle | null
  if (!vehicle) notFound()

  const entries = (entriesRes.data ?? []) as unknown as FuelEntry[]

  const totalLiters = entries.reduce((s, e) => s + e.liters, 0)
  const totalCost = entries.reduce((s, e) => s + e.total_cost, 0)
  const avgPricePerLiter = totalLiters > 0 ? totalCost / totalLiters : 0

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/combustible">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">{vehicle.name}</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Total litros</p>
          <p className="text-lg font-semibold">{formatLiters(totalLiters)} L</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Gasto total</p>
          <p className="text-lg font-semibold">{formatMXN(totalCost)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Promedio $/L</p>
          <p className="text-lg font-semibold">${avgPricePerLiter.toFixed(2)}</p>
        </div>
      </div>

      {/* Lista de cargas */}
      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Sin registros para este vehículo.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                    {formatFuelDate(e.date)}
                  </span>
                  <Badge
                    className={
                      e.fuel_type === "diesel"
                        ? "bg-blue-100 text-blue-800 hover:bg-blue-100"
                        : "bg-green-100 text-green-800 hover:bg-green-100"
                    }
                  >
                    {e.fuel_type}
                  </Badge>
                  {e.payment_source === "fondo" && (
                    <Badge variant="secondary" className="bg-gray-100 text-gray-700 hover:bg-gray-100">
                      Fondo: {e.cash_funds?.name ?? "—"}
                    </Badge>
                  )}
                </div>
                <span className="font-semibold whitespace-nowrap">{formatMXN(e.total_cost)}</span>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{formatLiters(e.liters)} L</span>
                <span>${e.price_per_liter.toFixed(2)}/L</span>
              </div>

              {e.photo_url && (
                <a href={e.photo_url} target="_blank" rel="noopener noreferrer" className="inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.photo_url}
                    alt="Evidencia"
                    className="h-20 w-20 rounded-md object-cover border"
                  />
                </a>
              )}

              {e.notes && <p className="text-sm">{e.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
