'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface Profile { id: string; full_name: string; username: string | null }
interface Location { id: string; name: string }

interface TaskFiltersProps {
  profiles: Profile[]
  locations: Location[]
  showPersonFilter: boolean
  current: {
    status: string
    prioridad: string
    persona: string
    obra: string
    desde: string
    hasta: string
  }
}

export function TaskFilters({ profiles, locations, showPersonFilter, current }: TaskFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (!value || value === 'todos') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.push(`/pendientes?${params.toString()}`)
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString())
    ;['status', 'prioridad', 'persona', 'obra', 'desde', 'hasta'].forEach(k => params.delete(k))
    router.push(`/pendientes?${params.toString()}`)
  }

  const hasFilters = !!(current.status || current.prioridad || current.persona || current.obra || current.desde || current.hasta)

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Estado</Label>
        <Select value={current.status || 'todos'} onValueChange={v => update('status', v)}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="en_progreso">En progreso</SelectItem>
            <SelectItem value="completada">Completada</SelectItem>
            <SelectItem value="vencida">Vencida</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Prioridad</Label>
        <Select value={current.prioridad || 'todos'} onValueChange={v => update('prioridad', v)}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showPersonFilter && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Persona</Label>
          <Select value={current.persona || 'todos'} onValueChange={v => update('persona', v)}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {profiles.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Obra</Label>
        <Select value={current.obra || 'todos'} onValueChange={v => update('obra', v)}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            {locations.map(l => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Desde</Label>
        <Input
          type="date"
          className="h-8 text-xs w-36"
          value={current.desde}
          onChange={e => update('desde', e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Hasta</Label>
        <Input
          type="date"
          className="h-8 text-xs w-36"
          value={current.hasta}
          onChange={e => update('hasta', e.target.value)}
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearAll}>
          Limpiar filtros
        </Button>
      )}
    </div>
  )
}
