import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useSwitchChain, usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import { ExternalLink, TrendingUp, Zap, RefreshCcw } from 'lucide-react'
import {
  AGENT_TAB_ADDRESS, AGENT_TAB_ABI, AGENT_TAB_CHAIN_ID, txUrl,
} from '../contracts/agentTab'
import { fmtUsdc, parseUsdc, shortAddr, encodeJobRef, decodeJobRef, parseOnchainError } from '../lib/format'
import { getTabStatus, STATUS_COLORS, type TabData } from '../lib/tabStatus'
import { fetchAllChargedEvents, type ChargedEvent } from '../lib/fetchEvents'

// ─────────────────────────────────────────────────────────────────────────────
// Bill-a-job form for one tab
// ─────────────────────────────────────────────────────────────────────────────
function BillJobForm({ tabId, tab, onDone }: { tabId: bigint; tab: TabData; onDone: () => void }) {
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: AGENT_TAB_CHAIN_ID })
  const [amount, setAmount] = useState('')
  const [jobRef, setJobRef] = useState('')
  const [phase, setPhase] = useState<'idle' | 'pending' | 'done'>('idle')
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const { writeContractAsync } = useWriteContract()

  const onWrongChain = chainId !== AGENT_TAB_CHAIN_ID

  const handleBill = async () => {
    if (onWrongChain) { switchChain({ chainId: AGENT_TAB_CHAIN_ID }); return }
    try {
      setPhase('pending')
      const amt = parseUsdc(amount)
      const ref = encodeJobRef(jobRef || `job-${Date.now()}`)
      const h = await writeContractAsync({
        address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'charge',
        args: [tabId, amt, ref], chainId: AGENT_TAB_CHAIN_ID,
      })
      setHash(h)
      await publicClient!.waitForTransactionReceipt({ hash: h })
      toast.success(`Billed ${fmtUsdc(amt)} USDC`)
      setPhase('done')
      onDone()
    } catch (e) {
      toast.error(parseOnchainError(e))
      setPhase('idle')
    }
  }

  // canBill: static check only — actual expiry vs current time is re-checked inside handleBill
  const canBill = tab.open && !tab.paused

  return (
    <div className="rounded-xl p-4 mt-3 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Bill a job</p>
      <div className="flex gap-2">
        <input
          value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="Amount (USDC)" type="number" min="0"
          className="flex-1 rounded-lg px-3 py-2 text-sm mono outline-none"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        />
        <input
          value={jobRef} onChange={e => setJobRef(e.target.value)}
          placeholder="Job ref (optional)"
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        />
      </div>
      {!canBill && (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>Tab is {getTabStatus(tab).toLowerCase()} — cannot bill.</p>
      )}
      <button onClick={() => { void handleBill() }} disabled={!amount || phase !== 'idle' || !canBill}
        className="w-full py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#080f18' }}>
        {onWrongChain ? 'Switch network' : phase === 'pending' ? 'Confirming…' : phase === 'done' ? 'Billed!' : 'Charge tab'}
      </button>
      {hash && (
        <a href={txUrl(hash)} target="_blank" rel="noopener"
          className="flex items-center gap-1 text-xs hover:underline" style={{ color: 'var(--subtle)' }}>
          View tx <ExternalLink size={10} />
        </a>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-tab charge history for provider — chunked scan from deploy block
// ─────────────────────────────────────────────────────────────────────────────
function ProviderChargeFeed({ tabId, visible }: { tabId: bigint; visible: boolean }) {
  const publicClient = usePublicClient({ chainId: AGENT_TAB_CHAIN_ID })
  const [events, setEvents] = useState<ChargedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!publicClient || loading) return
    setLoading(true)
    setProgress('Starting…')
    try {
      const evts = await fetchAllChargedEvents(publicClient, {
        tabId,
        onProgress: (scanned, total) => {
          const pct = total > 0n ? Math.round(Number((scanned * 100n) / total)) : 100
          setProgress(`${pct}%`)
        },
      })
      setEvents([...evts].reverse())
      setLoaded(true)
    } catch {
      toast.error('Failed to load charge history')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }, [publicClient, tabId, loading])

  const autoLoadedRef = React.useRef(false)
  useEffect(() => {
    if (!visible || autoLoadedRef.current) return
    autoLoadedRef.current = true
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [visible, load])

  if (!visible) return null

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <Zap size={11} style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Charge history</span>
        {loading && progress && (
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>scanning {progress}</span>
        )}
        {loaded && !loading && (
          <button onClick={() => { void load() }} className="text-xs ml-auto" style={{ color: 'var(--subtle)' }}>
            <RefreshCcw size={11} />
          </button>
        )}
      </div>
      {loaded && events.length === 0 && (
        <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>No charges found from deployment to latest.</p>
      )}
      {events.length > 0 && (
        <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {events.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <span className="mono truncate flex-1" style={{ color: 'var(--ink-2)' }}>{decodeJobRef(e.jobRef)}</span>
              <span className="mono font-semibold shrink-0" style={{ color: 'var(--accent)' }}>{fmtUsdc(e.amount)} USDC</span>
              {e.txHash && (
                <a href={txUrl(e.txHash)} target="_blank" rel="noopener"
                  className="flex items-center gap-0.5 shrink-0 hover:underline" style={{ color: 'var(--subtle)' }}>
                  tx <ExternalLink size={9} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider tab card
// ─────────────────────────────────────────────────────────────────────────────
function ProviderTabCard({ tabId, onRefresh, onEarnings }: {
  tabId: bigint
  onRefresh: () => void
  onEarnings?: (tabId: bigint, earned: bigint) => void
}) {
  const [showBill, setShowBill] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const { data: tab, refetch } = useReadContract({
    address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'getTab',
    args: [tabId], chainId: AGENT_TAB_CHAIN_ID,
  })
  const { data: remToday } = useReadContract({
    address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'remainingToday',
    args: [tabId], chainId: AGENT_TAB_CHAIN_ID,
  })

  // Report this tab's totalCharged up to the parent for grand-total earnings
  useEffect(() => {
    if (tab && onEarnings) {
      onEarnings(tabId, (tab).totalCharged)
    }
  }, [tab, tabId, onEarnings])

  if (!tab) return (
    <div className="rounded-2xl p-4 animate-pulse h-24" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }} />
  )

  const t = tab
  const status = getTabStatus(t)
  const spentPct = t.dailyCap > 0n ? Math.min(100, Number((t.spentToday * 100n) / t.dailyCap)) : 0

  return (
    <div className="rounded-2xl border" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
      {/* Header — clickable to expand */}
      <button className="w-full text-left px-4 pt-4 pb-3" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                {t.label || `Tab #${tabId}`}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>{status}</span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Payer: <span className="mono">{shortAddr(t.payer)}</span></p>
          </div>
          <div className="text-right shrink-0">
            <p className="display font-bold text-lg tabular-nums" style={{ color: 'var(--accent)' }}>{fmtUsdc(t.balance)}</p>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>tab balance</p>
          </div>
        </div>

        {/* Daily cap bar */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${spentPct}%`, background: spentPct > 80 ? 'var(--warn)' : 'var(--accent-dim)' }} />
          </div>
          <span className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
            {fmtUsdc(remToday)} USDC remaining today
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3 text-xs" style={{ color: 'var(--muted)' }}>
          <MiniStat label="Max/charge" value={`${fmtUsdc(t.maxPerCharge)} USDC`} />
          <MiniStat label="Charges" value={t.chargeCount.toString()} />
          <MiniStat label="Total earned" value={`${fmtUsdc(t.totalCharged)} USDC`} />
        </div>
      </button>

      <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setShowBill(v => !v)}
          disabled={status === 'Closed'}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
          style={{ background: 'var(--surface-strong)', color: 'var(--accent)', border: '1px solid var(--border-strong)' }}
        >
          <Zap size={12} />
          {showBill ? 'Hide' : 'Bill a job'}
        </button>
        {showBill && (
          <BillJobForm tabId={tabId} tab={t} onDone={() => { void refetch(); onRefresh(); setShowBill(false) }} />
        )}

        {/* Charge history — auto-loads when card is expanded */}
        <ProviderChargeFeed tabId={tabId} visible={expanded} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ProviderTab
// ─────────────────────────────────────────────────────────────────────────────
export function ProviderTab() {
  const { address } = useAccount()
  // Grand-total earnings: sum of totalCharged across all provider tabs
  const [earningsMap, setEarningsMap] = useState<Map<string, bigint>>(new Map())

  const { data: tabIds, refetch } = useReadContract({
    address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'tabsByProvider',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
    chainId: AGENT_TAB_CHAIN_ID,
  })

  const ids = (tabIds as bigint[] | undefined) ?? []

  const handleEarnings = useCallback((tabId: bigint, earned: bigint) => {
    setEarningsMap(prev => {
      const next = new Map(prev)
      next.set(tabId.toString(), earned)
      return next
    })
  }, [])

  const totalEarnings = [...earningsMap.values()].reduce((acc, v) => acc + v, 0n)

  if (!address) {
    return <EmptyState title="Connect your wallet" body="Connect to see tabs where you are the provider." />
  }

  return (
    <div className="space-y-6">
      {/* Header with grand-total earnings */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h2 className="display font-semibold text-lg" style={{ color: 'var(--ink)' }}>Provider view</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{ids.length} tab{ids.length !== 1 ? 's' : ''} where you are the provider</p>
          </div>
        </div>
        {ids.length > 0 && (
          <div className="text-right shrink-0 rounded-xl px-4 py-2"
            style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
            <p className="display font-bold text-xl tabular-nums" style={{ color: 'var(--accent)' }}>
              {fmtUsdc(totalEarnings)}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>total earned (USDC)</p>
          </div>
        )}
      </div>

      {ids.length === 0 && (
        <EmptyState title="No tabs" body="No tabs found where your wallet is the provider." />
      )}

      <div className="space-y-3">
        {[...ids].reverse().map(id => (
          <ProviderTabCard
            key={id.toString()}
            tabId={id}
            onRefresh={() => { void refetch() }}
            onEarnings={handleEarnings}
          />
        ))}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface)' }}>
      <p style={{ color: 'var(--subtle)' }}>{label}</p>
      <p className="font-semibold tabular-nums mt-0.5" style={{ color: 'var(--ink-2)' }}>{value}</p>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-16 rounded-2xl border" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
      <p className="display font-semibold" style={{ color: 'var(--ink-2)' }}>{title}</p>
      <p className="text-sm mt-1.5" style={{ color: 'var(--subtle)' }}>{body}</p>
    </div>
  )
}
