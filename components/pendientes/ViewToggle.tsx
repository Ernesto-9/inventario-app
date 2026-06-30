'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

export function ViewToggle({ vista }: { vista: 'persona' | 'obra' }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(v: 'persona' | 'obra') {
    const params = new URLSearchParams(searchParams.toString())
    params.set('vista', v)
    router.push(`/pendientes?${params.toString()}`)
  }

  return (
    <div className="flex rounded-md border overflow-hidden">
      {(['persona', 'obra'] as const).map(v => (
        <button
          key={v}
          type="button"
          onClick={() => handleChange(v)}
          className={cn(
            'px-4 py-1.5 text-sm font-medium transition-colors capitalize',
            vista === v
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/50'
          )}
        >
          {v === 'persona' ? 'Por persona' : 'Por obra'}
        </button>
      ))}
    </div>
  )
}
