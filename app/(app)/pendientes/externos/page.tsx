import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExternalActorsManager } from '@/components/pendientes/ExternalActorsManager'
import type { ExternalActor } from '@/types/database'

export default async function ExternosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/pendientes')

  const { data: actors } = await supabase
    .from('external_actors')
    .select('*')
    .order('name')

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/pendientes"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold">Actores externos</h1>
      </div>
      <ExternalActorsManager actors={(actors ?? []) as ExternalActor[]} />
    </div>
  )
}
