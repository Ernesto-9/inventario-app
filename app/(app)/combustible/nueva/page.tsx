"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { z } from "zod"
import imageCompression from "browser-image-compression"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Loader2, Camera, X } from "lucide-react"
import { cn } from "@/lib/utils"

type VehicleOption = { id: string; name: string }
type FundOption = { id: string; name: string }

const schema = z
  .object({
    vehicle_id: z.string().min(1, "Selecciona un vehículo"),
    fuel_type: z.enum(["diesel", "gasolina"]),
    liters: z.number().positive("Los litros deben ser mayores a 0"),
    total_cost: z.number().positive("El total debe ser mayor a 0"),
    payment_source: z.enum(["fondo", "otro"]),
    cash_fund_id: z.string().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  })
  .refine((d) => d.payment_source !== "fondo" || !!d.cash_fund_id, {
    message: "Selecciona el fondo de origen",
    path: ["cash_fund_id"],
  })

function todayLocal() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`
}

export default function NuevaCargaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [funds, setFunds] = useState<FundOption[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [vehicleId, setVehicleId] = useState("")
  const [fuelType, setFuelType] = useState<"diesel" | "gasolina">("diesel")
  const [liters, setLiters] = useState("")
  const [totalCost, setTotalCost] = useState("")
  const [paymentSource, setPaymentSource] = useState<"fondo" | "otro">("otro")
  const [cashFundId, setCashFundId] = useState("")
  const [date, setDate] = useState(todayLocal())
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null)
  const [notes, setNotes] = useState("")

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadData() {
    setLoading(true)
    const [vRes, fRes] = await Promise.all([
      supabase.from("vehicles").select("id, name").eq("is_active", true).order("name"),
      supabase.from("cash_funds").select("id, name").eq("is_active", true).order("name"),
    ])
    setVehicles((vRes.data as VehicleOption[]) ?? [])
    setFunds((fRes.data as FundOption[]) ?? [])
    setLoading(false)
  }

  const litersNum = parseFloat(liters)
  const totalNum = parseFloat(totalCost)
  const pricePerLiter = useMemo(() => {
    if (litersNum > 0 && totalNum > 0) return totalNum / litersNum
    return 0
  }, [litersNum, totalNum])

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const processed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 })
    setPhoto({ file: processed, preview: URL.createObjectURL(processed) })
    e.target.value = ""
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = schema.safeParse({
      vehicle_id: vehicleId,
      fuel_type: fuelType,
      liters: litersNum,
      total_cost: totalNum,
      payment_source: paymentSource,
      cash_fund_id: paymentSource === "fondo" ? cashFundId || null : null,
      date,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const userId = user?.id ?? null

      // 1. INSERT fuel_entry (sin price_per_liter — es GENERATED en DB)
      const { data: entry, error: insErr } = await supabase
        .from("fuel_entries")
        .insert({
          vehicle_id: vehicleId,
          fuel_type: fuelType,
          liters: litersNum,
          total_cost: totalNum,
          date,
          payment_source: paymentSource,
          cash_fund_id: paymentSource === "fondo" ? cashFundId : null,
          photo_url: null,
          notes: notes.trim() || null,
          created_by: userId,
        })
        .select()
        .single()
      if (insErr) throw new Error(insErr.message)

      // 2. Foto opcional → subir a Storage y UPDATE photo_url
      if (photo) {
        const ext = photo.file.name.split(".").pop() || "jpg"
        const path = `fuel/${entry.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage
          .from("attachments")
          .upload(path, photo.file, { cacheControl: "3600" })
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path)
          await supabase.from("fuel_entries").update({ photo_url: publicUrl }).eq("id", entry.id)
        }
      }

      // 3. Si viene de fondo → descontar caja chica (el trigger ajusta el balance)
      if (paymentSource === "fondo") {
        const vehicleName = vehicles.find((v) => v.id === vehicleId)?.name ?? "Vehículo"
        await supabase.from("cash_transactions").insert({
          fund_id: cashFundId,
          type: "gasto",
          amount: totalNum,
          description: `Combustible: ${vehicleName} — ${litersNum}L ${fuelType}`,
          created_by: userId,
          movement_id: null,
          reference_number: null,
        })
      }

      // 4. Redirect
      router.push("/combustible")
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/combustible">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">Registrar carga</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Datos de la carga</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {/* Vehículo */}
            <div className="space-y-2">
              <Label htmlFor="vehicle">Vehículo *</Label>
              <select
                id="vehicle"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">Selecciona…</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            {/* Tipo combustible */}
            <div className="space-y-2">
              <Label>Tipo de combustible *</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["diesel", "gasolina"] as const).map((ft) => (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => setFuelType(ft)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm capitalize transition-colors",
                      fuelType === ft
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    {ft}
                  </button>
                ))}
              </div>
            </div>

            {/* Litros + Total */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="liters">Litros *</Label>
                <Input
                  id="liters"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total">Total del ticket (MXN) *</Label>
                <Input
                  id="total"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                />
              </div>
            </div>

            {/* Precio por litro (read-only) */}
            <div className="space-y-2">
              <Label>Precio por litro</Label>
              <div className="w-full rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {pricePerLiter > 0 ? `$${pricePerLiter.toFixed(2)} / L` : "—"}
              </div>
            </div>

            {/* Origen del dinero */}
            <div className="space-y-2">
              <Label>¿De dónde viene el dinero? *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentSource("otro")}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition-colors",
                    paymentSource === "otro"
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  Otra fuente
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentSource("fondo")}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition-colors",
                    paymentSource === "fondo"
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  Fondo propio
                </button>
              </div>
              {paymentSource === "fondo" && (
                <select
                  value={cashFundId}
                  onChange={(e) => setCashFundId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                  <option value="">Selecciona el fondo…</option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Fecha */}
            <div className="space-y-2">
              <Label htmlFor="date">Fecha *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {/* Foto */}
            <div className="space-y-2">
              <Label>Foto / Evidencia</Label>
              {photo ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.preview} alt="Evidencia" className="h-24 w-24 rounded-md object-cover border" />
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer w-fit">
                  <Camera className="h-4 w-4" />
                  Subir foto
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
                </label>
              )}
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                rows={2}
                placeholder="Observaciones…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting} className="flex-1">
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {submitting ? "Guardando..." : "Guardar carga"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/combustible">Cancelar</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
