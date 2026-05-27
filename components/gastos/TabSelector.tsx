"use client"

import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { key: "IPC",           active: "bg-cyan-500 text-white border-cyan-500" },
  { key: "Empresarial",   active: "bg-purple-500 text-white border-purple-500" },
  { key: "Arrendamiento", active: "bg-orange-500 text-white border-orange-500" },
  { key: "Colaboradores", active: "bg-teal-500 text-white border-teal-500" },
  { key: "Acumulado",     active: "bg-slate-500 text-white border-slate-500" },
]

interface TabSelectorProps {
  tab: string
  mes: string
}

export function TabSelector({ tab, mes }: TabSelectorProps) {
  const router = useRouter()

  return (
    <div className="flex gap-2 flex-wrap">
      {TABS.map(({ key, active }) => (
        <button
          key={key}
          onClick={() => router.push(`/gastos?mes=${mes}&tab=${key}`)}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium border transition-colors",
            tab === key
              ? active
              : "bg-white text-muted-foreground border-border hover:bg-muted/40"
          )}
        >
          {key}
        </button>
      ))}
    </div>
  )
}
