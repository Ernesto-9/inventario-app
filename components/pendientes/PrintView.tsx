import type { Task } from '@/types/database'

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function statusLabel(task: Task): string {
  const overdue = task.status !== 'completada' && task.status !== 'vencida'
    && task.due_date < new Date().toISOString().split('T')[0]
  if (overdue) return 'Vencida'
  const map: Record<string, string> = {
    pendiente: 'Pendiente', en_progreso: 'En progreso',
    completada: 'Completada', vencida: 'Vencida',
  }
  return map[task.status] ?? task.status
}

interface Group {
  name: string
  tasks: Task[]
}

export function PrintView({ groups, printedAt }: { groups: Group[]; printedAt: string }) {
  return (
    <div className="hidden print:block p-8 font-sans text-sm text-black">
      <div className="flex items-center justify-between border-b pb-3 mb-6">
        <h1 className="text-xl font-bold">Pendientes</h1>
        <span className="text-xs text-gray-500">{printedAt}</span>
      </div>

      {groups.map(group => (
        <div key={group.name} className="mb-6 break-inside-avoid">
          <h2 className="font-semibold text-base mb-2 border-b pb-1">{group.name}</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-1 pr-3 font-medium">Tarea</th>
                <th className="py-1 pr-3 font-medium w-32">Fecha límite</th>
                <th className="py-1 pr-3 font-medium w-24">Estado</th>
                <th className="py-1 font-medium w-24">Prioridad</th>
              </tr>
            </thead>
            <tbody>
              {group.tasks.map(task => (
                <tr key={task.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-3">
                    {task.title}
                    {task.description && (
                      <span className="ml-1 text-gray-400">— {task.description.slice(0, 80)}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3">{formatDate(task.due_date)}</td>
                  <td className="py-1.5 pr-3">{statusLabel(task)}</td>
                  <td className="py-1.5 capitalize">{task.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
