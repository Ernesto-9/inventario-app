import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(['alta', 'media', 'baja']).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['pendiente', 'en_progreso', 'completada', 'vencida']).optional(),
  location_id: z.string().uuid().nullable().optional(),
})

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
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
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const updates = parsed.data

  // due_date solo admin puede editar
  if (updates.due_date !== undefined && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Solo admin puede cambiar la fecha límite' }, { status: 403 })
  }

  const { data: task } = await supabase
    .from('tasks')
    .select('status, assigned_to_external, completed_at')
    .eq('id', id)
    .single()
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  // Status de tarea de externo: solo 002
  if (updates.status !== undefined && task.assigned_to_external && profile.username !== '002') {
    return NextResponse.json({ error: 'Solo el perfil 002 puede actualizar el progreso de tareas de externos' }, { status: 403 })
  }

  const finalUpdates: Record<string, unknown> = { ...updates }
  if (updates.status === 'completada' && task.status !== 'completada') {
    finalUpdates.completed_at = new Date().toISOString()
  } else if (updates.status && updates.status !== 'completada') {
    finalUpdates.completed_at = null
  }

  const { data: updated, error } = await supabase
    .from('tasks')
    .update(finalUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Registrar historial
  const historyEntries = []
  for (const key of Object.keys(updates) as Array<keyof typeof updates>) {
    const oldVal = (task as Record<string, unknown>)[key]
    const newVal = updates[key]
    if (newVal !== undefined && oldVal !== newVal) {
      historyEntries.push({
        task_id: id,
        changed_by: user.id,
        field_changed: key,
        old_value: String(oldVal ?? ''),
        new_value: String(newVal ?? ''),
      })
    }
  }
  if (historyEntries.length > 0) {
    await supabase.from('task_history').insert(historyEntries)
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Solo admin puede eliminar tareas' }, { status: 403 })
  }

  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
