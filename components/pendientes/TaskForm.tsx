'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, ExternalActor, UserRole } from '@/types/database'

interface ProfileOption { id: string; full_name: string; username: string | null }
interface ExternalOption { id: string; name: string; type: ExternalActor['type'] }
interface LocationOption { id: string; name: string }
interface ParentTaskOption { id: string; title: string }
interface CurrentProfile { id: string; role: UserRole; username: string | null; full_name: string }

interface TaskFormProps {
  mode: 'create' | 'edit'
  task?: Task
  currentProfile: CurrentProfile
  profiles: ProfileOption[]
  externals: ExternalOption[]
  locations: LocationOption[]
  parentTasks: ParentTaskOption[]
  defaultLocationId?: string
}

const PRIORITIES = ['alta', 'media', 'baja'] as const
const STATUSES = ['pendiente', 'en_progreso', 'completada', 'vencida'] as const

function todayLocal() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export function TaskForm({
  mode, task, currentProfile, profiles, externals, locations, parentTasks, defaultLocationId,
}: TaskFormProps) {
  const router = useRouter()
  const isAdmin = currentProfile.role === 'admin'
  const username = currentProfile.username

  // Determinar asignado inicial
  const initialAssigneeType: 'profile' | 'external' =
    task?.assigned_to_external ? 'external' : 'profile'
  const initialAssigneeId = (() => {
    if (task) return task.assigned_to_profile ?? task.assigned_to_external ?? ''
    if (!isAdmin) {
      if (username === '003' || username === '005') return currentProfile.id
      if (username === '004') {
        const p001 = profiles.find(p => p.username === '001')
        return p001?.id ?? ''
      }
    }
    return ''
  })()

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>(task?.priority ?? 'media')
  const [dueDate, setDueDate] = useState(task?.due_date ?? todayLocal())
  const [status, setStatus] = useState<typeof STATUSES[number]>(task?.status ?? 'pendiente')
  const [assigneeType, setAssigneeType] = useState<'profile' | 'external'>(initialAssigneeType)
  const [assigneeId, setAssigneeId] = useState(initialAssigneeId)
  const [locationId, setLocationId] = useState(task?.location_id ?? defaultLocationId ?? '')
  const [parentTaskId, setParentTaskId] = useState(task?.parent_task_id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canChangeDueDate = isAdmin
  const assigneeLocked = !isAdmin

  // Para 004: nombre del perfil 001
  const profile001 = profiles.find(p => p.username === '001')

  function getLockedAssigneeName(): string {
    if (username === '003' || username === '005') return currentProfile.full_name
    if (username === '004') return profile001?.full_name ?? '001'
    return ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) { setError('El título es requerido'); return }
    if (!dueDate) { setError('La fecha límite es requerida'); return }
    if (!assigneeId) { setError('Debes seleccionar un responsable'); return }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: dueDate,
        assigned_to_profile: assigneeType === 'profile' ? assigneeId : null,
        assigned_to_external: assigneeType === 'external' ? assigneeId : null,
        location_id: locationId || null,
        parent_task_id: parentTaskId || null,
      }

      if (mode === 'edit') {
        body.status = status
      }

      const url = mode === 'create' ? '/api/tasks' : `/api/tasks/${task!.id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Error al guardar')
      }

      router.push('/pendientes')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/pendientes"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold">
          {mode === 'create' ? 'Nueva tarea' : 'Editar tarea'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Datos de la tarea</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">

            {/* Título */}
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Describe la tarea…"
              />
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Textarea
                id="description"
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Detalles adicionales…"
              />
            </div>

            {/* Prioridad */}
            <div className="space-y-2">
              <Label>Prioridad *</Label>
              <div className="grid grid-cols-3 gap-2">
                {PRIORITIES.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm capitalize transition-colors',
                      priority === p
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Fecha límite */}
            <div className="space-y-2">
              <Label htmlFor="dueDate">Fecha límite *</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                disabled={mode === 'edit' && !canChangeDueDate}
              />
              {mode === 'edit' && !canChangeDueDate && (
                <p className="text-xs text-muted-foreground">Solo admin puede cambiar la fecha límite</p>
              )}
            </div>

            {/* Responsable */}
            <div className="space-y-2">
              <Label>Responsable *</Label>
              {assigneeLocked ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {getLockedAssigneeName()}
                </div>
              ) : (
                <>
                  {/* Toggle perfil / externo */}
                  <div className="grid grid-cols-2 gap-2">
                    {(['profile', 'external'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setAssigneeType(t); setAssigneeId('') }}
                        className={cn(
                          'rounded-md border px-3 py-2 text-sm transition-colors',
                          assigneeType === t
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted/50'
                        )}
                      >
                        {t === 'profile' ? 'Perfil interno' : 'Actor externo'}
                      </button>
                    ))}
                  </div>
                  {assigneeType === 'profile' ? (
                    <select
                      value={assigneeId}
                      onChange={e => setAssigneeId(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    >
                      <option value="">Selecciona…</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.username ? `${p.username} — ` : ''}{p.full_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={assigneeId}
                      onChange={e => setAssigneeId(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    >
                      <option value="">Selecciona…</option>
                      {externals.map(ex => (
                        <option key={ex.id} value={ex.id}>
                          {ex.name} ({ex.type})
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>

            {/* Estado (solo edición) */}
            {mode === 'edit' && (
              <div className="space-y-2">
                <Label>Estado</Label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as typeof STATUSES[number])}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                  {STATUSES.map(s => (
                    <option key={s} value={s}>
                      {{ pendiente: 'Pendiente', en_progreso: 'En progreso', completada: 'Completada', vencida: 'Vencida' }[s]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Obra (opcional) */}
            <div className="space-y-2">
              <Label>Obra (opcional)</Label>
              <select
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">Sin obra</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Tarea padre (opcional, solo en crear o cuando la tarea no tiene subtareas) */}
            {(mode === 'create' || !task?.parent_task_id) && parentTasks.length > 0 && (
              <div className="space-y-2">
                <Label>Subtarea de (opcional)</Label>
                <select
                  value={parentTaskId}
                  onChange={e => setParentTaskId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                  <option value="">Tarea independiente</option>
                  {parentTasks.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting} className="flex-1">
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {submitting ? 'Guardando…' : mode === 'create' ? 'Crear tarea' : 'Guardar cambios'}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/pendientes">Cancelar</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
