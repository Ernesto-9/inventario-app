import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/Sidebar"
import { MobileNav } from "@/components/layout/MobileNav"
import { Toaster } from "@/components/ui/toaster"
import type { UserRole } from "@/types/database"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  const role = (profile?.role ?? "supervisor") as UserRole

  // Trabajadores ven un layout simple sin sidebar
  if (role === "trabajador") {
    return (
      <div className="min-h-screen bg-background">
        <main className="flex-1 flex flex-col min-w-0 pb-20">
          {children}
        </main>
        <MobileNav role={role} />
        <Toaster />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} />
      <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {children}
      </main>
      <MobileNav role={role} />
      <Toaster />
    </div>
  )
}
