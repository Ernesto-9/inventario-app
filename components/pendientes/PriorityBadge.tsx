import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TaskPriority } from '@/types/database'

const config: Record<TaskPriority, { label: string; className: string }> = {
  alta:  { label: 'Alta',  className: 'bg-red-50 text-red-700 border-red-200' },
  media: { label: 'Media', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  baja:  { label: 'Baja',  className: 'bg-gray-50 text-gray-600 border-gray-200' },
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const { label, className } = config[priority]
  return <Badge variant="outline" className={cn(className)}>{label}</Badge>
}
