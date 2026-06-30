'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { ExternalActor } from '@/types/database'

const TYPES = ['arquitecto', 'contratista', 'proveedor', 'otro'] as const

interface ExternalActorsManagerProps {
  actors: ExternalActor[]
}

type FormState = {
  name: string
  type: ExternalActor['type']
  phone: string
  company: string
  notes: string
}

const emptyForm: FormState = { name: '', type: 'contratista', phone: '', company: '', notes: '' }

export function ExternalActorsManager({ actors: initial }: ExternalActorsManagerProps) {
  const router = useRouter()
  const [actors, setActors] = useState(initial)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ExternalActor | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setOpen(true)
  }

  function openEdit(actor: ExternalActor) {
    setEditing(actor)
    setForm({
      name: actor.name,
      type: actor.type,
      phone: actor.phone ?? '',
      company: actor.company ?? '',
      notes: actor.notes ?? '',
    })
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    setSubmitting(true)
    setError(null)
    try {
      const body = {
        name: form.name.trim(),
        type: form.type,
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        notes: form.notes.trim() || null,
      }
      const url = editing ? `/api/external-actors/${editing.id}` : '/api/external-actors'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Error al guardar')
      }
      const saved = await res.json()
      if (editing) {
        setActors(prev => prev.map(a => a.id === editing.id ? { ...a, ...saved } : a))
      } else {
        setActors(prev => [saved, ...prev])
      }
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeactivate(actor: ExternalActor) {
    const res = await fetch(`/api/external-actors/${actor.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !actor.is_active }),
    })
    if (res.ok) {
      setActors(prev => prev.map(a => a.id === actor.id ? { ...a, is_active: !actor.is_active } : a))
      router.refresh()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Actores externos</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo
        </Button>
      </div>

      {actors.length === 0 ? (
        <p className="text-muted-foreground text-sm">Sin actores externos registrados.</p>
      ) : (
        <div className="space-y-2">
          {actors.map(actor => (
            <div key={actor.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{actor.name}</span>
                  <Badge variant="outline" className="text-xs capitalize">{actor.type}</Badge>
                  {!actor.is_active && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Inactivo</Badge>
                  )}
                </div>
                {(actor.company || actor.phone) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[actor.company, actor.phone].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(actor)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  onClick={() => handleDeactivate(actor)}
                  title={actor.is_active ? 'Desactivar' : 'Activar'}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar actor' : 'Nuevo actor externo'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as ExternalActor['type'] }))}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                {TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Opcional" />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Opcional" />
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? 'Guardando…' : editing ? 'Guardar' : 'Crear'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
