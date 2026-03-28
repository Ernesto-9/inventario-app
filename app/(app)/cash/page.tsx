"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Wallet, Plus, TrendingDown, TrendingUp, RefreshCw } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface CashFund {
  id: string
  name: string
  balance: number
  description: string | null
  is_active: boolean
}

interface CashTransaction {
  id: string
  fund_id: string
  type: string
  amount: number
  description: string
  reference_number: string | null
  created_at: string
  cash_funds: { name: string } | null
  created_by_profile: { full_name: string } | null
}

export default function CashPage() {
  const supabase = createClient()
  const [funds, setFunds] = useState<CashFund[]>([])
  const [transactions, setTransactions] = useState<CashTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)

  // Dialog states
  const [depositDialog, setDepositDialog] = useState(false)
  const [gastoDialog, setGastoDialog] = useState(false)
  const [newFundDialog, setNewFundDialog] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [depositForm, setDepositForm] = useState({ fund_id: "", amount: "", description: "" })
  const [gastoForm, setGastoForm] = useState({ fund_id: "", amount: "", description: "", reference_number: "" })
  const [newFundForm, setNewFundForm] = useState({ name: "", description: "" })

  const loadData = useCallback(async () => {
    const [fundsRes, txRes, userRes] = await Promise.all([
      supabase.from("cash_funds").select("*").eq("is_active", true).order("name"),
      supabase
        .from("cash_transactions")
        .select("*, cash_funds(name), created_by_profile:created_by(full_name)")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.auth.getUser(),
    ])
    setFunds((fundsRes.data as CashFund[]) ?? [])
    setTransactions((txRes.data as unknown as CashTransaction[]) ?? [])
    const uid = userRes.data.user?.id ?? ""
    setCurrentUserId(uid)
    if (uid) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", uid).single()
      setIsAdmin((profile as { role: string } | null)?.role === "admin")
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const totalBalance = funds.reduce((sum, f) => sum + f.balance, 0)

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const weeklyGastos = transactions
    .filter(t => t.type === "gasto" && new Date(t.created_at) >= oneWeekAgo)
    .reduce((sum, t) => sum + t.amount, 0)

  const lastDeposit = transactions.find(t => t.type === "depósito")

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault()
    if (!depositForm.fund_id || !depositForm.amount || !depositForm.description) return
    setSubmitting(true)
    const { error } = await supabase.from("cash_transactions").insert({
      fund_id: depositForm.fund_id,
      type: "depósito",
      amount: parseFloat(depositForm.amount),
      description: depositForm.description,
      created_by: currentUserId,
    })
    setSubmitting(false)
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return }
    toast({ title: "Fondos agregados" })
    setDepositDialog(false)
    setDepositForm({ fund_id: "", amount: "", description: "" })
    loadData()
  }

  async function handleGasto(e: React.FormEvent) {
    e.preventDefault()
    if (!gastoForm.fund_id || !gastoForm.amount || !gastoForm.description) return
    setSubmitting(true)
    const { error } = await supabase.from("cash_transactions").insert({
      fund_id: gastoForm.fund_id,
      type: "gasto",
      amount: parseFloat(gastoForm.amount),
      description: gastoForm.description,
      reference_number: gastoForm.reference_number || null,
      created_by: currentUserId,
    })
    setSubmitting(false)
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return }
    toast({ title: "Gasto registrado" })
    setGastoDialog(false)
    setGastoForm({ fund_id: "", amount: "", description: "", reference_number: "" })
    loadData()
  }

  async function handleNewFund(e: React.FormEvent) {
    e.preventDefault()
    if (!newFundForm.name) return
    setSubmitting(true)
    const { error } = await supabase.from("cash_funds").insert({
      name: newFundForm.name,
      description: newFundForm.description || null,
      created_by: currentUserId,
    })
    setSubmitting(false)
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return }
    toast({ title: "Fondo creado" })
    setNewFundDialog(false)
    setNewFundForm({ name: "", description: "" })
    loadData()
  }

  if (loading) {
    return <div className="p-4 md:p-6 text-muted-foreground text-sm">Cargando...</div>
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Caja chica</h1>
          <p className="text-muted-foreground text-sm">Fondos y gastos</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setNewFundDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />Fondo
            </Button>
          )}
          <Button variant="outline" onClick={() => setGastoDialog(true)}>
            <TrendingDown className="h-4 w-4 mr-1" />Gasto
          </Button>
          <Button onClick={() => setDepositDialog(true)}>
            <TrendingUp className="h-4 w-4 mr-1" />Agregar
          </Button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Balance total</p>
            <p className="text-2xl font-bold mt-1">
              ${totalBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Gastos esta semana</p>
            <p className="text-2xl font-bold mt-1 text-red-500">
              ${weeklyGastos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Última reposición</p>
            <p className="text-sm font-semibold mt-1">
              {lastDeposit
                ? new Date(lastDeposit.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Fondos */}
      {funds.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {funds.map(fund => (
            <Card key={fund.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{fund.name}</p>
                  {fund.description && <p className="text-xs text-muted-foreground">{fund.description}</p>}
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${fund.balance < 0 ? 'text-red-500' : ''}`}>
                    ${fund.balance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay fondos de caja chica.</p>
            {isAdmin && (
              <Button className="mt-4" onClick={() => setNewFundDialog(true)}>
                Crear primer fondo
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transacciones recientes */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Movimientos recientes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`rounded-full p-1.5 shrink-0 ${tx.type === 'depósito' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                      {tx.type === 'depósito' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.cash_funds?.name}
                        {tx.reference_number && ` · ${tx.reference_number}`}
                        {' · '}{new Date(tx.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <p className={`font-bold tabular-nums ml-3 shrink-0 ${tx.type === 'depósito' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.type === 'depósito' ? '+' : '-'}${tx.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Agregar fondos */}
      <Dialog open={depositDialog} onOpenChange={setDepositDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar fondos</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDeposit} className="space-y-4">
            <div className="space-y-2">
              <Label>Fondo</Label>
              <Select value={depositForm.fund_id} onValueChange={v => setDepositForm(f => ({ ...f, fund_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona un fondo" /></SelectTrigger>
                <SelectContent>
                  {funds.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Monto ($)</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00"
                value={depositForm.amount} onChange={e => setDepositForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input placeholder="Ej: Reposición mensual"
                value={depositForm.description} onChange={e => setDepositForm(f => ({ ...f, description: e.target.value }))} required />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Guardando..." : "Agregar fondos"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Registrar gasto */}
      <Dialog open={gastoDialog} onOpenChange={setGastoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar gasto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGasto} className="space-y-4">
            <div className="space-y-2">
              <Label>Fondo</Label>
              <Select value={gastoForm.fund_id} onValueChange={v => setGastoForm(f => ({ ...f, fund_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona un fondo" /></SelectTrigger>
                <SelectContent>
                  {funds.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Monto ($)</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00"
                value={gastoForm.amount} onChange={e => setGastoForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input placeholder="Ej: Compra de materiales"
                value={gastoForm.description} onChange={e => setGastoForm(f => ({ ...f, description: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>No. Factura / Referencia <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input placeholder="FAC-001"
                value={gastoForm.reference_number} onChange={e => setGastoForm(f => ({ ...f, reference_number: e.target.value }))} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Guardando..." : "Registrar gasto"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nuevo fondo (admin only) */}
      {isAdmin && (
        <Dialog open={newFundDialog} onOpenChange={setNewFundDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo fondo de caja chica</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleNewFund} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input placeholder="Ej: Caja chica obra norte"
                  value={newFundForm.name} onChange={e => setNewFundForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Descripción <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input placeholder="Para gastos de la obra norte"
                  value={newFundForm.description} onChange={e => setNewFundForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Creando..." : "Crear fondo"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
