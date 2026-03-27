"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import type { LocationType } from "@/types/database"

const locationTypes: { value: LocationType; label: string }[] = [
  { value: 'almacén', label: 'Almacén' },
  { value: 'obra', label: 'Obra' },
  { value: 'vehículo', label: 'Vehículo' },
  { value: 'empleado', label: 'Empleado' },
  { value: 'otro', label: 'Otro' },
]

export default function NewLocationPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: "",
    type: "" as LocationType | "",
    description: "",
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.type) return setError("Selecciona un tipo")
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from("locations").insert({
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim() || null,
      created_by: user?.id,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push("/locations")
      router.refresh()
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/locations"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold">Nueva ubicación</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la ubicación</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="type">Tipo *</Label>
              <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as LocationType }))}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  {locationTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                placeholder={form.type === 'empleado' ? "Ej: Juan Pérez" : form.type === 'obra' ? "Ej: Obra Calle 5 #123" : "Nombre de la ubicación"}
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Textarea
                id="description"
                placeholder="Notas adicionales sobre esta ubicación..."
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "Guardando..." : "Guardar ubicación"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/locations">Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
