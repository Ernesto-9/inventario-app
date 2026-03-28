"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Wallet, Search, ArrowLeftRight, BarChart2 } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/cash", label: "Caja", icon: Wallet },
  { href: "/buscar", label: "Buscar", icon: Search },
  { href: "/movements/new", label: "Mover", icon: ArrowLeftRight },
  { href: "/reports", label: "Reportes", icon: BarChart2 },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background">
      <div className="grid grid-cols-5 h-16">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && href !== "/movements/new" && pathname.startsWith(href))
          const isNew = href === "/movements/new"
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-1"
            >
              <div className={cn(
                "rounded-full p-2 transition-colors",
                isNew && "bg-primary text-primary-foreground",
                !isNew && active && "text-primary",
                !isNew && !active && "text-muted-foreground"
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <span className={cn(
                "text-[10px]",
                active || isNew ? "text-primary font-medium" : "text-muted-foreground"
              )}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
