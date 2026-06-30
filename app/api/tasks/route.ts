import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().nullable().optional(),
  priority: z.enum(['alta', 'media', 'baja']),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  assigned_to_profile: z.string().uuid().nullable().optional(),
  assigned_to_external: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  parent_task_id: z.string().uuid().nullable().optional(),
}).refine(
  d => !!(d.assigned_to_profile) !== !!(d.assigned_to_external),
  { message: 'Exactamente uno de assigned_to_profile o assigned_to_external es requerido' }
)

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, username')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const data = parsed.data

  // Validar profundidad de subtarea
  if (data.parent_task_id) {
    const { data: parentTask } = await supabase
      .from('tasks')
      .select('parent_task_id')
      .eq('id', data.parent_task_id)
      .single()
    if (!parentTask) {
      return NextResponse.json({ error: 'Tarea padre no encontrada' }, { status: 404 })
    }
    if (parentTask.parent_task_id) {
      return NextResponse.json({ error: 'Sub-subtareas no permitidas (máximo 1 nivel)' }, { status: 400 })
    }
  }

  let assignedProfile = data.assigned_to_profile ?? null
  const assignedExternal = data.assigned_to_external ?? null

  // Validar asignación según rol/username
  if (profile.role !== 'admin') {
    if (assignedExternal) {
      return NextResponse.json({ error: 'Solo admin puede asignar tareas a un actor externo' }, { status: 403 })
    }
    if (profile.username === '003' || profile.username === '005') {
      if (assignedProfile && assignedProfile !== user.id) {
        return NextResponse.json({ error: 'Solo puedes asignarte tareas a ti mismo' }, { status: 403 })
      }
      assignedProfile = user.id
    } else if (profile.username === '004') {
      const { data: p001 } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', '001')
        .single()
      if (!p001) return NextResponse.json({ error: 'Perfil 001 no encontrado' }, { status: 500 })
      if (assignedProfile && assignedProfile !== p001.id) {
        return NextResponse.json({ error: 'Solo puedes asignar tareas al perfil 001' }, { status: 403 })
      }
      assignedProfile = p001.id
    }
  }

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      title: data.title,
      description: data.description ?? null,
      priority: data.priority,
      due_date: data.due_date,
      assigned_to_profile: assignedProfile,
      assigned_to_external: assignedExternal,
      location_id: data.location_id ?? null,
      parent_task_id: data.parent_task_id ?? null,
      created_by: user.id,
      status: 'pendiente',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(task, { status: 201 })
}
