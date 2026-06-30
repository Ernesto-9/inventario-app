"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Wallet, Search, ArrowLeftRight, ClipboardList, Fuel, CheckSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserRole } from "@/types/database"

type NavTab = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; highlight?: boolean }

const adminTabs: NavTab[] = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/cash", label: "Caja", icon: Wallet },
  { href: "/buscar", label: "Buscar", icon: Search },
  { href: "/movements/new", label: "Mover", icon: ArrowLeftRight },
  { href: "/pendientes", label: "Tareas", icon: CheckSquare },
]

const workerTabs: NavTab[] = [
  { href: "/pedidos", label: "Mis pedidos", icon: ClipboardList },
  { href: "/pedidos/nuevo", label: "Nuevo pedido", icon: ArrowLeftRight, highlight: true },
  { href: "/combustible", label: "Combustible", icon: Fuel },
  { href: "/pendientes", label: "Tareas", icon: CheckSquare },
]

interface MobileNavProps {
  role: UserRole
}

export function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname()

  const tabs = role === "trabajador" ? workerTabs : adminTabs

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background">
      <div className={cn("grid h-16", role === "trabajador" ? "grid-cols-4" : "grid-cols-5")}>
        {tabs.map(({ href, label, icon: Icon, highlight }) => {
          const active = pathname === href || (href !== "/dashboard" && href !== "/movements/new" && href !== "/pedidos/nuevo" && pathname.startsWith(href))
          const isHighlight = !!highlight
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-1"
            >
              <div className={cn(
                "rounded-full p-2 transition-colors",
                isHighlight && "bg-primary text-primary-foreground",
                !isHighlight && active && "text-primary",
                !isHighlight && !active && "text-muted-foreground"
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <span className={cn(
                "text-[10px]",
                active || isHighlight ? "text-primary font-medium" : "text-muted-foreground"
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
