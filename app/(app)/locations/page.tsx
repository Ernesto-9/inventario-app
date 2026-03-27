import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, MapPin, Building2, Truck, User, HelpCircle } from "lucide-react"
import type { Location, LocationType } from "@/types/database"

const typeConfig: Record<LocationType, { label: string; icon: React.ElementType; color: string }> = {
  'almacén': { label: 'Almacén', icon: Building2, color: 'bg-blue-100 text-blue-700' },
  'obra': { label: 'Obra', icon: MapPin, color: 'bg-orange-100 text-orange-700' },
  'vehículo': { label: 'Vehículo', icon: Truck, color: 'bg-green-100 text-green-700' },
  'empleado': { label: 'Empleado', icon: User, color: 'bg-purple-100 text-purple-700' },
  'otro': { label: 'Otro', icon: HelpCircle, color: 'bg-gray-100 text-gray-700' },
}

export default async function LocationsPage() {
  const supabase = await createClient()
  const { data: locations } = await supabase
    .from("locations")
    .select("*")
    .order("type")
    .order("name")

  const grouped = (locations ?? []).reduce<Record<LocationType, Location[]>>((acc, loc) => {
    const t = loc.type as LocationType
    if (!acc[t]) acc[t] = []
    acc[t].push(loc as Location)
    return acc
  }, {} as Record<LocationType, Location[]>)

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ubicaciones</h1>
          <p className="text-muted-foreground text-sm">Almacenes, obras, vehículos y empleados</p>
        </div>
        <Button asChild>
          <Link href="/locations/new"><Plus className="h-4 w-4 mr-1" />Nueva</Link>
        </Button>
      </div>

      {Object.entries(typeConfig).map(([type, config]) => {
        const items = grouped[type as LocationType] ?? []
        if (items.length === 0) return null
        const Icon = config.icon
        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                {config.label}s
              </h2>
              <span className="text-xs text-muted-foreground">({items.length})</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((loc) => (
                <Link key={loc.id} href={`/locations/${loc.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{loc.name}</p>
                        {loc.description && (
                          <p className="text-sm text-muted-foreground truncate">{loc.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={config.color}
                        >
                          {config.label}
                        </Badge>
                        {!loc.is_active && (
                          <Badge variant="secondary">Inactivo</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )
      })}

      {!locations?.length && (
        <div className="text-center py-12 text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No hay ubicaciones registradas.</p>
          <Button asChild className="mt-4">
            <Link href="/locations/new">Crear primera ubicación</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
