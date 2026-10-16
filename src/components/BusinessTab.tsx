import React, { useState, useEffect, useCallback } from 'react'

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, usePublicClient } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { Plus, ChevronDown, ChevronUp, Pause, Play, RefreshCcw, X, ExternalLink, Zap } from 'lucide-react'
import {
  AGENT_TAB_ADDRESS, AGENT_TAB_ABI, AGENT_TAB_CHAIN_ID,
  USDC_ADDRESS, txUrl,
} from '../contracts/agentTab'
import { fetchAllChargedEvents, type ChargedEvent } from '../lib/fetchEvents'
import { fmtUsdc, parseUsdc, shortAddr, fmtExpiry, decodeJobRef, parseOnchainError } from '../lib/format'
import { getTabStatus, STATUS_COLORS } from '../lib/tabStatus'

// ─────────────────────────────────────────────────────────────────────────────
// Open Tab Form
// ─────────────────────────────────────────────────────────────────────────────
function OpenTabForm({ onSuccess }: { onSuccess: () => void }) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: AGENT_TAB_CHAIN_ID })

  const [provider, setProvider] = useState('')
  const [agent, setAgent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [maxPerCharge, setMaxPerCharge] = useState('')
  const [dailyCap, setDailyCap] = useState('')
  const [expiry, setExpiry] = useState('')
  const [label, setLabel] = useState('')
  const [step, setStep] = useState<'idle' | 'approving' | 'opening' | 'done'>('idle')

  const { writeContractAsync } = useWriteContract()
  const [approveTx, setApproveTx] = useState<`0x${string}` | undefined>()
  const [openTx, setOpenTx] = useState<`0x${string}` | undefined>()

  const { isLoading: approveConfirming } = useWaitForTransactionReceipt({ hash: approveTx })
  const { isLoading: openConfirming } = useWaitForTransactionReceipt({ hash: openTx })

  const onWrongChain = chainId !== AGENT_TAB_CHAIN_ID

  const handleApprove = async () => {
    if (!address) return
    if (onWrongChain) { switchChain({ chainId: AGENT_TAB_CHAIN_ID }); return }
    try {
      setStep('approving')
      const amt = parseUsdc(deposit)
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [AGENT_TAB_ADDRESS, amt],
        chainId: AGENT_TAB_CHAIN_ID,
      })
      setApproveTx(hash)
      // wait for receipt
      await publicClient!.waitForTransactionReceipt({ hash })
      setStep('opening')
    } catch (e) {
      toast.error(parseOnchainError(e))
      setStep('idle')
    }
  }

  const handleOpen = async () => {
    if (!address) return
    try {
      const amt = parseUsdc(deposit)
      const mpc = parseUsdc(maxPerCharge)
      const dc = parseUsdc(dailyCap)
      const exp = expiry ? BigInt(Math.floor(new Date(expiry).getTime() / 1000)) : 0n
      const hash = await writeContractAsync({
        address: AGENT_TAB_ADDRESS,
        abi: AGENT_TAB_ABI,
        functionName: 'openTab',
        args: [provider as `0x${string}`, agent as `0x${string}`, amt, mpc, dc, exp, label],
        chainId: AGENT_TAB_CHAIN_ID,
      })
      setOpenTx(hash)
      await publicClient!.waitForTransactionReceipt({ hash })
      toast.success('Tab opened!')
      setStep('done')
      onSuccess()
    } catch (e) {
      toast.error(parseOnchainError(e))
      setStep('opening')
    }
  }

  const busy = approveConfirming || openConfirming

  return (
    <div className="rounded-2xl border p-5 space-y-4" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
      <h3 className="display font-semibold text-base" style={{ color: 'var(--accent)' }}>Open a tab</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Provider address" value={provider} onChange={setProvider} placeholder="0x…" mono />
        <Field label="Agent address" value={agent} onChange={setAgent} placeholder="0x…" mono />
        <Field label="Label" value={label} onChange={setLabel} placeholder="e.g. Freight AI Q4" />
        <Field label="Deposit (USDC)" value={deposit} onChange={setDeposit} placeholder="100.00" type="number" />
        <Field label="Max per charge (USDC)" value={maxPerCharge} onChange={setMaxPerCharge} placeholder="5.00" type="number" />
        <Field label="Daily cap (USDC)" value={dailyCap} onChange={setDailyCap} placeholder="50.00" type="number" />
        <Field label="Expiry date (optional)" value={expiry} onChange={setExpiry} placeholder="Leave blank = no expiry" type="date" />
      </div>

      {step === 'idle' && (
        <button
          onClick={() => { void handleApprove() }}
          disabled={!deposit || !provider || !agent || !maxPerCharge || !dailyCap}
          className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#080f18' }}
        >
          {onWrongChain ? 'Switch network' : 'Step 1 — Approve USDC'}
        </button>
      )}
      {step === 'approving' && (
        <button disabled className="w-full py-3 px-4 rounded-xl font-semibold text-sm opacity-60"
          style={{ background: 'var(--accent)', color: '#080f18' }}>
          {approveConfirming ? 'Confirming approval…' : 'Confirm in wallet…'}
        </button>
      )}
      {step === 'opening' && (
        <button
          onClick={() => { void handleOpen() }}
          disabled={busy}
          className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
          style={{ background: 'var(--accent)', color: '#080f18' }}
        >
          {busy ? 'Opening tab…' : 'Step 2 — Open tab'}
        </button>
      )}
      {step === 'done' && (
        <p className="text-sm text-center" style={{ color: 'var(--success)' }}>Tab opened successfully!</p>
      )}

      {(approveTx || openTx) && (
        <div className="flex gap-3 text-xs" style={{ color: 'var(--subtle)' }}>
          {approveTx && <a href={txUrl(approveTx)} target="_blank" rel="noopener" className="flex items-center gap-1 hover:underline">Approve tx <ExternalLink size={10} /></a>}
          {openTx && <a href={txUrl(openTx)} target="_blank" rel="noopener" className="flex items-center gap-1 hover:underline">Open tx <ExternalLink size={10} /></a>}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-Up Modal (inline)
// ─────────────────────────────────────────────────────────────────────────────
function TopUpRow({ tabId, onDone }: { tabId: bigint; onDone: () => void }) {
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: AGENT_TAB_CHAIN_ID })
  const [amount, setAmount] = useState('')
  const [phase, setPhase] = useState<'idle' | 'approving' | 'topping'>('idle')
  const { writeContractAsync } = useWriteContract()

  const onWrongChain = chainId !== AGENT_TAB_CHAIN_ID

  const go = async () => {
    if (onWrongChain) { switchChain({ chainId: AGENT_TAB_CHAIN_ID }); return }
    try {
      const amt = parseUsdc(amount)
      setPhase('approving')
      const ah = await writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [AGENT_TAB_ADDRESS, amt], chainId: AGENT_TAB_CHAIN_ID })
      await publicClient!.waitForTransactionReceipt({ hash: ah })
      setPhase('topping')
      const th = await writeContractAsync({ address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'topUp', args: [tabId, amt], chainId: AGENT_TAB_CHAIN_ID })
      await publicClient!.waitForTransactionReceipt({ hash: th })
      toast.success('Topped up!')
      onDone()
    } catch (e) {
      toast.error(parseOnchainError(e))
      setPhase('idle')
    }
  }

  const label = phase === 'approving' ? 'Approving…' : phase === 'topping' ? 'Topping up…' : onWrongChain ? 'Switch network' : 'Top up'

  return (
    <div className="flex gap-2 mt-2">
      <input
        value={amount} onChange={e => setAmount(e.target.value)}
        placeholder="USDC amount" type="number" min="0"
        className="flex-1 rounded-lg px-3 py-1.5 text-sm mono outline-none"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
      />
      <button onClick={() => { void go() }} disabled={!amount || phase !== 'idle'}
        className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-all"
        style={{ background: 'var(--accent)', color: '#080f18' }}>
        {label}
      </button>
      <button onClick={onDone} className="px-2 py-1.5 rounded-lg text-sm" style={{ color: 'var(--subtle)' }}>
        <X size={14} />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Charged event feed for a tab — auto-loads from deploy block, chunked
// ─────────────────────────────────────────────────────────────────────────────
function ChargeFeed({ tabId, visible }: { tabId: bigint; visible: boolean }) {
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

  // Auto-load when the card is first expanded.
  // The ref guards against double-fire without putting a setState call
  // on the synchronous path of the effect (which would trigger the linter).
  const autoLoadedRef = React.useRef(false)
  useEffect(() => {
    if (!visible || autoLoadedRef.current) return
    autoLoadedRef.current = true
    // Kick off outside the synchronous effect body to satisfy react(set-state-in-effect)
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
          <button onClick={() => { void load() }}
            className="text-xs ml-auto transition-all hover:opacity-80"
            style={{ color: 'var(--subtle)' }}>
            <RefreshCcw size={11} />
          </button>
        )}
      </div>

      {loaded && events.length === 0 && (
        <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>No charges found from deployment to latest.</p>
      )}
      {events.length > 0 && (
        <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {events.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
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
// Single Tab Card
// ─────────────────────────────────────────────────────────────────────────────
function TabCard({ tabId, onRefresh }: { tabId: bigint; onRefresh: () => void }) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: AGENT_TAB_CHAIN_ID })
  const [expanded, setExpanded] = useState(false)
  const [showTopUp, setShowTopUp] = useState(false)
  const { writeContractAsync } = useWriteContract()
  const [working, setWorking] = useState(false)

  const { data: tab, refetch } = useReadContract({
    address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'getTab',
    args: [tabId], chainId: AGENT_TAB_CHAIN_ID,
  })
  const { data: remToday } = useReadContract({
    address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'remainingToday',
    args: [tabId], chainId: AGENT_TAB_CHAIN_ID,
  })

  if (!tab) return (
    <div className="rounded-2xl p-4 animate-pulse h-24" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }} />
  )

  // Type cast: getTab returns a named tuple matching TabStatus fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tab
  const status = getTabStatus(t)
  const balancePct = t.dailyCap > 0n ? Math.min(100, Number((t.balance * 100n) / (t.balance + t.totalCharged + 1n))) : 100
  const spentPct = t.dailyCap > 0n ? Math.min(100, Number((t.spentToday * 100n) / t.dailyCap)) : 0

  const onWrongChain = chainId !== AGENT_TAB_CHAIN_ID

  const doAction = async (fn: () => Promise<void>) => {
    if (onWrongChain) { switchChain({ chainId: AGENT_TAB_CHAIN_ID }); return }
    setWorking(true)
    try { await fn() } catch (e) { toast.error(parseOnchainError(e)) } finally { setWorking(false); void refetch(); onRefresh() }
  }

  const togglePause = () => doAction(async () => {
    const h = await writeContractAsync({ address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'setPaused', args: [tabId, !t.paused], chainId: AGENT_TAB_CHAIN_ID })
    await publicClient!.waitForTransactionReceipt({ hash: h })
    toast.success(t.paused ? 'Tab resumed' : 'Tab paused')
  })

  const closeTab = () => doAction(async () => {
    const h = await writeContractAsync({ address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'closeTab', args: [tabId], chainId: AGENT_TAB_CHAIN_ID })
    await publicClient!.waitForTransactionReceipt({ hash: h })
    toast.success(`Tab closed. Refunded ${fmtUsdc(t.balance)} USDC.`)
  })

  return (
    <div className="rounded-2xl border transition-all" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
      {/* Header row */}
      <button className="w-full text-left px-4 pt-4 pb-3 flex items-start gap-3" onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="display font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>
              {t.label || `Tab #${tabId.toString()}`}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>{status}</span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="display font-bold text-xl tabular-nums" style={{ color: 'var(--accent)' }}>{fmtUsdc(t.balance)}</span>
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>USDC remaining</span>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} style={{ color: 'var(--subtle)', flexShrink: 0, marginTop: 2 }} /> : <ChevronDown size={16} style={{ color: 'var(--subtle)', flexShrink: 0, marginTop: 2 }} />}
      </button>

      {/* Balance bar */}
      <div className="px-4 pb-2">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${balancePct}%`, background: 'var(--accent)' }} />
        </div>
      </div>

      {/* Daily cap bar */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${spentPct}%`, background: spentPct > 80 ? 'var(--warn)' : 'var(--accent-dim)', opacity: 0.7 }} />
        </div>
        <span className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
          {fmtUsdc(t.spentToday)} / {fmtUsdc(t.dailyCap)} today
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3 text-xs" style={{ color: 'var(--muted)' }}>
            <Detail label="Provider" value={shortAddr(t.provider)} mono />
            <Detail label="Agent" value={shortAddr(t.agent)} mono />
            <Detail label="Max/charge" value={`${fmtUsdc(t.maxPerCharge)} USDC`} />
            <Detail label="Remaining today" value={`${fmtUsdc(remToday)} USDC`} />
            <Detail label="Total charged" value={`${fmtUsdc(t.totalCharged)} USDC`} />
            <Detail label="Charges" value={t.chargeCount.toString()} />
            <Detail label="Expiry" value={fmtExpiry(t.expiry)} />
            <Detail label="Tab ID" value={`#${tabId}`} mono />
          </div>

          {/* Actions — only payer */}
          {address && t.payer.toLowerCase() === address.toLowerCase() && t.open && (
            <div className="flex flex-wrap gap-2 pt-1">
              <ActionBtn onClick={togglePause} disabled={working} icon={t.paused ? <Play size={13} /> : <Pause size={13} />}>
                {t.paused ? 'Resume' : 'Pause'}
              </ActionBtn>
              <ActionBtn onClick={() => setShowTopUp(v => !v)} disabled={working} icon={<RefreshCcw size={13} />}>
                Top up
              </ActionBtn>
              <ActionBtn onClick={closeTab} disabled={working} danger icon={<X size={13} />}>
                Close tab
              </ActionBtn>
            </div>
          )}

          {showTopUp && t.open && (
            <TopUpRow tabId={tabId} onDone={() => { setShowTopUp(false); void refetch(); onRefresh() }} />
          )}

          {/* Charge feed — auto-loads from deploy block when card expands */}
          <ChargeFeed tabId={tabId} visible={expanded} />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main BusinessTab
// ─────────────────────────────────────────────────────────────────────────────
export function BusinessTab() {
  const { address } = useAccount()
  const [showForm, setShowForm] = useState(false)

  const { data: tabIds, refetch } = useReadContract({
    address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'tabsByPayer',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
    chainId: AGENT_TAB_CHAIN_ID,
  })

  const ids = (tabIds as bigint[] | undefined) ?? []
  const onRefresh = () => { void refetch() }

  if (!address) {
    return (
      <EmptyState title="Connect your wallet" body="Connect to see tabs you have opened as a business." />
    )
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="display font-semibold text-lg" style={{ color: 'var(--ink)' }}>My tabs</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{ids.length} tab{ids.length !== 1 ? 's' : ''} as payer</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: showForm ? 'var(--surface-strong)' : 'var(--accent)', color: showForm ? 'var(--ink)' : '#080f18', border: '1px solid var(--border)' }}
        >
          <Plus size={15} />
          {showForm ? 'Cancel' : 'Open a tab'}
        </button>
      </div>

      {showForm && <OpenTabForm onSuccess={() => { setShowForm(false); onRefresh() }} />}

      {ids.length === 0 && !showForm && (
        <EmptyState title="No tabs yet" body="Open your first prepaid tab to let an AI agent bill jobs on your behalf." />
      )}

      <div className="space-y-3">
        {[...ids].reverse().map(id => (
          <TabCard key={id.toString()} tabId={id} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text', mono = false }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; mono?: boolean
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</label>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} type={type}
        className={`w-full rounded-lg px-3 py-2 text-sm outline-none transition-all ${mono ? 'mono' : ''}`}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
      />
    </div>
  )
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="block" style={{ color: 'var(--subtle)' }}>{label}</span>
      <span className={`font-medium ${mono ? 'mono' : ''}`} style={{ color: 'var(--ink-2)' }}>{value}</span>
    </div>
  )
}

function ActionBtn({ onClick, disabled, icon, danger = false, children }: {
  onClick: () => void | Promise<void>; disabled?: boolean; icon?: React.ReactNode; danger?: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={() => { void onClick() }} disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
      style={{
        background: danger ? 'rgba(248,113,113,0.1)' : 'var(--surface-strong)',
        color: danger ? 'var(--danger)' : 'var(--ink-2)',
        border: `1px solid ${danger ? 'rgba(248,113,113,0.25)' : 'var(--border)'}`,
      }}>
      {icon}{children}
    </button>
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
