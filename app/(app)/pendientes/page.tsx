import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TaskFilters } from '@/components/pendientes/TaskFilters'
import { PendientesClient } from '@/components/pendientes/PendientesClient'
import type { Task, UserRole } from '@/types/database'

interface PageProps {
  searchParams: Promise<{
    vista?: string
    status?: string
    prioridad?: string
    persona?: string
    obra?: string
    desde?: string
    hasta?: string
  }>
}

export default async function PendientesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, username')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? 'supervisor') as UserRole
  const isAdmin = role === 'admin'

  const vista = (params.vista === 'obra' ? 'obra' : 'persona') as 'persona' | 'obra'
  const filterStatus = params.status ?? ''
  const filterPrioridad = params.prioridad ?? ''
  const filterPersona = params.persona ?? ''
  const filterObra = params.obra ?? ''
  const filterDesde = params.desde ?? ''
  const filterHasta = params.hasta ?? ''

  // Query de tareas con todos los joins
  let query = supabase
    .from('tasks')
    .select(`
      *,
      assigned_profile:profiles!assigned_to_profile(id, full_name, username),
      assigned_external:external_actors!assigned_to_external(id, name, type),
      location:locations!location_id(id, name, type),
      subtasks:tasks!parent_task_id(
        *,
        assigned_profile:profiles!assigned_to_profile(id, full_name, username),
        assigned_external:external_actors!assigned_to_external(id, name, type),
        location:locations!location_id(id, name, type)
      )
    `)
    .is('parent_task_id', null)
    .order('due_date', { ascending: true })

  if (filterStatus) query = query.eq('status', filterStatus)
  if (filterPrioridad) query = query.eq('priority', filterPrioridad)
  if (filterPersona) query = query.eq('assigned_to_profile', filterPersona)
  if (filterObra) query = query.eq('location_id', filterObra)
  if (filterDesde) query = query.gte('due_date', filterDesde)
  if (filterHasta) query = query.lte('due_date', filterHasta)

  const { data: tasks } = await query

  // Datos para filtros
  const [profilesRes, locationsRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, username').order('username'),
    supabase.from('locations').select('id, name').eq('type', 'obra').eq('is_active', true).order('name'),
  ])

  const now = new Date()
  const printedAt = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Pendientes</h1>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/pendientes/externos">Actores externos</Link>
            </Button>
          )}
          <Button size="sm" asChild>
            <Link href="/pendientes/nueva">
              <Plus className="h-4 w-4 mr-1" />
              Nueva tarea
            </Link>
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 print:hidden">
        <TaskFilters
          profiles={profilesRes.data ?? []}
          locations={locationsRes.data ?? []}
          showPersonFilter={isAdmin}
          current={{
            status: filterStatus,
            prioridad: filterPrioridad,
            persona: filterPersona,
            obra: filterObra,
            desde: filterDesde,
            hasta: filterHasta,
          }}
        />
      </div>

      {/* Vista principal */}
      <PendientesClient
        tasks={(tasks ?? []) as Task[]}
        vista={vista}
        currentUserId={user.id}
        currentRole={role}
        printedAt={printedAt}
      />
    </div>
  )
}
