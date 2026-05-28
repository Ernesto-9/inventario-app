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
import { Wallet, Plus, TrendingDown, TrendingUp, ArrowLeft, Printer, ChevronRight, Trash2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface CashFund {
  id: string
  name: string
  balance: number
  description: string | null
  is_active: boolean
  user_id: string | null
}

interface Profile {
  id: string
  full_name: string
}

interface CashTransaction {
  id: string
  fund_id: string
  type: string
  amount: number
  description: string
  reference_number: string | null
  movement_id: string | null
  created_at: string
  cash_funds: { name: string } | null
  created_by_profile: { full_name: string } | null
  movements: { supplier: string | null; reference_number: string | null } | null
}

interface CycleData {
  deposit: CashTransaction
  gastos: CashTransaction[]
  startDate: string
  endDate: string | null
  carryover: number
  totalSpent: number
  available: number
  remaining: number
}

function buildCycles(transactions: CashTransaction[]): CycleData[] {
  const deposits = transactions.filter(t => t.type === 'depósito')
  if (deposits.length === 0) return []

  const cycles: CycleData[] = []
  let carryover = 0

  for (let i = 0; i < deposits.length; i++) {
    const deposit = deposits[i]
    const nextDeposit = deposits[i + 1] ?? null

    const gastos = transactions.filter(t => {
      if (t.type !== 'gasto') return false
      const ts = new Date(t.created_at).getTime()
      if (ts < new Date(deposit.created_at).getTime()) return false
      if (nextDeposit && ts >= new Date(nextDeposit.created_at).getTime()) return false
      return true
    })

    const totalSpent = gastos.reduce((sum, g) => sum + g.amount, 0)
    const available = carryover + deposit.amount
    const remaining = available - totalSpent

    cycles.push({ deposit, gastos, startDate: deposit.created_at, endDate: nextDeposit?.created_at ?? null, carryover, totalSpent, available, remaining })
    carryover = remaining
  }

  return cycles.reverse()
}

function fmt(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
}

function fmtDate(d: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(d).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', ...(opts ?? { day: '2-digit', month: 'short', year: 'numeric' }) })
}

type AppView = 'main' | 'fund-cycles' | 'cycle-detail'

export default function CashPage() {
  const supabase = createClient()
  const [funds, setFunds] = useState<CashFund[]>([])
  const [transactions, setTransactions] = useState<CashTransaction[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)

  const [view, setView] = useState<AppView>('main')
  const [selectedCycle, setSelectedCycle] = useState<CycleData | null>(null)
  const [selectedFund, setSelectedFund] = useState<CashFund | null>(null)

  const [depositDialog, setDepositDialog] = useState(false)
  const [gastoDialog, setGastoDialog] = useState(false)
  const [newFundDialog, setNewFundDialog] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [depositForm, setDepositForm] = useState({ fund_id: "", amount: "", description: "", custom_date: "" })
  const [gastoForm, setGastoForm] = useState({ fund_id: "", amount: "", description: "", reference_number: "", category: "" })
  const [newFundForm, setNewFundForm] = useState({ name: "", description: "", user_id: "" })
  const [deleteConfirmTx, setDeleteConfirmTx] = useState<CashTransaction | null>(null)
  const [deleteConfirmFund, setDeleteConfirmFund] = useState<CashFund | null>(null)

  const loadData = useCallback(async () => {
    const [fundsRes, txRes, userRes, profilesRes] = await Promise.all([
      supabase.from("cash_funds").select("*").eq("is_active", true).order("name"),
      supabase
        .from("cash_transactions")
        .select("*, movements(supplier, reference_number), cash_funds(name), created_by_profile:created_by(full_name)")
        .order("created_at", { ascending: true }),
      supabase.auth.getUser(),
      supabase.from("profiles").select("id, full_name").order("full_name"),
    ])
    const freshFunds = (fundsRes.data as CashFund[]) ?? []
    setFunds(freshFunds)
    setTransactions((txRes.data as unknown as CashTransaction[]) ?? [])
    setProfiles((profilesRes.data as Profile[]) ?? [])
    setSelectedFund(prev => prev ? (freshFunds.find(f => f.id === prev.id) ?? prev) : null)
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
  const transactionsDesc = [...transactions].reverse()

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const weeklyGastos = transactions
    .filter(t => t.type === "gasto" && new Date(t.created_at) >= oneWeekAgo)
    .reduce((sum, t) => sum + t.amount, 0)
  const lastDeposit = transactionsDesc.find(t => t.type === 'depósito')

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault()
    if (!depositForm.fund_id || !depositForm.amount || !depositForm.description) return
    setSubmitting(true)
    const payload: Record<string, unknown> = {
      fund_id: depositForm.fund_id, type: "depósito",
      amount: parseFloat(depositForm.amount), description: depositForm.description, created_by: currentUserId,
    }
    if (isAdmin && depositForm.custom_date) {
      payload.created_at = new Date(depositForm.custom_date).toISOString()
    }
    const { error } = await supabase.from("cash_transactions").insert(payload)
    setSubmitting(false)
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return }
    toast({ title: "Fondos agregados" })
    setDepositDialog(false)
    setDepositForm({ fund_id: "", amount: "", description: "", custom_date: "" })
    loadData()
  }

  async function handleGasto(e: React.FormEvent) {
    e.preventDefault()
    if (!gastoForm.fund_id || !gastoForm.amount || !gastoForm.description || !gastoForm.category) return
    setSubmitting(true)
    const fullDescription = `[${gastoForm.category}] ${gastoForm.description}`
    const { error } = await supabase.from("cash_transactions").insert({
      fund_id: gastoForm.fund_id, type: "gasto",
      amount: parseFloat(gastoForm.amount), description: fullDescription,
      reference_number: gastoForm.reference_number || null, created_by: currentUserId,
    })
    setSubmitting(false)
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return }
    toast({ title: "Gasto registrado" })
    setGastoDialog(false)
    setGastoForm({ fund_id: "", amount: "", description: "", reference_number: "", category: "" })
    loadData()
  }

  async function handleNewFund(e: React.FormEvent) {
    e.preventDefault()
    if (!newFundForm.name || !newFundForm.user_id) return
    setSubmitting(true)
    const { error } = await supabase.from("cash_funds").insert({
      name: newFundForm.name,
      description: newFundForm.description || null,
      user_id: newFundForm.user_id || null,
      created_by: currentUserId,
    })
    setSubmitting(false)
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return }
    toast({ title: "Fondo creado" })
    setNewFundDialog(false)
    setNewFundForm({ name: "", description: "", user_id: "" })
    loadData()
  }

  async function handleDeleteTx(tx: CashTransaction) {
    const { error } = await supabase.from("cash_transactions").delete().eq("id", tx.id)
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return }
    toast({ title: tx.type === 'depósito' ? "Depósito eliminado" : "Gasto eliminado" })
    setDeleteConfirmTx(null)
    if (view === 'cycle-detail') setView('fund-cycles')
    loadData()
  }

  async function handleDeleteFund(fund: CashFund) {
    const { error } = await supabase.from("cash_funds").delete().eq("id", fund.id)
    if (error) { toast({ title: "Error al borrar fondo", description: error.message, variant: "destructive" }); return }
    toast({ title: `Fondo "${fund.name}" eliminado` })
    setDeleteConfirmFund(null)
    setSelectedFund(null)
    setView('main')
    loadData()
  }

  function handlePrint(cycle: CycleData) {
    const w = window.open('', '_blank')
    if (!w) return

    let runningBalance = 0
    const printRows: string[] = []

    if (cycle.carryover > 0) {
      runningBalance += cycle.carryover
      printRows.push(`<tr>
        <td>${fmtDate(cycle.startDate, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td>Saldo anterior</td><td></td><td></td>
        <td style="text-align:right;color:#16a34a">${fmt(cycle.carryover)}</td>
        <td></td>
        <td style="text-align:right">${fmt(runningBalance)}</td>
      </tr>`)
    }

    runningBalance += cycle.deposit.amount
    printRows.push(`<tr style="background:#f9fafb">
      <td>${fmtDate(cycle.deposit.created_at, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
      <td><strong>${cycle.deposit.description}</strong></td><td></td><td></td>
      <td style="text-align:right;color:#16a34a"><strong>${fmt(cycle.deposit.amount)}</strong></td>
      <td></td>
      <td style="text-align:right"><strong>${fmt(runningBalance)}</strong></td>
    </tr>`)

    cycle.gastos.forEach(g => {
      runningBalance -= g.amount
      printRows.push(`<tr>
        <td>${fmtDate(g.created_at, { day: '2-digit', month: 'short' })}</td>
        <td>${g.description}</td>
        <td>${g.movements?.supplier ?? '—'}</td>
        <td>${g.movements?.reference_number ?? g.reference_number ?? '—'}</td>
        <td></td>
        <td style="text-align:right;color:#dc2626">${fmt(g.amount)}</td>
        <td style="text-align:right;color:${runningBalance >= 0 ? '#000' : '#dc2626'}">${fmt(runningBalance)}</td>
      </tr>`)
    })

    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Caja Chica</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;font-size:12px;color:#000}
        h2{margin:0 0 2px;font-size:15px}
        .meta{color:#555;margin-bottom:14px;font-size:11px}
        table{width:100%;border-collapse:collapse}
        th{background:#f0f0f0;border:1px solid #ccc;padding:5px 8px;font-size:11px}
        td{border:1px solid #ddd;padding:5px 8px}
        tfoot td{background:#f0f0f0;font-weight:bold}
      </style>
    </head><body>
      <h2>Relación de Gastos — Caja Chica</h2>
      <div class="meta">${fmtDate(cycle.startDate)}${cycle.endDate ? ' — ' + fmtDate(cycle.endDate) : ' · ciclo en curso'}</div>
      <table>
        <thead><tr>
          <th>Fecha</th><th>Concepto</th><th>Proveedor</th><th>No. Factura</th>
          <th style="text-align:right">Cargo</th>
          <th style="text-align:right">Abono</th>
          <th style="text-align:right">Saldo</th>
        </tr></thead>
        <tbody>${printRows.join('')}</tbody>
        <tfoot><tr>
          <td colspan="4" style="text-align:right">Total gastado</td>
          <td style="text-align:right;color:#dc2626">${fmt(cycle.totalSpent)}</td>
          <td></td>
          <td style="text-align:right;color:${cycle.remaining >= 0 ? '#16a34a' : '#dc2626'}">${fmt(cycle.remaining)}</td>
        </tr></tfoot>
      </table>
    </body></html>`)
    w.document.close()
    w.print()
  }

  if (loading) return <div className="p-4 md:p-6 text-muted-foreground text-sm">Cargando...</div>

  // ── CYCLE DETAIL VIEW ──
  if (view === 'cycle-detail' && selectedCycle) {
    const cycle = selectedCycle
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <button onClick={() => setView('fund-cycles')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Ciclos
          </button>
          <div className="flex gap-2">
            {isAdmin && (
              <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600 hover:border-red-300" onClick={() => setDeleteConfirmTx(cycle.deposit)}>
                <Trash2 className="h-4 w-4 mr-1" />Eliminar depósito
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => handlePrint(cycle)}>
              <Printer className="h-4 w-4 mr-1" />Imprimir
            </Button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold">Ciclo {fmtDate(cycle.startDate)}</h2>
          <p className="text-sm text-muted-foreground">
            {cycle.endDate
              ? `${fmtDate(cycle.startDate)} — ${fmtDate(cycle.endDate)}`
              : `Desde ${fmtDate(cycle.startDate)} · en curso`}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Reposición', value: fmt(cycle.deposit.amount), color: '' },
            ...(cycle.carryover > 0 ? [{ label: '+ Saldo anterior', value: fmt(cycle.carryover), color: '' }] : []),
            { label: 'Disponible', value: fmt(cycle.available), color: '' },
            { label: 'Gastado', value: fmt(cycle.totalSpent), color: 'text-red-500' },
            { label: 'Restante', value: fmt(cycle.remaining), color: cycle.remaining >= 0 ? 'text-green-600' : 'text-red-500' },
          ].map(item => (
            <div key={item.label} className="bg-muted/30 rounded-lg px-4 py-3">
              <p className="text-xs text-muted-foreground mb-0.5">{item.label}</p>
              <p className={`font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {cycle.gastos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sin gastos registrados en este ciclo.</p>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-8">#</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Fecha</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Proveedor</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Concepto</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">No. Factura</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Monto</th>
                    {isAdmin && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cycle.gastos.map((g, i) => (
                    <tr key={g.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(g.created_at, { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="px-3 py-2.5 font-medium max-w-[140px] truncate">
                        {g.movements?.supplier ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground max-w-[180px] truncate">{g.description}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {g.movements?.reference_number ?? g.reference_number ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-red-500 tabular-nums">
                        -{fmt(g.amount)}
                      </td>
                      {isAdmin && (
                        <td className="px-2 py-2.5 text-center">
                          <button onClick={() => setDeleteConfirmTx(g)} className="text-muted-foreground hover:text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={isAdmin ? 5 : 5} className="px-3 py-2.5 text-sm font-semibold text-right">Total gastado</td>
                    <td className="px-3 py-2.5 text-right font-bold text-red-500 tabular-nums">-{fmt(cycle.totalSpent)}</td>
                    {isAdmin && <td />}
                  </tr>
                  <tr>
                    <td colSpan={isAdmin ? 5 : 5} className="px-3 py-2 text-xs text-right text-muted-foreground">Saldo restante</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums text-sm ${cycle.remaining >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {fmt(cycle.remaining)}
                    </td>
                    {isAdmin && <td />}
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // ── FUND CYCLES VIEW ──
  if (view === 'fund-cycles' && selectedFund) {
    const fundTx = transactions.filter(t => t.fund_id === selectedFund.id)
    const fundCycles = buildCycles(fundTx)
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <button onClick={() => { setView('main'); setSelectedFund(null) }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Caja chica
          </button>
          {isAdmin && (
            <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600 hover:border-red-300" onClick={() => setDeleteConfirmFund(selectedFund)}>
              <Trash2 className="h-4 w-4 mr-1" />Eliminar fondo
            </Button>
          )}
        </div>

        <div>
          <h2 className="text-xl font-bold">Ciclos — {selectedFund.name}</h2>
          <p className={`text-sm font-semibold mt-0.5 ${selectedFund.balance < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
            Saldo actual: {fmt(selectedFund.balance)}
          </p>
        </div>

        {fundCycles.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">No hay reposiciones registradas en este fondo.</p>
        ) : (
          <div className="space-y-3">
            {fundCycles.map(cycle => (
              <Card
                key={cycle.deposit.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => { setSelectedCycle(cycle); setView('cycle-detail') }}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">
                        {fmtDate(cycle.startDate, { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' — '}
                        {cycle.endDate
                          ? fmtDate(cycle.endDate, { day: '2-digit', month: 'short', year: 'numeric' })
                          : <span className="text-primary">en curso</span>}
                      </p>
                      {!cycle.endDate && <Badge variant="outline" className="text-xs text-primary border-primary/40">Actual</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Reposición: <strong className="text-foreground">{fmt(cycle.deposit.amount)}</strong></span>
                      {cycle.carryover > 0 && <span>+ Anterior: <strong className="text-foreground">{fmt(cycle.carryover)}</strong></span>}
                      <span>Gastado: <strong className="text-red-500">{fmt(cycle.totalSpent)}</strong></span>
                      <span>Restante: <strong className={cycle.remaining >= 0 ? 'text-green-600' : 'text-red-500'}>{fmt(cycle.remaining)}</strong></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{cycle.gastos.length} gasto{cycle.gastos.length !== 1 ? 's' : ''}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── MAIN VIEW ──
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Caja chica</h1>
          <p className="text-muted-foreground text-sm">Fondos y gastos</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" onClick={() => setGastoDialog(true)}>
            <TrendingDown className="h-4 w-4 mr-1" />Gasto
          </Button>
          <Button onClick={() => setDepositDialog(true)}>
            <TrendingUp className="h-4 w-4 mr-1" />Depositar
          </Button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Balance total</p>
            <p className="text-2xl font-bold mt-1">{fmt(totalBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Gastos esta semana</p>
            <p className="text-2xl font-bold mt-1 text-red-500">{fmt(weeklyGastos)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Última reposición</p>
            <p className="text-sm font-semibold mt-1">
              {lastDeposit ? fmtDate(lastDeposit.created_at, { day: '2-digit', month: 'short', year: 'numeric' }) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Fondos */}
      {funds.length > 0 ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {funds.map(fund => {
              const linkedUser = fund.user_id ? profiles.find(p => p.id === fund.user_id) : null
              return (
                <Card
                  key={fund.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => { setSelectedFund(fund); setView('fund-cycles') }}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{fund.name}</p>
                      {linkedUser && <p className="text-xs text-muted-foreground">{linkedUser.full_name}</p>}
                      {fund.description && <p className="text-xs text-muted-foreground">{fund.description}</p>}
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${fund.balance < 0 ? 'text-red-500' : ''}`}>{fmt(fund.balance)}</p>
                      <p className="text-xs text-muted-foreground">Ver ciclos</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          {isAdmin && (
            <button onClick={() => setNewFundDialog(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Plus className="h-3 w-3" />Nuevo fondo
            </button>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay fondos de caja chica.</p>
            {isAdmin && <Button className="mt-4" onClick={() => setNewFundDialog(true)}>Crear primer fondo</Button>}
          </CardContent>
        </Card>
      )}

      {/* Movimientos */}
      {transactionsDesc.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Movimientos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {transactionsDesc.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`rounded-full p-1.5 shrink-0 ${tx.type === 'depósito' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                    {tx.type === 'depósito' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {tx.movements?.supplier ? `${tx.movements.supplier} · ` : ''}{tx.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tx.cash_funds?.name}
                      {(tx.movements?.reference_number ?? tx.reference_number) && ` · ${tx.movements?.reference_number ?? tx.reference_number}`}
                      {' · '}{fmtDate(tx.created_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <p className={`font-bold tabular-nums shrink-0 ${tx.type === 'depósito' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.type === 'depósito' ? '+' : '-'}{fmt(tx.amount)}
                  </p>
                  {isAdmin && (
                    <button onClick={() => setDeleteConfirmTx(tx)} className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors ml-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Agregar fondos */}
      <Dialog open={depositDialog} onOpenChange={setDepositDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agregar fondos</DialogTitle></DialogHeader>
          <form onSubmit={handleDeposit} className="space-y-4">
            <div className="space-y-2">
              <Label>Fondo</Label>
              <Select value={depositForm.fund_id} onValueChange={v => setDepositForm(f => ({ ...f, fund_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona un fondo" /></SelectTrigger>
                <SelectContent>{funds.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
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
            {isAdmin && (
              <div className="space-y-2">
                <Label>Fecha del depósito <span className="text-muted-foreground font-normal">(opcional — vacío = ahora)</span></Label>
                <Input type="datetime-local" value={depositForm.custom_date}
                  onChange={e => setDepositForm(f => ({ ...f, custom_date: e.target.value }))} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Guardando..." : "Agregar fondos"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Registrar gasto */}
      <Dialog open={gastoDialog} onOpenChange={setGastoDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar gasto</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2 pb-1">
            Para compras de materiales, usa una <strong>Entrada de Inventario</strong> — el gasto se registra automáticamente.
          </p>
          <form onSubmit={handleGasto} className="space-y-4">
            <div className="space-y-2">
              <Label>Fondo</Label>
              <Select value={gastoForm.fund_id} onValueChange={v => setGastoForm(f => ({ ...f, fund_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona un fondo" /></SelectTrigger>
                <SelectContent>{funds.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={gastoForm.category} onValueChange={v => setGastoForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Servicios">Servicios (plomero, electricista, técnico)</SelectItem>
                  <SelectItem value="Transporte">Transporte</SelectItem>
                  <SelectItem value="Alimentación">Alimentación</SelectItem>
                  <SelectItem value="Renta / Utilities">Renta / Utilities</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
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
              <Input placeholder="Ej: Arreglo de tubería"
                value={gastoForm.description} onChange={e => setGastoForm(f => ({ ...f, description: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>No. Factura / Referencia <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input placeholder="FAC-001"
                value={gastoForm.reference_number} onChange={e => setGastoForm(f => ({ ...f, reference_number: e.target.value }))} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Guardando..." : "Registrar gasto"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar eliminación */}
      <Dialog open={!!deleteConfirmTx} onOpenChange={open => { if (!open) setDeleteConfirmTx(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteConfirmTx?.type === 'depósito' ? 'Eliminar depósito' : 'Eliminar gasto'}
            </DialogTitle>
          </DialogHeader>
          {deleteConfirmTx && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
                <p className="font-medium">{deleteConfirmTx.description}</p>
                <p className="text-muted-foreground">
                  {fmtDate(deleteConfirmTx.created_at, { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' · '}
                  <span className={deleteConfirmTx.type === 'depósito' ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                    {deleteConfirmTx.type === 'depósito' ? '+' : '-'}{fmt(deleteConfirmTx.amount)}
                  </span>
                </p>
              </div>
              {deleteConfirmTx.type === 'depósito' && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  Al eliminar este depósito se recalcula el saldo del fondo. Los gastos del ciclo permanecen y quedarán sin depósito asociado.
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmTx(null)}>
                  Cancelar
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => handleDeleteTx(deleteConfirmTx)}>
                  Eliminar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar eliminación de fondo */}
      <Dialog open={!!deleteConfirmFund} onOpenChange={open => { if (!open) setDeleteConfirmFund(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar fondo</DialogTitle></DialogHeader>
          {deleteConfirmFund && (
            <div className="space-y-4">
              <p className="text-sm">
                ¿Eliminar el fondo <strong>{deleteConfirmFund.name}</strong>?
                {transactions.filter(t => t.fund_id === deleteConfirmFund.id).length > 0 && (
                  <span className="block mt-1 text-destructive text-xs">
                    Se borrarán también todos sus depósitos y gastos ({transactions.filter(t => t.fund_id === deleteConfirmFund.id).length} movimiento{transactions.filter(t => t.fund_id === deleteConfirmFund.id).length !== 1 ? 's' : ''}). Esta acción no se puede deshacer.
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmFund(null)}>Cancelar</Button>
                <Button variant="destructive" className="flex-1" onClick={() => handleDeleteFund(deleteConfirmFund)}>Eliminar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Nuevo fondo (admin only) */}
      {isAdmin && (
        <Dialog open={newFundDialog} onOpenChange={setNewFundDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo fondo de caja chica</DialogTitle></DialogHeader>
            <form onSubmit={handleNewFund} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input placeholder="Ej: Caja chica obra norte"
                  value={newFundForm.name} onChange={e => setNewFundForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Perfil vinculado <span className="text-destructive">*</span></Label>
                <Select value={newFundForm.user_id} onValueChange={v => setNewFundForm(f => ({ ...f, user_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecciona un perfil" /></SelectTrigger>
                  <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Las entradas de este perfil descontarán de este fondo automáticamente.</p>
              </div>
              <div className="space-y-2">
                <Label>Descripción <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input placeholder="Para gastos de la obra norte"
                  value={newFundForm.description} onChange={e => setNewFundForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Creando..." : "Crear fondo"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
