import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { TaskForm } from '@/components/pendientes/TaskForm'
import type { Task } from '@/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditarTareaPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, username, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .single()
  if (!task) notFound()

  const [profilesRes, externalsRes, locationsRes, parentTasksRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, username').order('username'),
    supabase.from('external_actors').select('id, name, type').eq('is_active', true).order('name'),
    supabase.from('locations').select('id, name').eq('type', 'obra').eq('is_active', true).order('name'),
    supabase
      .from('tasks')
      .select('id, title')
      .is('parent_task_id', null)
      .not('status', 'eq', 'completada')
      .neq('id', id)
      .order('title'),
  ])

  return (
    <TaskForm
      mode="edit"
      task={task as Task}
      currentProfile={profile}
      profiles={profilesRes.data ?? []}
      externals={externalsRes.data ?? []}
      locations={locationsRes.data ?? []}
      parentTasks={parentTasksRes.data ?? []}
    />
  )
}
