import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/Sidebar"
import { MobileNav } from "@/components/layout/MobileNav"
import { Toaster } from "@/components/ui/toaster"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {children}
      </main>
      <MobileNav />
      <Toaster />
    </div>
  )
}
