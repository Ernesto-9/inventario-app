"use client"

import { useState, useEffect } from "react"
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
import type { Category } from "@/types/database"

const UNITS = ['pieza', 'kg', 'litro', 'metro', 'metro²', 'metro³', 'caja', 'bolsa', 'rollo', 'bulto', 'juego', 'par', 'galón', 'lata', 'cubeta']

export default function NewItemPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState({
    name: "", description: "", sku: "", unit: "pieza",
    category_id: "", min_stock: "0",
  })

  useEffect(() => {
    supabase.from("categories").select("*").order("name")
      .then(({ data }) => setCategories(data ?? []))
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase.from("items").insert({
      name: form.name.trim(),
      description: form.description.trim() || null,
      sku: form.sku.trim() || null,
      unit: form.unit,
      category_id: form.category_id || null,
      min_stock: parseFloat(form.min_stock) || 0,
      created_by: user?.id,
    }).select("id").single()

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(`/items/${data.id}`)
      router.refresh()
    }
  }

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  return (
    <div className="p-4 md:p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/items"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold">Nuevo artículo</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Información del artículo</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" placeholder="Ej: Cemento gris 50kg" value={form.name} onChange={(e) => update('name', e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">Unidad *</Label>
                <Select value={form.unit} onValueChange={(v) => update('unit', v)}>
                  <SelectTrigger id="unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="min_stock">Stock mínimo</Label>
                <Input id="min_stock" type="number" min="0" step="0.01" value={form.min_stock} onChange={(e) => update('min_stock', e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Categoría</Label>
              <Select value={form.category_id} onValueChange={(v) => update('category_id', v)}>
                <SelectTrigger id="category"><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku">SKU / Código (opcional)</Label>
              <Input id="sku" placeholder="Código interno o de proveedor" value={form.sku} onChange={(e) => update('sku', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Textarea id="description" placeholder="Especificaciones, marca, modelo..." value={form.description} onChange={(e) => update('description', e.target.value)} rows={3} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "Guardando..." : "Guardar artículo"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/items">Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
