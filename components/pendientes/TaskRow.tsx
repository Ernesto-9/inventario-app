'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from './StatusBadge'
import { PriorityBadge } from './PriorityBadge'
import { useRouter } from 'next/navigation'
import type { Task } from '@/types/database'

function isOverdue(task: Task): boolean {
  if (task.status === 'completada' || task.status === 'vencida') return false
  const today = new Date().toISOString().split('T')[0]
  return task.due_date < today
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function TaskRow({ task, compact = false }: { task: Task; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [completing, setCompleting] = useState(false)
  const router = useRouter()
  const overdue = isOverdue(task)
  const hasSubtasks = task.subtasks && task.subtasks.length > 0

  async function handleComplete() {
    setCompleting(true)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completada' }),
    })
    router.refresh()
    setCompleting(false)
  }

  return (
    <div>
      <div className="flex items-start gap-2 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
        {hasSubtasks ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <div className="w-4 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.title}</p>
          {!compact && task.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <StatusBadge status={task.status} overdue={overdue} />
            <PriorityBadge priority={task.priority} />
            <span className="text-xs text-muted-foreground">Límite: {formatDate(task.due_date)}</span>
            {task.location && (
              <span className="text-xs text-muted-foreground">· {task.location.name}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {task.status !== 'completada' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleComplete}
              disabled={completing}
              className="text-xs h-7 px-2"
            >
              {completing ? '...' : 'Completar'}
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
            <Link href={`/pendientes/${task.id}/editar`}>Editar</Link>
          </Button>
        </div>
      </div>

      {expanded && task.subtasks && task.subtasks.length > 0 && (
        <div className="ml-6 mt-1 space-y-1">
          {task.subtasks.map(sub => (
            <TaskRow key={sub.id} task={sub} compact />
          ))}
        </div>
      )}
    </div>
  )
}
