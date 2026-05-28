"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Obra {
  id: string
  name: string
}

interface ObraSelectorProps {
  obras: Obra[]
  obraId: string
  mes: string
}

export function ObraSelector({ obras, obraId, mes }: ObraSelectorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "todas") {
      params.delete("obra")
    } else {
      params.set("obra", value)
    }
    router.push(`/obras?${params.toString()}`)
  }

  return (
    <Select value={obraId || "todas"} onValueChange={handleChange}>
      <SelectTrigger className="w-52">
        <SelectValue placeholder="Todas las obras" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todas">Todas las obras</SelectItem>
        {obras.map(o => (
          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
