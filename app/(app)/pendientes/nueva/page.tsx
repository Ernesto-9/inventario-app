import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TaskForm } from '@/components/pendientes/TaskForm'

interface PageProps {
  searchParams: Promise<{ obra?: string }>
}

export default async function NuevaTareaPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, username, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const [profilesRes, externalsRes, locationsRes, parentTasksRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, username').order('username'),
    supabase.from('external_actors').select('id, name, type').eq('is_active', true).order('name'),
    supabase.from('locations').select('id, name').eq('type', 'obra').eq('is_active', true).order('name'),
    supabase
      .from('tasks')
      .select('id, title')
      .is('parent_task_id', null)
      .not('status', 'eq', 'completada')
      .order('title'),
  ])

  return (
    <TaskForm
      mode="create"
      currentProfile={profile}
      profiles={profilesRes.data ?? []}
      externals={externalsRes.data ?? []}
      locations={locationsRes.data ?? []}
      parentTasks={parentTasksRes.data ?? []}
      defaultLocationId={params.obra}
    />
  )
}
