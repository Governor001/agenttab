import { USDC_DECIMALS } from '../contracts/agentTab'

/** Format a raw uint256 (6 dec) as a human USDC string, e.g. "1.23" */
export function fmtUsdc(raw: bigint | undefined, decimals = 2): string {
  if (raw === undefined) return '—'
  const n = Number(raw) / 10 ** USDC_DECIMALS
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Parse a human USDC string to raw uint256 bigint */
export function parseUsdc(human: string): bigint {
  const n = parseFloat(human)
  if (isNaN(n) || n < 0) throw new Error('Invalid USDC amount')
  return BigInt(Math.round(n * 10 ** USDC_DECIMALS))
}

/** Short address: 0x1234…5678 */
export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Format a timestamp (seconds) as a date string, or "No expiry" for 0 */
export function fmtExpiry(ts: bigint): string {
  if (ts === 0n) return 'No expiry'
  return new Date(Number(ts) * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

/** Decode a bytes32 jobRef back to a utf8 string, stripping null bytes */
export function decodeJobRef(ref: `0x${string}`): string {
  try {
    const hex = ref.slice(2)
    const bytes = new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
    return new TextDecoder().decode(bytes).replace(/\0/g, '').trim() || ref.slice(0, 10) + '…'
  } catch {
    return ref.slice(0, 10) + '…'
  }
}

/** Encode a string as a left-padded bytes32 hex */
export function encodeJobRef(s: string): `0x${string}` {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(s.slice(0, 32))
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return `0x${hex.padEnd(64, '0')}`
}

export function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('denied')) return 'Transaction cancelled.'
  if (msg.includes('tabispaused')) return 'Tab is paused.'
  if (msg.includes('tabexpired')) return 'Tab has expired.'
  if (msg.includes('tabnotopen')) return 'Tab is not open.'
  if (msg.includes('dailycapexceeded')) return 'Daily cap exceeded.'
  if (msg.includes('invalidlimits')) return 'Invalid limits (maxPerCharge must be ≤ dailyCap).'
  if (msg.includes('invalidamount')) return 'Invalid amount.'
  if (msg.includes('notpayer')) return 'Only the payer can do this.'
  if (msg.includes('notprovider')) return 'Only the provider can charge.'
  if (msg.includes('notpayeroragent')) return 'Only the payer or agent can do this.'
  if (msg.includes('notpayerorprovider')) return 'Only the payer or provider can close the tab.'
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient USDC balance.'
  if (msg.includes('reverted')) return 'Transaction reverted. Check your inputs.'
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error. Please retry.'
  return 'Something went wrong. Please try again.'
}
