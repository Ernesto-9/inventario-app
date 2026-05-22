"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

interface MonthSelectorProps {
  mes: string // "YYYY-MM"
}

export function MonthSelector({ mes }: MonthSelectorProps) {
  const router = useRouter()
  const [year, month] = mes.split("-").map(Number)

  function navigate(delta: number) {
    const date = new Date(year, month - 1 + delta, 1)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    router.push(`/gastos?mes=${y}-${m}`)
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="w-36 text-center font-semibold text-sm">
        {MESES[month - 1]} {year}
      </span>
      <Button variant="outline" size="icon" onClick={() => navigate(1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
