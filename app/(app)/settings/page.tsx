import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Settings, Users, Tag } from "lucide-react"

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()

  if (profile?.role !== 'admin') redirect("/dashboard")

  const [{ data: profiles }, { data: categories }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").order("full_name"),
    supabase.from("categories").select("*").order("name"),
  ])

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-5 w-5" />
        <h1 className="text-2xl font-bold">Configuración</h1>
        <Badge>Admin</Badge>
      </div>

      {/* Usuarios */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Usuarios ({profiles?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {profiles?.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-sm">{p.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Desde {new Date(p.created_at).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <Badge variant={p.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                  {p.role}
                </Badge>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t">
            <p className="text-xs text-muted-foreground">
              Para agregar usuarios, créalos desde el Dashboard de Supabase → Authentication → Users.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Categorías */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Categorías ({categories?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {categories?.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <p className="text-sm">{c.name}</p>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t">
            <p className="text-xs text-muted-foreground">
              Las categorías se pueden modificar directamente en la base de datos de Supabase.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
