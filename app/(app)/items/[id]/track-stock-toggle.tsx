"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

export function TrackStockToggle({ itemId, initialValue }: { itemId: string; initialValue: boolean }) {
  const [value, setValue] = useState(initialValue)
  const supabase = createClient()

  async function toggle() {
    const next = !value
    setValue(next)
    const { error } = await supabase.from("items").update({ track_stock: next }).eq("id", itemId)
    if (error) {
      setValue(!next)
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  return (
    <label className="flex items-center gap-3 cursor-pointer select-none" onClick={toggle}>
      <input
        type="checkbox"
        checked={value}
        onChange={() => {}}
        className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
      />
      <div>
        <p className="text-sm font-medium leading-none">Alertar stock bajo</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {value ? "Aparece en el dashboard cuando el stock llega al mínimo" : "No genera alertas de stock bajo"}
        </p>
      </div>
    </label>
  )
}
