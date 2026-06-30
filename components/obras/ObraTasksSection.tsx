import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TaskRow } from '@/components/pendientes/TaskRow'
import type { Task } from '@/types/database'

interface ObraTasksSectionProps {
  tasks: Task[]
  obraId: string
}

export function ObraTasksSection({ tasks, obraId }: ObraTasksSectionProps) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">Tareas de esta obra</h2>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/pendientes/nueva?obra=${obraId}`}>
            <Plus className="h-4 w-4 mr-1" />
            Nueva tarea
          </Link>
        </Button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin tareas para esta obra.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
