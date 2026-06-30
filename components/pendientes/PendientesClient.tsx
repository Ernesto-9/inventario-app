'use client'

import { useMemo } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ViewToggle } from './ViewToggle'
import { PersonCard } from './PersonCard'
import { TaskRow } from './TaskRow'
import { PrintView } from './PrintView'
import type { Task, UserRole } from '@/types/database'

interface PersonGroup {
  key: string
  name: string
  role: string
  tasks: Task[]
  isCurrentUser: boolean
}

interface ObraGroup {
  key: string
  name: string
  tasks: Task[]
}

interface PendientesClientProps {
  tasks: Task[]
  vista: 'persona' | 'obra'
  currentUserId: string
  currentRole: UserRole
  printedAt: string
}

function assigneeName(task: Task): string {
  if (task.assigned_profile) return task.assigned_profile.full_name
  if (task.assigned_external) return task.assigned_external.name
  return 'Sin responsable'
}

function assigneeRole(task: Task): string {
  if (task.assigned_external) return task.assigned_external.type
  return ''
}

export function PendientesClient({
  tasks, vista, currentUserId, currentRole, printedAt,
}: PendientesClientProps) {

  const personGroups = useMemo<PersonGroup[]>(() => {
    const map = new Map<string, PersonGroup>()

    for (const task of tasks) {
      const key = task.assigned_to_profile ?? task.assigned_to_external ?? 'sin-responsable'
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: assigneeName(task),
          role: assigneeRole(task),
          tasks: [],
          isCurrentUser: task.assigned_to_profile === currentUserId,
        })
      }
      map.get(key)!.tasks.push(task)
    }

    const groups = Array.from(map.values())
    // Current user first
    groups.sort((a, b) => {
      if (a.isCurrentUser) return -1
      if (b.isCurrentUser) return 1
      return a.name.localeCompare(b.name)
    })
    return groups
  }, [tasks, currentUserId])

  const obraGroups = useMemo<ObraGroup[]>(() => {
    const map = new Map<string, ObraGroup>()
    for (const task of tasks) {
      const key = task.location_id ?? 'sin-obra'
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: task.location?.name ?? 'Sin obra',
          tasks: [],
        })
      }
      map.get(key)!.tasks.push(task)
    }
    const groups = Array.from(map.values())
    groups.sort((a, b) => {
      if (a.key === 'sin-obra') return 1
      if (b.key === 'sin-obra') return -1
      return a.name.localeCompare(b.name)
    })
    return groups
  }, [tasks])

  const printGroups = vista === 'obra'
    ? obraGroups.map(g => ({ name: g.name, tasks: g.tasks }))
    : personGroups.map(g => ({ name: g.name, tasks: g.tasks }))

  return (
    <div>
      {/* Controles */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 print:hidden">
        <ViewToggle vista={vista} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="gap-1.5"
        >
          <Printer className="h-4 w-4" />
          Imprimir
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm print:hidden">Sin tareas para los filtros actuales.</p>
      ) : vista === 'persona' ? (
        <div className="space-y-3 print:hidden">
          {personGroups.map(group => (
            <PersonCard
              key={group.key}
              name={group.name}
              role={group.role}
              tasks={group.tasks}
              defaultExpanded={group.isCurrentUser || currentRole === 'admin'}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6 print:hidden">
          {obraGroups.map(group => (
            <div key={group.key}>
              <h2 className="font-semibold text-base mb-2 flex items-center gap-2">
                {group.name}
                <span className="text-xs text-muted-foreground font-normal">
                  {group.tasks.length} tarea{group.tasks.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="space-y-2">
                {group.tasks.map(task => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <PrintView groups={printGroups} printedAt={printedAt} />
    </div>
  )
}
