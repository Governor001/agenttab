import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useSwitchChain, usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import { Bot, Package, ExternalLink, Clock, Zap } from 'lucide-react'
import {
  AGENT_TAB_ADDRESS, AGENT_TAB_ABI, AGENT_TAB_CHAIN_ID, txUrl,
} from '../contracts/agentTab'
import { fmtUsdc, shortAddr, encodeJobRef, decodeJobRef, parseOnchainError } from '../lib/format'
import { getTabStatus, type TabData } from '../lib/tabStatus'

// Mock freight quote generator
function mockFreightQuote(jobRef: string) {
  const price = (820 + Math.floor(Math.random() * 380)).toLocaleString('en-US')
  const etaDays = 24 + Math.floor(Math.random() * 8)
  const carrier = ['MSC', 'Maersk', 'Evergreen', 'COSCO'][Math.floor(Math.random() * 4)]
  const vessel = ['Ever Golden', 'MSC Oscar', 'CSCL Globe', 'Allegoria'][Math.floor(Math.random() * 4)]
  return { price, etaDays, carrier, vessel, jobRef }
}

type QuoteResult = ReturnType<typeof mockFreightQuote>

interface Receipt {
  hash: `0x${string}`
  amount: bigint
  jobRef: string
  settledMs: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab selector
// ─────────────────────────────────────────────────────────────────────────────
function TabSelector({
  ids, selectedId, onSelect,
}: {
  ids: bigint[]
  selectedId: bigint | null
  onSelect: (id: bigint) => void
}) {
  if (ids.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Billing tab</p>
      <div className="flex flex-wrap gap-2">
        {ids.map(id => (
          <button key={id.toString()} onClick={() => onSelect(id)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: selectedId === id ? 'var(--accent)' : 'var(--surface)',
              color: selectedId === id ? '#080f18' : 'var(--ink-2)',
              border: '1px solid var(--border)',
            }}>
            Tab #{id.toString()}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Quote card
// ─────────────────────────────────────────────────────────────────────────────
function QuoteCard({ quote, receipt }: { quote: QuoteResult; receipt: Receipt }) {
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
      {/* Header strip */}
      <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'rgba(74,222,128,0.08)', borderBottom: '1px solid var(--border)' }}>
        <Package size={16} style={{ color: 'var(--accent)' }} />
        <span className="display font-semibold text-sm" style={{ color: 'var(--accent)' }}>Freight Quote</span>
        <span className="ml-auto mono text-xs" style={{ color: 'var(--subtle)' }}>{quote.jobRef}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
        {/* Quote details */}
        <div className="px-5 py-4 space-y-3">
          <Route origin="Guangzhou, CN" dest="Lagos, NG" />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Container" value="20ft FCL" />
            <Stat label="Carrier" value={quote.carrier} />
            <Stat label="Vessel" value={quote.vessel} />
            <Stat label="ETA" value={`~${quote.etaDays} days`} />
          </div>
          <div className="rounded-xl px-4 py-3 flex items-baseline gap-2" style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
            <span className="display font-bold text-2xl tabular-nums" style={{ color: 'var(--accent)' }}>${quote.price}</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>USD all-in</span>
          </div>
        </div>

        {/* Onchain receipt */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-1.5">
            <Zap size={14} style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Onchain receipt</span>
          </div>
          <div className="space-y-2 text-xs">
            <ReceiptRow label="Charged" value={`${fmtUsdc(receipt.amount)} USDC`} highlight />
            <ReceiptRow label="Job ref" value={decodeJobRef(encodeJobRef(receipt.jobRef))} mono />
            <ReceiptRow label="Settlement" value={`${receipt.settledMs} ms`} />
          </div>
          <a href={txUrl(receipt.hash)} target="_blank" rel="noopener"
            className="flex items-center gap-1.5 text-xs font-medium mt-1 hover:underline" style={{ color: 'var(--accent)' }}>
            <ExternalLink size={12} />
            View on explorer
          </a>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main AgentDemo
// ─────────────────────────────────────────────────────────────────────────────
export function AgentDemoTab() {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: AGENT_TAB_CHAIN_ID })
  const { writeContractAsync } = useWriteContract()

  const [selectedTabId, setSelectedTabId] = useState<bigint | null>(null)
  const [phase, setPhase] = useState<'idle' | 'pending' | 'done'>('idle')
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)

  // Load provider tabs
  const { data: providerTabIds } = useReadContract({
    address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'tabsByProvider',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
    chainId: AGENT_TAB_CHAIN_ID,
  })
  const ids = (providerTabIds as bigint[] | undefined) ?? []

  // Load selected tab
  const { data: tabData } = useReadContract({
    address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'getTab',
    args: selectedTabId !== null ? [selectedTabId] : undefined,
    query: { enabled: selectedTabId !== null },
    chainId: AGENT_TAB_CHAIN_ID,
  })
  const tab: TabData | undefined = tabData

  const onWrongChain = chainId !== AGENT_TAB_CHAIN_ID
  const CHARGE_AMOUNT = 50000n // 0.05 USDC (6 dec)

  const requestQuote = async () => {
    if (!address) return
    if (onWrongChain) { switchChain({ chainId: AGENT_TAB_CHAIN_ID }); return }
    if (selectedTabId === null) { toast.error('Select a tab first'); return }
    if (!tab) { toast.error('Loading tab data…'); return }
    if (getTabStatus(tab) !== 'Active') { toast.error(`Tab is ${getTabStatus(tab)}`); return }

    const jobRef = `quote#${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const encoded = encodeJobRef(jobRef)

    try {
      setPhase('pending')
      setQuote(null)
      setReceipt(null)

      const t0 = Date.now()
      const hash = await writeContractAsync({
        address: AGENT_TAB_ADDRESS, abi: AGENT_TAB_ABI, functionName: 'charge',
        args: [selectedTabId, CHARGE_AMOUNT, encoded],
        chainId: AGENT_TAB_CHAIN_ID,
      })
      await publicClient!.waitForTransactionReceipt({ hash })
      const settledMs = Date.now() - t0

      setReceipt({ hash, amount: CHARGE_AMOUNT, jobRef, settledMs })
      setQuote(mockFreightQuote(jobRef))
      setPhase('done')
      toast.success(`Quote delivered — 0.05 USDC charged`)
    } catch (e) {
      toast.error(parseOnchainError(e))
      setPhase('idle')
    }
  }

  const reset = () => { setPhase('idle'); setQuote(null); setReceipt(null) }

  if (!address) {
    return <EmptyState title="Connect your wallet" body="Connect as the provider wallet to demo the agent billing flow." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border px-5 py-4 flex items-start gap-4"
        style={{ background: 'rgba(74,222,128,0.05)', borderColor: 'rgba(74,222,128,0.2)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(74,222,128,0.15)' }}>
          <Bot size={20} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="display font-semibold" style={{ color: 'var(--ink)' }}>Freight Quote Agent</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Simulates a provider-side AI agent charging 0.05 USDC per freight quote request.
            Settlement happens onchain; the mock quote is generated locally.
          </p>
        </div>
      </div>

      {/* Tab picker */}
      {ids.length > 0 ? (
        <TabSelector ids={ids} selectedId={selectedTabId} onSelect={setSelectedTabId} />
      ) : (
        <p className="text-sm rounded-xl px-4 py-3" style={{ background: 'var(--surface-muted)', color: 'var(--warn)', border: '1px solid var(--border)' }}>
          No provider tabs found. Open a tab from the Business view and set your wallet as the provider.
        </p>
      )}

      {/* Tab summary */}
      {tab && selectedTabId !== null && (
        <div className="rounded-xl px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <MiniStat label="Balance" value={`${fmtUsdc(tab.balance)} USDC`} />
          <MiniStat label="Max/charge" value={`${fmtUsdc(tab.maxPerCharge)} USDC`} />
          <MiniStat label="Status" value={getTabStatus(tab)} />
          <MiniStat label="Payer" value={shortAddr(tab.payer)} mono />
        </div>
      )}

      {/* CTA */}
      {phase !== 'done' ? (
        <button onClick={() => { void requestQuote() }} disabled={phase === 'pending' || selectedTabId === null}
          className="w-full py-4 rounded-2xl font-semibold text-base transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: phase === 'pending' ? 'var(--surface-strong)' : 'var(--accent)', color: phase === 'pending' ? 'var(--ink)' : '#080f18', border: '1px solid var(--border)' }}>
          {phase === 'pending' ? (
            <>
              <Clock size={16} className="animate-spin" />
              Charging 0.05 USDC &amp; generating quote…
            </>
          ) : (
            <>
              <Package size={16} />
              Request freight quote — 0.05 USDC
            </>
          )}
        </button>
      ) : (
        <button onClick={reset}
          className="w-full py-3 rounded-2xl text-sm font-medium transition-all"
          style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
          Request another quote
        </button>
      )}

      {/* Result */}
      {quote && receipt && (
        <QuoteCard quote={quote} receipt={receipt} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function Route({ origin, dest }: { origin: string; dest: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium" style={{ color: 'var(--ink)' }}>{origin}</span>
      <span style={{ color: 'var(--subtle)' }}>→</span>
      <span className="font-medium" style={{ color: 'var(--ink)' }}>{dest}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--subtle)' }}>{label}</p>
      <p className="font-semibold" style={{ color: 'var(--ink-2)' }}>{value}</p>
    </div>
  )
}

function ReceiptRow({ label, value, highlight = false, mono = false }: {
  label: string; value: string; highlight?: boolean; mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--subtle)' }}>{label}</span>
      <span className={`font-medium tabular-nums ${mono ? 'mono' : ''}`}
        style={{ color: highlight ? 'var(--accent)' : 'var(--ink-2)' }}>{value}</span>
    </div>
  )
}

function MiniStat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p style={{ color: 'var(--subtle)' }}>{label}</p>
      <p className={`font-semibold mt-0.5 ${mono ? 'mono' : ''}`} style={{ color: 'var(--ink-2)' }}>{value}</p>
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
