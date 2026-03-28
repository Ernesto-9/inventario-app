"use client"

import { useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, AlertTriangle } from "lucide-react"

interface StockItem {
  item_id: string
  item_name: string
  unit: string
  min_stock: number
  total_quantity: number
  is_low_stock: boolean
  category_name: string | null
  category_color: string | null
  sku: string | null
}

export function StockSearch({ items }: { items: StockItem[] }) {
  const [q, setQ] = useState("")
  const filtered = items.filter(i =>
    !q ||
    i.item_name.toLowerCase().includes(q.toLowerCase()) ||
    (i.sku && i.sku.toLowerCase().includes(q.toLowerCase())) ||
    (i.category_name && i.category_name.toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <div className="space-y-3">
      <div className="relative px-4 pt-1">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar artículo, categoría o SKU..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>
      <div className="divide-y">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin resultados</p>
        ) : filtered.map(item => (
          <Link key={item.item_id} href={`/items/${item.item_id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{item.item_name}</p>
                {item.is_low_stock && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {item.category_name && (
                  <Badge variant="outline" className="text-xs" style={{ borderColor: item.category_color ?? undefined, color: item.category_color ?? undefined }}>
                    {item.category_name}
                  </Badge>
                )}
                {item.sku && <span className="text-xs text-muted-foreground">SKU: {item.sku}</span>}
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className={`font-bold text-sm ${item.is_low_stock ? 'text-yellow-600' : item.total_quantity === 0 ? 'text-muted-foreground' : ''}`}>
                {item.total_quantity} {item.unit}
              </p>
              {item.min_stock > 0 && <p className="text-xs text-muted-foreground">mín: {item.min_stock}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
