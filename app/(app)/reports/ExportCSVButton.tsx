"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

interface ExportCSVButtonProps {
  data: Record<string, unknown>[]
  filename: string
  label?: string
  size?: "default" | "sm" | "lg" | "icon"
}

export function ExportCSVButton({ data, filename, label = "Exportar CSV", size = "default" }: ExportCSVButtonProps) {
  function handleExport() {
    if (!data.length) return

    const headers = Object.keys(data[0])
    const rows = data.map(row =>
      headers.map(h => {
        const val = row[h]
        const str = val === null || val === undefined ? '' : String(val)
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str
      }).join(',')
    )

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" size={size} onClick={handleExport}>
      <Download className="h-4 w-4 mr-1" />
      {label}
    </Button>
  )
}
