export type TabStatus = 'Active' | 'Paused' | 'Expired' | 'Closed'

export interface TabData {
  payer: `0x${string}`
  agent: `0x${string}`
  provider: `0x${string}`
  balance: bigint
  maxPerCharge: bigint
  dailyCap: bigint
  spentToday: bigint
  dayIndex: bigint
  expiry: bigint
  totalCharged: bigint
  chargeCount: bigint
  paused: boolean
  open: boolean
  label: string
}

export function getTabStatus(tab: TabData): TabStatus {
  if (!tab.open) return 'Closed'
  if (tab.paused) return 'Paused'
  if (tab.expiry > 0n && BigInt(Math.floor(Date.now() / 1000)) > tab.expiry) return 'Expired'
  return 'Active'
}

export const STATUS_COLORS: Record<TabStatus, string> = {
  Active: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50',
  Paused: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50',
  Expired: 'bg-red-900/50 text-red-300 border border-red-700/50',
  Closed: 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/50',
}
