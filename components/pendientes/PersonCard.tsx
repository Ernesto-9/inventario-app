'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TaskRow } from './TaskRow'
import type { Task } from '@/types/database'

function isOverdue(task: Task): boolean {
  if (task.status === 'completada' || task.status === 'vencida') return false
  return task.due_date < new Date().toISOString().split('T')[0]
}

interface PersonCardProps {
  name: string
  role?: string
  tasks: Task[]
  defaultExpanded?: boolean
}

export function PersonCard({ name, role, tasks, defaultExpanded = false }: PersonCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const total = tasks.length
  const completed = tasks.filter(t => t.status === 'completada').length
  const overdueCount = tasks.filter(t => isOverdue(t)).length
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="py-3 px-4 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">{name}</span>
              {role && (
                <span className="text-xs text-muted-foreground shrink-0">{role}</span>
              )}
              {overdueCount > 0 && (
                <span className="flex items-center justify-center h-5 min-w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                  {overdueCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {completed}/{total}
              </span>
            </div>
          </div>
          <div className="text-muted-foreground">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-3 px-4 space-y-2">
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} />
          ))}
        </CardContent>
      )}
    </Card>
  )
}
