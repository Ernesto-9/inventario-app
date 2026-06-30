import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/types/database'

const config: Record<TaskStatus, { label: string; className: string }> = {
  pendiente:   { label: 'Pendiente',   className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  en_progreso: { label: 'En progreso', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  completada:  { label: 'Completada',  className: 'bg-green-100 text-green-800 border-green-200' },
  vencida:     { label: 'Vencida',     className: 'bg-red-100 text-red-800 border-red-200' },
}

export function StatusBadge({ status, overdue = false }: { status: TaskStatus; overdue?: boolean }) {
  const effective = overdue && status !== 'completada' ? 'vencida' : status
  const { label, className } = config[effective]
  return <Badge variant="outline" className={cn(className)}>{label}</Badge>
}
